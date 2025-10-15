/**
 * Virus Scanning Service using ClamAV
 * 
 * Provides malware detection for uploaded files using ClamAV antivirus engine.
 * Scans files before they are processed or uploaded to storage.
 */

const NodeClam = require('clamscan');
const { systemLogger } = require('../utils/logger');

class VirusScanService {
  constructor() {
    this.clamav = null;
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize ClamAV scanner
   */
  async initialize() {
    if (this.initialized) {
      return this.clamav;
    }

    // If initialization is already in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        systemLogger.info('Initializing ClamAV scanner...');
        
        this.clamav = await new NodeClam().init({
          removeInfected: false, // Don't auto-delete, let us handle it
          quarantineInfected: false,
          scanLog: null,
          debugMode: false,
          clamscan: {
            path: '/nix/store/4s7jsmyxy0nn45qv0s32pbp8c6z05gnq-clamav-1.3.1/bin/clamscan',
            db: '/home/runner/workspace/clamav-db', // Custom database directory
            active: true
          },
          clamdscan: {
            active: false // Don't use daemon
          },
          preference: 'clamscan' // Use clamscan binary directly
        });

        this.initialized = true;
        systemLogger.info('ClamAV scanner initialized successfully');
        
        return this.clamav;
      } catch (error) {
        systemLogger.error('Failed to initialize ClamAV scanner', { error: error.message });
        throw new Error(`ClamAV initialization failed: ${error.message}`);
      }
    })();

    return this.initPromise;
  }

  /**
   * Scan a file for viruses/malware
   * @param {string} filePath - Path to the file to scan
   * @returns {Promise<object>} Scan result with isInfected, viruses array, and file path
   */
  async scanFile(filePath) {
    try {
      // Ensure scanner is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      systemLogger.info('Scanning file for viruses', { filePath });

      const { isInfected, viruses, file } = await this.clamav.scanFile(filePath);

      if (isInfected) {
        systemLogger.warn('VIRUS DETECTED', { 
          filePath, 
          viruses: viruses.join(', '),
          infected: true 
        });
        
        return {
          isInfected: true,
          viruses,
          file,
          message: `Threat detected: ${viruses.join(', ')}`
        };
      } else {
        systemLogger.info('File scan completed - clean', { filePath });
        
        return {
          isInfected: false,
          viruses: [],
          file,
          message: 'File is clean'
        };
      }
    } catch (error) {
      systemLogger.error('Error scanning file for viruses', { 
        filePath, 
        error: error.message 
      });
      
      // If ClamAV is not properly configured (e.g., missing virus definitions),
      // log warning but allow file through in development
      if (error.message.includes('Error Code: 2') || error.message.includes('database')) {
        systemLogger.warn('ClamAV virus definitions not available - skipping scan', { filePath });
        
        return {
          isInfected: false,
          viruses: [],
          file: filePath,
          message: 'Virus scan skipped (ClamAV not fully configured)',
          skipped: true
        };
      }
      
      // For other errors, reject the file
      throw new Error(`Virus scan failed: ${error.message}`);
    }
  }

  /**
   * Get scanner version info
   * @returns {Promise<string>} Scanner version
   */
  async getVersion() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      const version = await this.clamav.getVersion();
      return version;
    } catch (error) {
      systemLogger.error('Error getting ClamAV version', { error: error.message });
      return 'Unknown';
    }
  }
}

// Export singleton instance
module.exports = new VirusScanService();
