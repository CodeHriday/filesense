const pool = require('../db');
const { systemLogger } = require('../utils/logger');

class EmailDomainValidationService {
  constructor() {
    this.cachedDomains = null;
    this.cacheExpiry = null;
    this.cacheTTL = 5 * 60 * 1000;
  }

  async getAllowedDomains() {
    if (this.cachedDomains && this.cacheExpiry && Date.now() < this.cacheExpiry) {
      return this.cachedDomains;
    }

    try {
      const result = await pool.query(`
        SELECT domain FROM allowed_email_domains WHERE is_active = true
      `);
      
      this.cachedDomains = result.rows.map(r => r.domain.toLowerCase());
      this.cacheExpiry = Date.now() + this.cacheTTL;
      
      return this.cachedDomains;
    } catch (error) {
      systemLogger.error('Error fetching allowed email domains', { error: error.message });
      return [];
    }
  }

  extractDomain(email) {
    if (!email || typeof email !== 'string') {
      return null;
    }
    const parts = email.split('@');
    return parts.length === 2 ? parts[1].toLowerCase() : null;
  }

  async validateEmails(emails) {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return { valid: true, invalidEmails: [], message: 'No emails to validate' };
    }

    const allowedDomains = await this.getAllowedDomains();
    
    if (allowedDomains.length === 0) {
      return { 
        valid: true, 
        invalidEmails: [], 
        message: 'No domain restrictions configured - all domains allowed' 
      };
    }

    const invalidEmails = [];
    const validEmails = [];

    for (const email of emails) {
      const domain = this.extractDomain(email);
      
      if (!domain) {
        invalidEmails.push({
          email,
          reason: 'Invalid email format'
        });
        continue;
      }

      if (allowedDomains.includes(domain)) {
        validEmails.push(email);
      } else {
        invalidEmails.push({
          email,
          domain,
          reason: `Domain '${domain}' is not in the allowed list. Allowed domains: ${allowedDomains.join(', ')}`
        });
      }
    }

    return {
      valid: invalidEmails.length === 0,
      validEmails,
      invalidEmails,
      allowedDomains
    };
  }

  async validateAndFilterEmails(emails) {
    const result = await this.validateEmails(emails);
    
    if (!result.valid && result.invalidEmails.length > 0) {
      systemLogger.warn('Some email recipients were filtered due to domain restrictions', {
        invalidEmails: result.invalidEmails
      });
    }
    
    return {
      ...result,
      filteredEmails: result.validEmails || emails
    };
  }

  clearCache() {
    this.cachedDomains = null;
    this.cacheExpiry = null;
  }
}

module.exports = new EmailDomainValidationService();
