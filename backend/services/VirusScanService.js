/**
 * Virus Scanning Service using ClamAV
 * 
 * Provides malware detection for uploaded files using ClamAV antivirus engine.
 * Scans files before they are processed or uploaded to storage.
 * 
 * CONFIGURATION:
 * - Set DISABLE_VIRUS_SCAN=true to skip virus scanning (useful for deployments without ClamAV)
 * - ClamAV binary path is auto-detected, no hardcoding needed
 */

const NodeClam = require('clamscan');
const { systemLogger } = require('../utils/logger');
const { execSync } = require('child_process');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class VirusScanService {
  constructor() {
    this.clamav = null;
    this.initialized = false;
    this.initPromise = null;
    this.disabled = process.env.DISABLE_VIRUS_SCAN === 'true';
    this.unavailable = false; // Track if ClamAV is completely unavailable
  }

  /**
   * Auto-detect ClamAV binary path
   */
  detectClamScanPath() {
    try {
      const clamPath = execSync('which clamscan', { encoding: 'utf8' }).trim(); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command for ClamAV detection
      if (clamPath && fs.existsSync(clamPath)) {
        systemLogger.info('ClamAV binary detected', { path: clamPath });
        return clamPath;
      }
      return null;
    } catch (error) {
      systemLogger.warn('ClamAV binary not found in PATH', {
        error: error.message
      });
    }
    return null;
  }

  /**
   * Check if virus definitions exist and are valid
   */
  checkVirusDefinitions(dbPath) {
    try {
      if (!fs.existsSync(dbPath)) {
        return false;
      }
      const hasMain =
        fs.existsSync(path.join(dbPath, 'main.cvd')) ||
        fs.existsSync(path.join(dbPath, 'main.cld'));

      const hasDaily =
        fs.existsSync(path.join(dbPath, 'daily.cvd')) ||
        fs.existsSync(path.join(dbPath, 'daily.cld'));
      return hasMain || hasDaily;
    } catch (error) {
      systemLogger?.warn('Failed to check ClamAV definition files', {
        dbPath,
        error: error.message
      });
      return false; // explicit recovery
    }
  }

  /**
   * Initialize virus definitions by running the init script
   */
  async initializeVirusDefinitions() {
    return new Promise((resolve, reject) => {
      systemLogger.info('Initializing virus definitions...');
      
      const scriptPath = path.join(__dirname, '../../scripts/init-clamav.sh');
      
      if (!fs.existsSync(scriptPath)) {
        systemLogger.warn('ClamAV init script not found', { scriptPath });
        resolve(false);
        return;
      }

      exec(`bash ${scriptPath}`, { timeout: 300000 }, (error, stdout, stderr) => { // NOSONAR S4721 - Script path is validated and constructed securely, no user input
        if (error) {
          systemLogger.error('Failed to initialize virus definitions', { 
            error: error.message,
            stderr 
          });
          resolve(false);
          return;
        }
        
        systemLogger.info('Virus definitions initialized successfully', { stdout });
        resolve(true);
      });
    });
  }

  /**
   * Reset the scanner state to allow re-initialization
   * Call this if you want to retry after a previous failure
   */
  reset() {
    this.initialized = false;
    this.unavailable = false;
    this.initPromise = null;
    this.clamav = null;
    systemLogger.info('ClamAV scanner state reset');
  }

  /**
   * Initialize ClamAV scanner
   */
  async initialize() {
    if (this.initialized) {
      return this.clamav;
    }

    // If explicitly disabled, skip initialization
    if (this.disabled) {
      systemLogger.warn('Virus scanning is disabled (DISABLE_VIRUS_SCAN=true)');
      this.unavailable = true;
      return null;
    }

    // If previously marked unavailable but definitions might now exist, reset and retry
    if (this.unavailable && !this.initPromise) {
      const dbPath = '/home/runner/.clamav';
      if (this.checkVirusDefinitions(dbPath)) {
        systemLogger.info('Virus definitions now available, resetting unavailable state');
        this.unavailable = false;
      }
    }

    // If initialization is already in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        systemLogger.info('Initializing ClamAV scanner...');
        
        // Auto-detect clamscan binary path
        const clamScanPath = this.detectClamScanPath();
        
        if (!clamScanPath) {
          systemLogger.warn('ClamAV not available - virus scanning will be skipped');
          this.unavailable = true;
          return null;
        }

        const dbPath = '/home/runner/.clamav';
        
        // Check if virus definitions exist
        const hasDefinitions = this.checkVirusDefinitions(dbPath);
        
        if (!hasDefinitions) {
          systemLogger.warn('Virus definitions not found, attempting to download...');
          const initialized = await this.initializeVirusDefinitions();
          
          if (!initialized) {
            systemLogger.warn('Failed to initialize virus definitions - scanning will be skipped');
            this.unavailable = true;
            return null;
          }
          
          // Verify definitions were downloaded
          if (!this.checkVirusDefinitions(dbPath)) {
            systemLogger.warn('Virus definitions still not available after initialization');
            this.unavailable = true;
            return null;
          }
          
          systemLogger.info('Virus definitions successfully initialized');
        } else {
          systemLogger.info('Virus definitions found', { dbPath });
        }

        this.clamav = await new NodeClam().init({
          removeInfected: false, // Don't auto-delete, let us handle it
          quarantineInfected: false,
          scanLog: null,
          debugMode: false,
          clamscan: {
            path: clamScanPath, // Auto-detected path
            db: dbPath, // Custom virus definitions location
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
        systemLogger.warn('Virus scanning will be skipped - ClamAV unavailable');
        this.unavailable = true;
        return null;
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

      // If ClamAV is disabled or unavailable, allow file through with warning
      if (this.disabled || this.unavailable || !this.clamav) {
        systemLogger.warn('Virus scan skipped - ClamAV unavailable or disabled', { 
          filePath,
          disabled: this.disabled,
          unavailable: this.unavailable
        });
        
        return {
          isInfected: false,
          viruses: [],
          file: filePath,
          message: 'Virus scan skipped (ClamAV not available)',
          skipped: true
        };
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
      // log warning but allow file through
      if (error.message.includes('Error Code: 2') || 
          error.message.includes('database') ||
          error.message.includes('ENOENT')) {
        systemLogger.warn('ClamAV virus definitions not available - skipping scan', { filePath });
        
        return {
          isInfected: false,
          viruses: [],
          file: filePath,
          message: 'Virus scan skipped (ClamAV not fully configured)',
          skipped: true
        };
      }
      
      // For other errors, still allow file through with warning in production
      // This prevents ClamAV issues from blocking file uploads
      systemLogger.warn('Virus scan failed - allowing file through with warning', { 
        filePath, 
        error: error.message 
      });
      
      return {
        isInfected: false,
        viruses: [],
        file: filePath,
        message: 'Virus scan failed - file allowed with warning',
        skipped: true,
        error: error.message
      };
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
      
      if (this.disabled || this.unavailable || !this.clamav) {
        return 'ClamAV unavailable';
      }
      
      const version = await this.clamav.getVersion();
      return version;
    } catch (error) {
      systemLogger.error('Error getting ClamAV version', { error: error.message });
      return 'Unknown';
    }
  }

  /**
   * Check if virus scanning is available
   * @returns {boolean} True if scanning is available
   */
  isAvailable() {
    return !this.disabled && !this.unavailable && this.initialized;
  }
}

// Export singleton instance
module.exports = new VirusScanService();
