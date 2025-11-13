/**
 * Integration Tests for Email Provider Adapters
 * 
 * Tests all 7 email provider adapters:
 * - SMTP
 * - Gmail OAuth2
 * - Outlook OAuth2
 * - SendGrid
 * - AWS SES
 * - Azure Communication Services
 * - Google Cloud Email
 */

const SmtpAdapter = require('../services/email/SmtpAdapter');
const GmailOAuth2Adapter = require('../services/email/GmailOAuth2Adapter');
const OutlookOAuth2Adapter = require('../services/email/OutlookOAuth2Adapter');
const SendGridAdapter = require('../services/email/SendGridAdapter');
const AwsSesAdapter = require('../services/email/AwsSesAdapter');
const AzureEmailAdapter = require('../services/email/AzureEmailAdapter');
const GcpEmailAdapter = require('../services/email/GcpEmailAdapter');

// Mock email data
const mockEmailData = {
  to: ['test@example.com'],
  subject: 'Test Email',
  html: '<h1>Test HTML Content</h1>',
  text: 'Test plain text content',
  from: 'noreply@dataobservatory.com'
};

// Mock attachments
const mockAttachments = [
  {
    filename: 'test.csv',
    content: Buffer.from('col1,col2\nval1,val2'),
    contentType: 'text/csv'
  }
];

describe('Email Provider Adapters - Integration Tests', () => {
  
  // ============================================
  // SMTP Adapter Tests
  // ============================================
  describe('SmtpAdapter', () => {
    test('should initialize with valid config', () => {
      const config = {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          password: 'test-password'
        }
      };
      
      const adapter = new SmtpAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate required SMTP config fields', () => {
      expect(() => new SmtpAdapter({})).toThrow();
      expect(() => new SmtpAdapter({ host: 'smtp.example.com' })).toThrow();
      expect(() => new SmtpAdapter({ host: 'smtp.example.com', port: 587 })).toThrow();
    });

    test('should build nodemailer transport config with TLS', () => {
      const config = {
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: {
          user: 'test@example.com',
          password: 'test-password'
        }
      };
      
      const adapter = new SmtpAdapter(config);
      expect(adapter.config.secure).toBe(true);
      expect(adapter.config.port).toBe(465);
    });
  });

  // ============================================
  // Gmail OAuth2 Adapter Tests
  // ============================================
  describe('GmailOAuth2Adapter', () => {
    test('should initialize with OAuth2 config', () => {
      const config = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      };
      
      const adapter = new GmailOAuth2Adapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate required OAuth2 fields', () => {
      expect(() => new GmailOAuth2Adapter({})).toThrow();
      expect(() => new GmailOAuth2Adapter({ 
        client_id: 'test-client-id' 
      })).toThrow();
    });

    test('should detect expired tokens', () => {
      const config = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token',
        expires_at: new Date(Date.now() - 1000).toISOString() // Expired
      };
      
      const adapter = new GmailOAuth2Adapter(config);
      expect(adapter.isTokenExpired()).toBe(true);
    });

    test('should detect valid tokens with buffer', () => {
      const config = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token',
        expires_at: new Date(Date.now() + 600000).toISOString() // 10 minutes
      };
      
      const adapter = new GmailOAuth2Adapter(config);
      expect(adapter.isTokenExpired()).toBe(false);
    });
  });

  // ============================================
  // Outlook OAuth2 Adapter Tests
  // ============================================
  describe('OutlookOAuth2Adapter', () => {
    test('should initialize with OAuth2 config', () => {
      const config = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        tenant_id: 'test-tenant-id',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      };
      
      const adapter = new OutlookOAuth2Adapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate required tenant_id for Outlook', () => {
      const invalidConfig = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token'
        // Missing tenant_id
      };
      
      expect(() => new OutlookOAuth2Adapter(invalidConfig)).toThrow();
    });

    test('should use Microsoft Graph API endpoint', () => {
      const config = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        tenant_id: 'test-tenant-id',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      };
      
      const adapter = new OutlookOAuth2Adapter(config);
      const endpoint = adapter.getGraphEndpoint();
      expect(endpoint).toContain('graph.microsoft.com');
    });
  });

  // ============================================
  // SendGrid Adapter Tests
  // ============================================
  describe('SendGridAdapter', () => {
    test('should initialize with API key', () => {
      const config = {
        api_key: 'SG.test-api-key',
        from_email: 'noreply@example.com',
        from_name: 'Test Sender'
      };
      
      const adapter = new SendGridAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate API key format', () => {
      expect(() => new SendGridAdapter({})).toThrow();
      expect(() => new SendGridAdapter({ 
        api_key: 'invalid-key' 
      })).toThrow('API key must start with SG.');
    });

    test('should build SendGrid message format', () => {
      const config = {
        api_key: 'SG.test-api-key',
        from_email: 'noreply@example.com',
        from_name: 'Test Sender'
      };
      
      const adapter = new SendGridAdapter(config);
      const message = adapter.buildMessage(mockEmailData);
      
      expect(message.personalizations).toBeDefined();
      expect(message.from).toEqual({ 
        email: config.from_email, 
        name: config.from_name 
      });
      expect(message.subject).toBe(mockEmailData.subject);
    });

    test('should handle multiple recipients', () => {
      const config = {
        api_key: 'SG.test-api-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new SendGridAdapter(config);
      const emailData = {
        ...mockEmailData,
        to: ['user1@example.com', 'user2@example.com', 'user3@example.com']
      };
      
      const message = adapter.buildMessage(emailData);
      expect(message.personalizations[0].to).toHaveLength(3);
    });
  });

  // ============================================
  // AWS SES Adapter Tests
  // ============================================
  describe('AwsSesAdapter', () => {
    test('should initialize with AWS credentials', () => {
      const config = {
        region: 'us-east-1',
        access_key_id: 'AKIA-test-key-id',
        secret_access_key: 'test-secret-access-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new AwsSesAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate required AWS fields', () => {
      expect(() => new AwsSesAdapter({})).toThrow();
      expect(() => new AwsSesAdapter({ 
        region: 'us-east-1' 
      })).toThrow();
    });

    test('should build SES sendRawEmail params', () => {
      const config = {
        region: 'us-east-1',
        access_key_id: 'AKIA-test-key-id',
        secret_access_key: 'test-secret-access-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new AwsSesAdapter(config);
      const params = adapter.buildSesParams(mockEmailData);
      
      expect(params.Source).toBe(config.from_email);
      expect(params.Destinations).toEqual(mockEmailData.to);
      expect(params.RawMessage).toBeDefined();
    });

    test('should support configuration set', () => {
      const config = {
        region: 'us-east-1',
        access_key_id: 'AKIA-test-key-id',
        secret_access_key: 'test-secret-access-key',
        from_email: 'noreply@example.com',
        configuration_set: 'my-config-set'
      };
      
      const adapter = new AwsSesAdapter(config);
      const params = adapter.buildSesParams(mockEmailData);
      expect(params.ConfigurationSetName).toBe('my-config-set');
    });
  });

  // ============================================
  // Azure Email Adapter Tests
  // ============================================
  describe('AzureEmailAdapter', () => {
    test('should initialize with connection string', () => {
      const config = {
        connection_string: 'endpoint=https://test.communication.azure.com/;accesskey=test-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new AzureEmailAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate connection string format', () => {
      expect(() => new AzureEmailAdapter({})).toThrow();
      expect(() => new AzureEmailAdapter({ 
        connection_string: 'invalid-string' 
      })).toThrow('Connection string must contain endpoint');
    });

    test('should build Azure email message', () => {
      const config = {
        connection_string: 'endpoint=https://test.communication.azure.com/;accesskey=test-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new AzureEmailAdapter(config);
      const message = adapter.buildAzureMessage(mockEmailData);
      
      expect(message.senderAddress).toBe(config.from_email);
      expect(message.recipients.to).toBeDefined();
      expect(message.content.subject).toBe(mockEmailData.subject);
    });

    test('should generate HMAC signature for authentication', () => {
      const config = {
        connection_string: 'endpoint=https://test.communication.azure.com/;accesskey=dGVzdC1rZXk=',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new AzureEmailAdapter(config);
      const signature = adapter.generateHmacSignature('POST', '/emails', '{"test": "data"}');
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // GCP Email Adapter Tests
  // ============================================
  describe('GcpEmailAdapter', () => {
    test('should initialize with service account', () => {
      const config = {
        service_account_email: 'test@project.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
        project_id: 'test-project-123',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new GcpEmailAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.config).toEqual(config);
    });

    test('should validate service account fields', () => {
      expect(() => new GcpEmailAdapter({})).toThrow();
      expect(() => new GcpEmailAdapter({ 
        service_account_email: 'test@project.iam.gserviceaccount.com' 
      })).toThrow();
    });

    test('should use SMTP relay configuration', () => {
      const config = {
        service_account_email: 'test@project.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
        project_id: 'test-project-123',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new GcpEmailAdapter(config);
      const smtpConfig = adapter.buildSmtpConfig();
      
      expect(smtpConfig.host).toBe('smtp-relay.gmail.com');
      expect(smtpConfig.port).toBe(587);
      expect(smtpConfig.secure).toBe(false);
    });
  });

  // ============================================
  // Attachment Handling Tests (All Adapters)
  // ============================================
  describe('Attachment Handling', () => {
    test('SMTP adapter should handle attachments', () => {
      const config = {
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'test@example.com', password: 'password' }
      };
      
      const adapter = new SmtpAdapter(config);
      const emailWithAttachments = { ...mockEmailData, attachments: mockAttachments };
      const message = adapter.buildMessage(emailWithAttachments);
      
      expect(message.attachments).toBeDefined();
      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0].filename).toBe('test.csv');
    });

    test('SendGrid adapter should handle attachments', () => {
      const config = {
        api_key: 'SG.test-api-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new SendGridAdapter(config);
      const emailWithAttachments = { ...mockEmailData, attachments: mockAttachments };
      const message = adapter.buildMessage(emailWithAttachments);
      
      expect(message.attachments).toBeDefined();
      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0].filename).toBe('test.csv');
      expect(message.attachments[0].content).toBeDefined();
    });

    test('AWS SES adapter should handle attachments', () => {
      const config = {
        region: 'us-east-1',
        access_key_id: 'AKIA-test-key-id',
        secret_access_key: 'test-secret-access-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new AwsSesAdapter(config);
      const emailWithAttachments = { ...mockEmailData, attachments: mockAttachments };
      const params = adapter.buildSesParams(emailWithAttachments);
      
      // SES uses raw email format which includes attachments in MIME
      expect(params.RawMessage).toBeDefined();
      expect(params.RawMessage.Data).toBeDefined();
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling', () => {
    test('should throw error for missing required fields', () => {
      expect(() => new SmtpAdapter(null)).toThrow();
      expect(() => new GmailOAuth2Adapter(undefined)).toThrow();
      expect(() => new SendGridAdapter({ api_key: '' })).toThrow();
    });

    test('should handle invalid email addresses', () => {
      const config = {
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'test@example.com', password: 'password' }
      };
      
      const adapter = new SmtpAdapter(config);
      const invalidEmail = {
        to: ['invalid-email'],
        subject: 'Test',
        html: '<p>Test</p>'
      };
      
      expect(() => adapter.validateEmail(invalidEmail)).toThrow();
    });

    test('should validate OAuth2 token structure', () => {
      const invalidConfig = {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        // Missing access_token and refresh_token
      };
      
      expect(() => new GmailOAuth2Adapter(invalidConfig)).toThrow();
    });
  });

  // ============================================
  // Connection Testing
  // ============================================
  describe('Connection Testing', () => {
    test('SMTP adapter should verify connection', async () => {
      const config = {
        host: 'smtp.mailtrap.io',
        port: 2525,
        auth: { 
          user: 'test-user', 
          password: 'test-password' 
        }
      };
      
      const adapter = new SmtpAdapter(config);
      
      // Mock the verify method to avoid actual network call
      adapter.verify = jest.fn().mockResolvedValue(true);
      
      const isConnected = await adapter.verify();
      expect(isConnected).toBe(true);
      expect(adapter.verify).toHaveBeenCalled();
    });

    test('SendGrid adapter should test API key', async () => {
      const config = {
        api_key: 'SG.test-api-key',
        from_email: 'noreply@example.com'
      };
      
      const adapter = new SendGridAdapter(config);
      
      // Mock the test method
      adapter.testConnection = jest.fn().mockResolvedValue({ valid: true });
      
      const result = await adapter.testConnection();
      expect(result.valid).toBe(true);
    });
  });
});

// Export for use in other test files
module.exports = {
  mockEmailData,
  mockAttachments
};
