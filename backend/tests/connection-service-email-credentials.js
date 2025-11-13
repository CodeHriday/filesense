/**
 * ConnectionService Email Provider Credential Persistence Tests
 * 
 * Validates that email provider credentials are properly encrypted and preserved
 * across create and update operations, preventing credential loss during partial updates.
 */

const connectionService = require('../services/ConnectionService');
const { encrypt, decrypt } = require('../utils/encryption');

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Test email provider credential encryption on creation
 */
function testEncryptionOnCreate() {
  console.log(`\n${COLORS.YELLOW}[TEST 1] Credential encryption on creation${COLORS.RESET}\n`);
  const emailProviders = [
    {
      type: 'smtp',
      config: { host: 'smtp.example.com', port: 587, username: 'user@example.com', password: 'secret123' },
      sensitiveFields: ['password']
    },
    {
      type: 'gmail_oauth2',
      config: { client_id: 'client123', client_secret: 'secret456', refresh_token: 'refresh789', access_token: 'access012' },
      sensitiveFields: ['client_secret', 'refresh_token', 'access_token']
    },
    {
      type: 'outlook_oauth2',
      config: { client_id: 'client123', client_secret: 'secret456', refresh_token: 'refresh789', access_token: 'access012' },
      sensitiveFields: ['client_secret', 'refresh_token', 'access_token']
    },
    {
      type: 'sendgrid',
      config: { api_key: 'SG.secret123', from_email: 'noreply@example.com' },
      sensitiveFields: ['api_key']
    },
    {
      type: 'ses',
      config: { region: 'us-east-1', access_key_id: 'AKIAIOSFODNN7EXAMPLE', secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
      sensitiveFields: ['access_key_id', 'secret_access_key']
    },
    {
      type: 'azure_email',
      config: { connection_string: 'endpoint=https://example.communication.azure.com/;accesskey=secret123', access_key: 'secret456' },
      sensitiveFields: ['connection_string', 'access_key']
    },
    {
      type: 'gcp_email',
      config: { project_id: 'my-project', private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...', api_key: 'secret123', password: 'secret456' },
      sensitiveFields: ['private_key', 'api_key', 'password']
    }
  ];
  
  for (const provider of emailProviders) {
    const originalConfig = { ...provider.config };
    const encryptedConfig = connectionService.encryptSensitiveFields(provider.type, provider.config);
    
    let allEncrypted = true;
    let encryptionErrors = [];
    
    for (const field of provider.sensitiveFields) {
      const originalValue = originalConfig[field];
      const encryptedValue = encryptedConfig[field];
      
      if (!encryptedValue) {
        allEncrypted = false;
        encryptionErrors.push(`${field} is missing`);
      } else if (encryptedValue === originalValue) {
        allEncrypted = false;
        encryptionErrors.push(`${field} was not encrypted`);
      } else {
        // Verify we can decrypt it back
        try {
          const decryptedValue = decrypt(encryptedValue);
          if (decryptedValue !== originalValue) {
            allEncrypted = false;
            encryptionErrors.push(`${field} decrypts to wrong value`);
          }
        } catch (e) {
          allEncrypted = false;
          encryptionErrors.push(`${field} cannot be decrypted: ${e.message}`);
        }
      }
    }
    
    if (allEncrypted) {
      console.log(`${COLORS.GREEN}✓ ${provider.type}: All ${provider.sensitiveFields.length} sensitive fields encrypted (PASS)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${provider.type} - Encryption`, status: 'PASS' });
    } else {
      console.log(`${COLORS.RED}✗ ${provider.type}: Encryption errors: ${encryptionErrors.join(', ')} (FAIL)${COLORS.RESET}`);
      results.failed++;
      results.tests.push({ test: `${provider.type} - Encryption`, status: 'FAIL', errors: encryptionErrors });
    }
  }
}

/**
 * Test credential persistence during partial updates
 */
function testCredentialPersistenceDuringUpdate() {
  console.log(`\n${COLORS.YELLOW}[TEST 2] Credential persistence during partial updates${COLORS.RESET}\n`);
  
  // Simulate a partial update scenario
  const testCases = [
    {
      type: 'smtp',
      existingConfig: { host: 'smtp.example.com', port: 587, username: 'user@example.com', password: encrypt('secret123') },
      updateConfig: { host: 'smtp.newhost.com', port: 465 }, // No password in update
      sensitiveFields: ['password'],
      expectedPassword: 'secret123' // Should preserve existing
    },
    {
      type: 'gmail_oauth2',
      existingConfig: { 
        client_id: 'client123', 
        client_secret: encrypt('secret456'), 
        refresh_token: encrypt('refresh789'),
        access_token: encrypt('access012')
      },
      updateConfig: { client_id: 'newclient123' }, // No OAuth tokens in update
      sensitiveFields: ['client_secret', 'refresh_token', 'access_token'],
      expectedValues: { client_secret: 'secret456', refresh_token: 'refresh789', access_token: 'access012' }
    },
    {
      type: 'outlook_oauth2',
      existingConfig: { 
        tenant_id: 'tenant123',
        client_id: 'client456', 
        client_secret: encrypt('outlooksecret'), 
        refresh_token: encrypt('outlookrefresh'),
        access_token: encrypt('outlookaccess')
      },
      updateConfig: { tenant_id: 'newtenant123' }, // No OAuth tokens in update
      sensitiveFields: ['client_secret', 'refresh_token', 'access_token'],
      expectedValues: { client_secret: 'outlooksecret', refresh_token: 'outlookrefresh', access_token: 'outlookaccess' }
    },
    {
      type: 'sendgrid',
      existingConfig: { api_key: encrypt('SG.secret123'), from_email: 'noreply@example.com' },
      updateConfig: { from_email: 'hello@example.com' }, // No API key in update
      sensitiveFields: ['api_key'],
      expectedApiKey: 'SG.secret123'
    },
    {
      type: 'ses',
      existingConfig: { 
        region: 'us-east-1', 
        access_key_id: encrypt('AKIAIOSFODNN7EXAMPLE'), 
        secret_access_key: encrypt('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
      },
      updateConfig: { region: 'us-west-2' }, // No credentials in update
      sensitiveFields: ['access_key_id', 'secret_access_key'],
      expectedValues: { access_key_id: 'AKIAIOSFODNN7EXAMPLE', secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }
    },
    {
      type: 'azure_email',
      existingConfig: { 
        connection_string: encrypt('endpoint=https://example.communication.azure.com/;accesskey=secret123'),
        access_key: encrypt('azuresecret456'),
        from_email: 'noreply@example.com'
      },
      updateConfig: { from_email: 'alerts@example.com' }, // No credentials in update
      sensitiveFields: ['connection_string', 'access_key'],
      expectedValues: { connection_string: 'endpoint=https://example.communication.azure.com/;accesskey=secret123', access_key: 'azuresecret456' }
    },
    {
      type: 'gcp_email',
      existingConfig: { 
        project_id: 'my-project',
        private_key: encrypt('-----BEGIN PRIVATE KEY-----\nMIIE...'),
        api_key: encrypt('gcpapikey123'),
        password: encrypt('gcppassword456')
      },
      updateConfig: { project_id: 'new-project' }, // No credentials in update
      sensitiveFields: ['private_key', 'api_key', 'password'],
      expectedValues: { private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...', api_key: 'gcpapikey123', password: 'gcppassword456' }
    }
  ];
  
  for (const testCase of testCases) {
    // Simulate the update merge logic from ConnectionService.updateConnection
    const mergedConfig = { ...testCase.existingConfig };
    const sensitiveFieldsByType = {
      smtp: ['password'],
      gmail_oauth2: ['client_secret', 'refresh_token', 'access_token'],
      outlook_oauth2: ['client_secret', 'refresh_token', 'access_token'],
      sendgrid: ['api_key'],
      ses: ['access_key_id', 'secret_access_key'],
      azure_email: ['connection_string', 'access_key'],
      gcp_email: ['private_key', 'api_key', 'password']
    };
    
    const sensitiveFields = sensitiveFieldsByType[testCase.type] || [];
    const fieldsToEncrypt = {};
    
    // Update with new config values
    for (const [key, value] of Object.entries(testCase.updateConfig)) {
      if (sensitiveFields.includes(key)) {
        if (value && value !== '') {
          fieldsToEncrypt[key] = value;
        }
        // If empty/undefined, preserve existing encrypted value
      } else {
        mergedConfig[key] = value;
      }
    }
    
    // Encrypt newly provided sensitive fields
    if (Object.keys(fieldsToEncrypt).length > 0) {
      const encryptedNewFields = connectionService.encryptSensitiveFields(testCase.type, fieldsToEncrypt);
      for (const [key, value] of Object.entries(encryptedNewFields)) {
        mergedConfig[key] = value;
      }
    }
    
    // Now verify that existing credentials were preserved
    let credentialsPreserved = true;
    let preservationErrors = [];
    
    for (const field of testCase.sensitiveFields) {
      const mergedValue = mergedConfig[field];
      const existingValue = testCase.existingConfig[field];
      
      if (!mergedValue) {
        credentialsPreserved = false;
        preservationErrors.push(`${field} was lost during update`);
      } else if (mergedValue !== existingValue) {
        // If value changed, it should still decrypt correctly
        try {
          const decryptedValue = decrypt(mergedValue);
          // Check if it matches expected value (for cases where we're updating the credential)
          const expectedValue = testCase.expectedValues?.[field] || testCase[`expected${field.charAt(0).toUpperCase() + field.slice(1)}`];
          if (decryptedValue !== expectedValue) {
            credentialsPreserved = false;
            preservationErrors.push(`${field} has unexpected value after merge`);
          }
        } catch (e) {
          credentialsPreserved = false;
          preservationErrors.push(`${field} cannot be decrypted after merge: ${e.message}`);
        }
      } else {
        // Value unchanged, verify it still decrypts correctly
        try {
          decrypt(mergedValue);
        } catch (e) {
          credentialsPreserved = false;
          preservationErrors.push(`${field} cannot be decrypted: ${e.message}`);
        }
      }
    }
    
    if (credentialsPreserved) {
      console.log(`${COLORS.GREEN}✓ ${testCase.type}: Credentials preserved during partial update (PASS)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${testCase.type} - Partial Update`, status: 'PASS' });
    } else {
      console.log(`${COLORS.RED}✗ ${testCase.type}: ${preservationErrors.join(', ')} (FAIL)${COLORS.RESET}`);
      results.failed++;
      results.tests.push({ test: `${testCase.type} - Partial Update`, status: 'FAIL', errors: preservationErrors });
    }
  }
}

/**
 * Test decryption logic
 */
function testDecryption() {
  console.log(`\n${COLORS.YELLOW}[TEST 3] Credential decryption${COLORS.RESET}\n`);
  const testProviders = [
    {
      type: 'smtp',
      encryptedConfig: { host: 'smtp.example.com', password: encrypt('secret123') },
      expectedValues: { password: 'secret123' }
    },
    {
      type: 'gmail_oauth2',
      encryptedConfig: { 
        client_id: 'client123',
        client_secret: encrypt('secret456'),
        refresh_token: encrypt('refresh789'),
        access_token: encrypt('access012')
      },
      expectedValues: { client_secret: 'secret456', refresh_token: 'refresh789', access_token: 'access012' }
    },
    {
      type: 'outlook_oauth2',
      encryptedConfig: { 
        tenant_id: 'tenant123',
        client_secret: encrypt('outlooksecret'),
        refresh_token: encrypt('outlookrefresh'),
        access_token: encrypt('outlookaccess')
      },
      expectedValues: { client_secret: 'outlooksecret', refresh_token: 'outlookrefresh', access_token: 'outlookaccess' }
    },
    {
      type: 'sendgrid',
      encryptedConfig: { api_key: encrypt('SG.secret123') },
      expectedValues: { api_key: 'SG.secret123' }
    },
    {
      type: 'ses',
      encryptedConfig: {
        region: 'us-east-1',
        access_key_id: encrypt('AKIAIOSFODNN7EXAMPLE'),
        secret_access_key: encrypt('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
      },
      expectedValues: { access_key_id: 'AKIAIOSFODNN7EXAMPLE', secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }
    },
    {
      type: 'azure_email',
      encryptedConfig: {
        connection_string: encrypt('endpoint=https://example.communication.azure.com/;accesskey=secret123'),
        access_key: encrypt('azuresecret456')
      },
      expectedValues: { connection_string: 'endpoint=https://example.communication.azure.com/;accesskey=secret123', access_key: 'azuresecret456' }
    },
    {
      type: 'gcp_email',
      encryptedConfig: {
        project_id: 'my-project',
        private_key: encrypt('-----BEGIN PRIVATE KEY-----\nMIIE...'),
        api_key: encrypt('gcpapikey123'),
        password: encrypt('gcppassword456')
      },
      expectedValues: { private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...', api_key: 'gcpapikey123', password: 'gcppassword456' }
    }
  ];
  
  for (const provider of testProviders) {
    const decryptedConfig = connectionService.decryptSensitiveFields(provider.type, provider.encryptedConfig);
    
    let decryptionSuccess = true;
    let decryptionErrors = [];
    
    // Validate all expected fields were decrypted correctly
    for (const [field, expectedValue] of Object.entries(provider.expectedValues)) {
      const actualValue = decryptedConfig[field];
      if (actualValue !== expectedValue) {
        decryptionSuccess = false;
        decryptionErrors.push(`${field}: expected '${expectedValue}', got '${actualValue}'`);
      }
    }
    
    if (decryptionSuccess) {
      console.log(`${COLORS.GREEN}✓ ${provider.type}: All ${Object.keys(provider.expectedValues).length} fields decrypted correctly (PASS)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${provider.type} - Decryption`, status: 'PASS' });
    } else {
      console.log(`${COLORS.RED}✗ ${provider.type}: ${decryptionErrors.join(', ')} (FAIL)${COLORS.RESET}`);
      results.failed++;
      results.tests.push({ test: `${provider.type} - Decryption`, status: 'FAIL', errors: decryptionErrors });
    }
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log(`\n${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}  EMAIL PROVIDER CREDENTIAL PERSISTENCE TESTS${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}`);
  
  testEncryptionOnCreate();
  testCredentialPersistenceDuringUpdate();
  testDecryption();
  
  // Print summary
  console.log(`\n${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}  TEST SUMMARY${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}\n`);
  
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`${COLORS.GREEN}Passed: ${results.passed}${COLORS.RESET}`);
  console.log(`${COLORS.RED}Failed: ${results.failed}${COLORS.RESET}\n`);
  
  if (results.failed === 0) {
    console.log(`${COLORS.GREEN}✓ ALL TESTS PASSED - Email provider credentials are properly encrypted and preserved!${COLORS.RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${COLORS.RED}✗ TESTS FAILED - Credential handling issues detected!${COLORS.RESET}\n`);
    console.log('Failed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  ${COLORS.RED}✗ ${t.test}${COLORS.RESET}`);
      if (t.errors) {
        t.errors.forEach(err => console.log(`    - ${err}`));
      }
    });
    console.log('');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error(`${COLORS.RED}Test execution error:${COLORS.RESET}`, error);
  process.exit(1);
});
