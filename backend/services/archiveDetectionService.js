const fs = require('fs');
const path = require('path');
const fileType = require('file-type');
const AdmZip = require('adm-zip');

const MAGIC_BYTES = {
  ZIP: [0x50, 0x4b, 0x03, 0x04],
  ZIP_EMPTY: [0x50, 0x4b, 0x05, 0x06],
  ZIP_SPANNED: [0x50, 0x4b, 0x07, 0x08],
  GZIP: [0x1f, 0x8b],
  BZIP2: [0x42, 0x5a],
  SEVEN_ZIP: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
  RAR_V4: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00],
  RAR_V5: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00],
  TAR: null
};

const SUPPORTED_FORMATS = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2', 'tgz', 'tbz2'];
const ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.tar', '.gz', '.bz2', '.tgz', '.tbz2', '.rar'];

class ArchiveDetectionService {
  constructor(logger = null) {
    this.logger = logger || console;
  }

  async detectArchiveType(filePath) {
    try {
      const buffer = await this.readFileHeader(filePath, 16);
      const fileName = path.basename(filePath);
      const extension = path.extname(fileName).toLowerCase();

      let archiveType = null;
      let isArchive = false;

      if (this.matchesMagicBytes(buffer, MAGIC_BYTES.ZIP) || 
          this.matchesMagicBytes(buffer, MAGIC_BYTES.ZIP_EMPTY) || 
          this.matchesMagicBytes(buffer, MAGIC_BYTES.ZIP_SPANNED)) {
        archiveType = 'zip';
        isArchive = true;
      } else if (this.matchesMagicBytes(buffer, MAGIC_BYTES.SEVEN_ZIP)) {
        archiveType = '7z';
        isArchive = true;
      } else if (this.matchesMagicBytes(buffer, MAGIC_BYTES.RAR_V4) || 
                 this.matchesMagicBytes(buffer, MAGIC_BYTES.RAR_V5)) {
        archiveType = 'rar';
        isArchive = true;
      } else if (this.matchesMagicBytes(buffer, MAGIC_BYTES.GZIP)) {
        if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
          archiveType = 'tar.gz';
        } else {
          archiveType = 'gzip';
        }
        isArchive = true;
      } else if (this.matchesMagicBytes(buffer, MAGIC_BYTES.BZIP2)) {
        if (fileName.endsWith('.tar.bz2') || fileName.endsWith('.tbz2')) {
          archiveType = 'tar.bz2';
        } else {
          archiveType = 'bzip2';
        }
        isArchive = true;
      } else if (extension === '.tar') {
        archiveType = 'tar';
        isArchive = true;
      } else if (ARCHIVE_EXTENSIONS.includes(extension)) {
        archiveType = extension.substring(1);
        isArchive = true;
      }

      return {
        isArchive,
        archiveType,
        fileName,
        extension
      };
    } catch (error) {
      this.logger.error('Error detecting archive type', {
        filePath,
        error: error.message
      });
      throw new Error(`Failed to detect archive type: ${error.message}`);
    }
  }

  async isPasswordProtected(filePath, archiveType) {
    try {
      switch (archiveType) {
        case 'zip':
          return await this.isZipPasswordProtected(filePath);
        
        case '7z':
          return await this.is7zPasswordProtected(filePath);
        
        case 'rar':
          return {
            isEncrypted: true,
            needsPassword: true,
            reason: 'RAR format detection - password protection cannot be verified without extraction attempt'
          };
        
        case 'tar':
        case 'tar.gz':
        case 'tar.bz2':
          return {
            isEncrypted: false,
            needsPassword: false,
            reason: 'TAR archives do not support native encryption'
          };
        
        default:
          return {
            isEncrypted: false,
            needsPassword: false,
            reason: 'Unknown or unsupported archive format'
          };
      }
    } catch (error) {
      this.logger.error('Error checking password protection', {
        filePath,
        archiveType,
        error: error.message
      });
      return {
        isEncrypted: false,
        needsPassword: false,
        error: error.message
      };
    }
  }

  async isZipPasswordProtected(filePath) {
    try {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();

      if (zipEntries.length === 0) {
        return {
          isEncrypted: false,
          needsPassword: false,
          reason: 'Empty ZIP archive'
        };
      }

      let hasEncryptedFiles = false;
      for (const entry of zipEntries) {
        if (entry.isEncrypted || entry.header.encrypted) {
          hasEncryptedFiles = true;
          break;
        }
      }

      return {
        isEncrypted: hasEncryptedFiles,
        needsPassword: hasEncryptedFiles,
        reason: hasEncryptedFiles ? 'ZIP contains encrypted entries' : 'ZIP is not encrypted'
      };
    } catch (error) {
      if (error.message && error.message.includes('encrypted')) {
        return {
          isEncrypted: true,
          needsPassword: true,
          reason: 'ZIP encryption detected via error message'
        };
      }
      throw error;
    }
  }

  async is7zPasswordProtected(filePath) {
    const buffer = await fs.promises.readFile(filePath);
    
    const signatureOffset = buffer.indexOf(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]));
    if (signatureOffset === -1) {
      return {
        isEncrypted: false,
        needsPassword: false,
        reason: '7z signature not found'
      };
    }

    const headerOffset = signatureOffset + 12;
    if (headerOffset + 20 > buffer.length) {
      return {
        isEncrypted: false,
        needsPassword: false,
        reason: '7z header incomplete'
      };
    }

    const headerBytes = buffer.slice(headerOffset, headerOffset + 200);
    
    const aesPattern = Buffer.from([0x06, 0xf1, 0x07, 0x01]);
    const hasAES = headerBytes.indexOf(aesPattern) !== -1;
    
    const encryptionMarkers = [
      Buffer.from([0x17]),
      Buffer.from([0x06]),
    ];
    
    let hasEncryptionMarker = false;
    for (const marker of encryptionMarkers) {
      if (headerBytes.indexOf(marker) !== -1) {
        hasEncryptionMarker = true;
        break;
      }
    }

    const isEncrypted = hasAES || hasEncryptionMarker;

    return {
      isEncrypted,
      needsPassword: isEncrypted,
      reason: isEncrypted ? '7z encryption detected in header' : '7z is not encrypted'
    };
  }

  matchesMagicBytes(buffer, magicBytes) {
    if (!magicBytes || !buffer || buffer.length === 0) {
      return false;
    }
    
    if (buffer.length < magicBytes.length) {
      return false;
    }
    
    for (let i = 0; i < magicBytes.length; i++) {
      if (buffer[i] !== magicBytes[i]) {
        return false;
      }
    }
    
    return true;
  }

  async readFileHeader(filePath, bytes = 16) {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      await fd.read(buffer, 0, bytes, 0);
      return buffer;
    } finally {
      await fd.close();
    }
  }

  isSupportedFormat(archiveType) {
    return SUPPORTED_FORMATS.includes(archiveType);
  }

  async analyzeArchive(filePath) {
    const detection = await this.detectArchiveType(filePath);
    
    if (!detection.isArchive) {
      return {
        isArchive: false,
        archiveType: null,
        isSupported: false,
        isEncrypted: false,
        needsPassword: false
      };
    }

    const isSupported = this.isSupportedFormat(detection.archiveType);
    
    let passwordInfo = {
      isEncrypted: false,
      needsPassword: false,
      reason: 'Not checked'
    };

    if (isSupported) {
      passwordInfo = await this.isPasswordProtected(filePath, detection.archiveType);
    }

    return {
      isArchive: true,
      archiveType: detection.archiveType,
      fileName: detection.fileName,
      extension: detection.extension,
      isSupported,
      isEncrypted: passwordInfo.isEncrypted,
      needsPassword: passwordInfo.needsPassword,
      encryptionReason: passwordInfo.reason,
      error: passwordInfo.error
    };
  }
}

module.exports = ArchiveDetectionService;
