const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');
const tar = require('tar-stream');
const gunzip = require('gunzip-maybe');
const { spawn } = require('child_process');
const ArchiveDetectionService = require('./archiveDetectionService');

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const EXTRACTION_TEMP_DIR = path.join(__dirname, '../../uploads/archive_extraction');

class ArchiveExtractionService {
  constructor(dbPool, virusScanService, logger = null) {
    this.dbPool = dbPool;
    this.virusScanService = virusScanService;
    this.logger = logger || console;
    this.archiveDetector = new ArchiveDetectionService(logger);
    
    if (!fs.existsSync(EXTRACTION_TEMP_DIR)) {
      fs.mkdirSync(EXTRACTION_TEMP_DIR, { recursive: true });
    }
  }

  async createExtractionRecord(fileId, archiveType, isEncrypted) {
    try {
      const result = await this.dbPool.query(
        `INSERT INTO archive_extractions (
          file_id,
          archive_type,
          is_encrypted,
          password_required,
          extraction_status,
          started_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *`,
        [fileId, archiveType, isEncrypted, isEncrypted, 'in_progress']
      );

      this.logger.info('Archive extraction record created', {
        extractionId: result.rows[0].id,
        fileId,
        archiveType
      });

      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to create extraction record', {
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  async updateExtractionRecord(extractionId, updates) {
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        setClauses.push(`${key} = $${paramIndex++}`);
        values.push(value);
      });

      setClauses.push(`updated_at = NOW()`);
      values.push(extractionId);

      const query = `
        UPDATE archive_extractions
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.dbPool.query(query, values);

      if (result.rows.length > 0) {
        this.logger.info('Archive extraction record updated', {
          extractionId: result.rows[0].id,
          fileId: result.rows[0].file_id,
          updates
        });
        return result.rows[0];
      }

      this.logger.warn('No extraction record found to update', {
        extractionId
      });
      return null;
    } catch (error) {
      this.logger.error('Failed to update extraction record', {
        extractionId,
        error: error.message
      });
      throw error;
    }
  }

  async extractArchive(archiveFilePath, archiveFileId, password = null, userId = null) {
    let extractedFiles = [];
    let tempDir = null;
    let extractionRecord = null;

    try {
      const archiveInfo = await this.archiveDetector.analyzeArchive(archiveFilePath);
      
      if (!archiveInfo.isArchive) {
        throw new Error('File is not a valid archive');
      }

      if (!archiveInfo.isSupported) {
        throw new Error(`Archive format ${archiveInfo.archiveType} is not supported`);
      }

      const fileStats = await fs.promises.stat(archiveFilePath);
      if (fileStats.size > MAX_FILE_SIZE) {
        throw new Error(`Archive size ${(fileStats.size / 1024 / 1024).toFixed(2)} MB exceeds maximum limit of 25 MB`);
      }

      extractionRecord = await this.createExtractionRecord(
        archiveFileId,
        archiveInfo.archiveType,
        archiveInfo.isEncrypted || false
      );

      tempDir = path.join(EXTRACTION_TEMP_DIR, `extract_${Date.now()}_${Math.random().toString(36).substring(7)}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      this.logger.info('Starting archive extraction', {
        archiveFileId,
        extractionId: extractionRecord.id,
        archiveType: archiveInfo.archiveType,
        tempDir
      });

      switch (archiveInfo.archiveType) {
        case 'zip':
          extractedFiles = await this.extractZip(archiveFilePath, tempDir, password);
          break;
        
        case 'tar':
          extractedFiles = await this.extractTar(archiveFilePath, tempDir);
          break;
        
        case 'tar.gz':
        case 'tgz':
          extractedFiles = await this.extractTarGz(archiveFilePath, tempDir);
          break;
        
        case 'tar.bz2':
        case 'tbz2':
          extractedFiles = await this.extractTarBz2(archiveFilePath, tempDir);
          break;
        
        case '7z':
          extractedFiles = await this.extract7z(archiveFilePath, tempDir, password);
          break;
        
        default:
          throw new Error(`Unsupported archive type: ${archiveInfo.archiveType}`);
      }

      const processedFiles = [];
      
      for (let i = 0; i < extractedFiles.length; i++) {
        const extractedFile = extractedFiles[i];
        
        try {
          const scanResult = await this.virusScanService.scanFile(extractedFile.fullPath);
          
          if (scanResult.isInfected) {
            this.logger.warn('Virus detected in extracted file', {
              archiveFileId,
              fileName: extractedFile.relativePath,
              viruses: scanResult.viruses
            });
            
            await fs.promises.unlink(extractedFile.fullPath).catch(() => {});
            continue;
          }
          
          if (scanResult.skipped) {
            this.logger.warn('Virus scan skipped for extracted file', {
              archiveFileId,
              fileName: extractedFile.relativePath,
              reason: 'Virus definitions unavailable'
            });
          }

          const checksum = await this.calculateChecksum(extractedFile.fullPath);
          const fileStats = await fs.promises.stat(extractedFile.fullPath);

          const fileRecord = await this.createFileRecord(
            archiveFileId,
            extractedFile.relativePath,
            extractedFile.fullPath,
            checksum,
            fileStats.size,
            i,
            userId
          );

          processedFiles.push({
            ...extractedFile,
            fileId: fileRecord.id,
            checksum,
            size: fileStats.size,
            virusScanPassed: true
          });

          this.logger.info('Extracted file processed successfully', {
            archiveFileId,
            fileName: extractedFile.relativePath,
            fileId: fileRecord.id
          });

        } catch (error) {
          this.logger.error('Error processing extracted file', {
            archiveFileId,
            fileName: extractedFile.relativePath,
            error: error.message
          });
          
          await fs.promises.unlink(extractedFile.fullPath).catch(() => {});
        }
      }

      if (extractionRecord) {
        await this.updateExtractionRecord(extractionRecord.id, {
          extraction_status: 'completed',
          extracted_count: processedFiles.length,
          completed_at: new Date(),
          error_message: null
        });
      }

      return {
        success: true,
        extractedCount: processedFiles.length,
        files: processedFiles
      };

    } catch (error) {
      this.logger.error('Archive extraction failed', {
        archiveFileId,
        error: error.message
      });

      if (extractionRecord) {
        await this.updateExtractionRecord(extractionRecord.id, {
          extraction_status: 'failed',
          completed_at: new Date(),
          error_message: error.message
        });
      }

      throw error;

    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch((err) => {
          this.logger.error('Failed to cleanup temp directory', {
            tempDir,
            error: err.message
          });
        });
      }
    }
  }

  async extractZip(archiveFilePath, outputDir, password = null) {
    return new Promise((resolve, reject) => {
      const extractedFiles = [];
      const logger = this.logger;
      const openOptions = {
        lazyEntries: true
      };

      const handleOpen = (err, zipfile) => {
        if (err) {
          if (err.message && (err.message.toLowerCase().includes('encrypted') || err.message.toLowerCase().includes('wrong password'))) {
            return reject(new Error('ARCHIVE_PASSWORD_REQUIRED: Archive is password-protected but no valid password was provided'));
          }
          return reject(new Error(`Failed to open ZIP: ${err.message}`));
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }

          if (entry.fileName.includes('..') || path.isAbsolute(entry.fileName)) {
            logger.warn('Skipping potentially malicious path', {
              entryName: entry.fileName
            });
            zipfile.readEntry();
            return;
          }

          const sanitizedName = path.basename(entry.fileName);
          const outputPath = path.join(outputDir, sanitizedName);

          // Check if entry is encrypted (bit 0 of generalPurposeBitFlag)
          const isEntryEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
          
          // Only apply decrypt options for encrypted entries
          const openReadStreamOptions = (password && isEntryEncrypted) 
            ? { decrypt: true, password: Buffer.from(password, 'utf-8') } 
            : {};

          zipfile.openReadStream(entry, openReadStreamOptions, (err, readStream) => {
            if (err) {
              if (err.message && err.message.toLowerCase().includes('password')) {
                zipfile.close();
                return reject(new Error('ARCHIVE_PASSWORD_REQUIRED: Incorrect password or encrypted entry'));
              }
              logger.error('Error opening ZIP entry stream', {
                fileName: entry.fileName,
                error: err.message
              });
              zipfile.readEntry();
              return;
            }

            const writeStream = fs.createWriteStream(outputPath);
            readStream.pipe(writeStream);

            writeStream.on('finish', () => {
              extractedFiles.push({
                relativePath: entry.fileName,
                fileName: sanitizedName,
                fullPath: outputPath,
                originalSize: entry.uncompressedSize
              });
              zipfile.readEntry();
            });

            writeStream.on('error', (error) => {
              logger.error('Error writing ZIP entry', {
                fileName: entry.fileName,
                error: error.message
              });
              zipfile.readEntry();
            });
          });
        });

        zipfile.on('end', () => {
          resolve(extractedFiles);
        });

        zipfile.on('error', (error) => {
          reject(new Error(`ZIP extraction error: ${error.message}`));
        });
      };

      yauzl.open(archiveFilePath, openOptions, handleOpen);
    });
  }

  async extractTar(archiveFilePath, outputDir) {
    return new Promise((resolve, reject) => {
      const extractedFiles = [];
      const extract = tar.extract();

      extract.on('entry', async (header, stream, next) => {
        if (header.type !== 'file') {
          stream.resume();
          return next();
        }

        if (header.name.includes('..') || path.isAbsolute(header.name)) {
          this.logger.warn('Skipping potentially malicious path', {
            entryName: header.name
          });
          stream.resume();
          return next();
        }

        const sanitizedName = path.basename(header.name);
        const outputPath = path.join(outputDir, sanitizedName);

        try {
          const writeStream = fs.createWriteStream(outputPath);
          stream.pipe(writeStream);

          writeStream.on('finish', () => {
            extractedFiles.push({
              relativePath: header.name,
              fileName: sanitizedName,
              fullPath: outputPath,
              originalSize: header.size
            });
            next();
          });

          writeStream.on('error', (error) => {
            this.logger.error('Error writing extracted file', { error: error.message });
            next();
          });

        } catch (error) {
          this.logger.error('Error extracting tar entry', { error: error.message });
          stream.resume();
          next();
        }
      });

      extract.on('finish', () => {
        resolve(extractedFiles);
      });

      extract.on('error', (error) => {
        reject(new Error(`TAR extraction failed: ${error.message}`));
      });

      fs.createReadStream(archiveFilePath).pipe(extract);
    });
  }

  async extractTarGz(archiveFilePath, outputDir) {
    return new Promise((resolve, reject) => {
      const extractedFiles = [];
      const extract = tar.extract();

      extract.on('entry', async (header, stream, next) => {
        if (header.type !== 'file') {
          stream.resume();
          return next();
        }

        if (header.name.includes('..') || path.isAbsolute(header.name)) {
          this.logger.warn('Skipping potentially malicious path', {
            entryName: header.name
          });
          stream.resume();
          return next();
        }

        const sanitizedName = path.basename(header.name);
        const outputPath = path.join(outputDir, sanitizedName);

        try {
          const writeStream = fs.createWriteStream(outputPath);
          stream.pipe(writeStream);

          writeStream.on('finish', () => {
            extractedFiles.push({
              relativePath: header.name,
              fileName: sanitizedName,
              fullPath: outputPath,
              originalSize: header.size
            });
            next();
          });

          writeStream.on('error', (error) => {
            this.logger.error('Error writing extracted file', { error: error.message });
            next();
          });

        } catch (error) {
          this.logger.error('Error extracting tar.gz entry', { error: error.message });
          stream.resume();
          next();
        }
      });

      extract.on('finish', () => {
        resolve(extractedFiles);
      });

      extract.on('error', (error) => {
        reject(new Error(`TAR.GZ extraction failed: ${error.message}`));
      });

      fs.createReadStream(archiveFilePath)
        .pipe(gunzip())
        .pipe(extract);
    });
  }

  async extractTarBz2(archiveFilePath, outputDir) {
    return new Promise((resolve, reject) => {
      const extractedFiles = [];
      const extract = tar.extract();

      extract.on('entry', async (header, stream, next) => {
        if (header.type !== 'file') {
          stream.resume();
          return next();
        }

        if (header.name.includes('..') || path.isAbsolute(header.name)) {
          this.logger.warn('Skipping potentially malicious path', {
            entryName: header.name
          });
          stream.resume();
          return next();
        }

        const sanitizedName = path.basename(header.name);
        const outputPath = path.join(outputDir, sanitizedName);

        try {
          const writeStream = fs.createWriteStream(outputPath);
          stream.pipe(writeStream);

          writeStream.on('finish', () => {
            extractedFiles.push({
              relativePath: header.name,
              fileName: sanitizedName,
              fullPath: outputPath,
              originalSize: header.size
            });
            next();
          });

          writeStream.on('error', (error) => {
            this.logger.error('Error writing extracted file', { error: error.message });
            next();
          });

        } catch (error) {
          this.logger.error('Error extracting tar.bz2 entry', { error: error.message });
          stream.resume();
          next();
        }
      });

      extract.on('finish', () => {
        resolve(extractedFiles);
      });

      extract.on('error', (error) => {
        reject(new Error(`TAR.BZ2 extraction failed: ${error.message}`));
      });

      const bunzip2 = spawn('bunzip2', ['-c', archiveFilePath]);
      bunzip2.stdout.pipe(extract);
      
      bunzip2.stderr.on('data', (data) => {
        this.logger.error('bunzip2 error', { error: data.toString() });
      });

      bunzip2.on('error', (error) => {
        reject(new Error(`bunzip2 failed: ${error.message}`));
      });
    });
  }

  async extract7z(archiveFilePath, outputDir, password = null) {
    const sevenZip = require('node-7z-archive');
    
    return new Promise((resolve, reject) => {
      const options = password ? { password } : {};
      const extractStream = sevenZip.extractFull(archiveFilePath, outputDir, options);
      const extractedFiles = [];

      extractStream.on('data', (data) => {
        this.logger.debug('7z extraction progress', { file: data.file });
      });

      extractStream.on('end', async () => {
        try {
          const files = await fs.promises.readdir(outputDir);
          
          for (const file of files) {
            const filePath = path.join(outputDir, file);
            const stats = await fs.promises.stat(filePath);
            
            if (stats.isFile()) {
              extractedFiles.push({
                relativePath: file,
                fileName: file,
                fullPath: filePath,
                originalSize: stats.size
              });
            }
          }
          
          resolve(extractedFiles);
        } catch (error) {
          reject(new Error(`Failed to read extracted 7z files: ${error.message}`));
        }
      });

      extractStream.on('error', (error) => {
        if (error.message && (error.message.includes('password') || error.message.includes('encrypted'))) {
          reject(new Error('ARCHIVE_PASSWORD_REQUIRED: Archive is password-protected but no password was provided'));
        } else {
          reject(new Error(`7z extraction failed: ${error.message}`));
        }
      });
    });
  }

  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async createFileRecord(parentArchiveId, relativePath, filePath, checksum, size, extractionOrder, userId) {
    const fileName = path.basename(relativePath);
    const fileExt = path.extname(fileName).substring(1);
    
    const result = await this.dbPool.query(
      `INSERT INTO archive_members (
        parent_file_id,
        logical_name,
        original_name,
        file_format,
        file_size_bytes,
        extraction_status,
        extracted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *`,
      [parentArchiveId, relativePath, fileName, fileExt || null, size, 'completed']
    );

    return result.rows[0];
  }
}

module.exports = ArchiveExtractionService;
