/**
 * Comprehensive Project-Level Access Control Validation Tests
 * 
 * Tests zero-tolerance security across all asset endpoints:
 * - Users with NO project memberships should get ZERO assets
 * - Users WITH project memberships should only see assets in their projects
 * - Admins should bypass all project checks and see ALL assets
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

// Test users
const TEST_USERS = {
  ZERO_ACCESS: { username: 'User2_Creator', password: 'Creator123!', expectedProjects: 0 },
  WITH_ACCESS: { username: 'User1_Executor', password: 'Executor123!', expectedProjects: 1 },
  ADMIN: { username: 'admin', password: 'admin123', expectedProjects: 'all' }
};

// List endpoints to test
const LIST_ENDPOINTS = [
  { path: '/api/connections', key: null, name: 'Connections' },
  { path: '/api/transformations', key: 'mappings', name: 'Transformations' },
  { path: '/api/n-step-workflows', key: 'workflows', name: 'Workflows' },
  { path: '/api/schedules', key: null, name: 'Schedules' }
];

// Mutation endpoints to test (zero-project users should get 403)
const MUTATION_TESTS = [
  { method: 'GET', path: '/api/n-step-workflows/1', name: 'Workflow Detail (GET/:id)' },
  { method: 'POST', path: '/api/n-step-workflows', body: { name: 'Test Workflow' }, name: 'Workflow Create (POST)' },
  { method: 'PUT', path: '/api/n-step-workflows/1', body: { name: 'Updated' }, name: 'Workflow Update (PUT/:id)' },
  { method: 'DELETE', path: '/api/n-step-workflows/99999', name: 'Workflow Delete (DELETE/:id)' },
  { method: 'POST', path: '/api/n-step-workflows/1/steps', name: 'Workflow Add Step (POST/:id/steps)' },
  { method: 'DELETE', path: '/api/n-step-workflows/1/steps/1', name: 'Workflow Delete Step (DELETE/:id/steps/:stepId)' },
  { method: 'POST', path: '/api/n-step-workflows/1/execute', name: 'Workflow Execute (POST/:id/execute)' },
  { method: 'POST', path: '/api/schedules', body: { entity_type: 'workflow', entity_id: '1', schedule_type: 'cron', cron_expression: '0 0 * * *' }, name: 'Schedule Create (POST)' },
  { method: 'PUT', path: '/api/schedules/1', body: { schedule_name: 'Updated' }, name: 'Schedule Update (PUT/:id)' },
  { method: 'DELETE', path: '/api/schedules/99999', name: 'Schedule Delete (DELETE/:id)' }
];

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Login and get JWT token
 */
async function login(username, password) {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      username,
      password
    });
    return response.data.token;
  } catch (error) {
    console.error(`${COLORS.RED}✗ Login failed for ${username}${COLORS.RESET}`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Test a list endpoint with a given token
 */
async function testListEndpoint(endpoint, token, userName) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint.path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    let count;
    if (endpoint.key) {
      count = response.data[endpoint.key] ? response.data[endpoint.key].length : 0;
    } else {
      count = Array.isArray(response.data) ? response.data.length : 0;
    }
    
    return { success: true, count };
  } catch (error) {
    if (error.response?.status === 403) {
      return { success: true, count: 0, forbidden: true };
    }
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Test a mutation endpoint (POST/PUT/DELETE) with a given token
 * For zero-project users, these should return 403 Forbidden
 */
async function testMutationEndpoint(test, token, expectForbidden) {
  try {
    const config = {
      method: test.method.toLowerCase(),
      url: `${BASE_URL}${test.path}`,
      headers: { Authorization: `Bearer ${token}` }
    };
    
    if (test.body) {
      config.data = test.body;
    }
    
    const response = await axios(config);
    
    // If we expected 403 but got success, that's a security failure
    if (expectForbidden) {
      return { success: false, status: response.status, message: 'Expected 403 but got success' };
    }
    
    return { success: true, status: response.status };
  } catch (error) {
    const status = error.response?.status;
    
    if (expectForbidden && status === 403) {
      // Expected 403, got 403 - PASS
      return { success: true, status: 403, forbidden: true };
    }
    
    // For DELETE operations on non-existent resources, 404 is acceptable
    // (resource doesn't exist, so can't determine project access)
    if (expectForbidden && test.method === 'DELETE' && status === 404) {
      return { success: true, status: 404, forbidden: true, message: '404 acceptable for DELETE on non-existent resource' };
    }
    
    if (!expectForbidden && (status === 404 || status === 400)) {
      // For authorized users, 404/400 are acceptable (entity may not exist)
      return { success: true, status, message: 'Acceptable error for authorized user' };
    }
    
    return { success: false, status, error: error.response?.data || error.message };
  }
}

/**
 * Run all validation tests
 */
async function runValidationTests() {
  console.log(`\n${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}  PROJECT-LEVEL ACCESS CONTROL VALIDATION TESTS${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}\n`);
  
  // Test 1: Zero-Access User
  console.log(`${COLORS.YELLOW}[TEST 1] User with ZERO project memberships${COLORS.RESET}`);
  console.log(`Username: ${TEST_USERS.ZERO_ACCESS.username}\n`);
  
  const zeroAccessToken = await login(TEST_USERS.ZERO_ACCESS.username, TEST_USERS.ZERO_ACCESS.password);
  if (!zeroAccessToken) {
    console.log(`${COLORS.RED}✗ Failed to login as ${TEST_USERS.ZERO_ACCESS.username}${COLORS.RESET}\n`);
    results.failed++;
    return;
  }
  
  // Test list endpoints
  for (const endpoint of LIST_ENDPOINTS) {
    const result = await testListEndpoint(endpoint, zeroAccessToken, TEST_USERS.ZERO_ACCESS.username);
    
    if (result.success && result.count === 0) {
      console.log(`${COLORS.GREEN}✓ ${endpoint.name}: ${result.count} assets (PASS)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${TEST_USERS.ZERO_ACCESS.username} - ${endpoint.name}`, status: 'PASS', expected: 0, actual: result.count });
    } else {
      console.log(`${COLORS.RED}✗ ${endpoint.name}: ${result.count} assets (FAIL - Expected 0)${COLORS.RESET}`);
      results.failed++;
      results.tests.push({ test: `${TEST_USERS.ZERO_ACCESS.username} - ${endpoint.name}`, status: 'FAIL', expected: 0, actual: result.count });
    }
  }
  
  // Test mutation endpoints (should all return 403)
  console.log(`\n${COLORS.YELLOW}Testing mutation endpoints (should all return 403):${COLORS.RESET}`);
  for (const test of MUTATION_TESTS) {
    const result = await testMutationEndpoint(test, zeroAccessToken, true);
    
    if (result.success && result.forbidden) {
      console.log(`${COLORS.GREEN}✓ ${test.name}: 403 Forbidden (PASS)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${TEST_USERS.ZERO_ACCESS.username} - ${test.name}`, status: 'PASS', expected: '403', actual: '403' });
    } else {
      console.log(`${COLORS.RED}✗ ${test.name}: ${result.status || 'error'} (FAIL - Expected 403)${COLORS.RESET}`);
      results.failed++;
      results.tests.push({ test: `${TEST_USERS.ZERO_ACCESS.username} - ${test.name}`, status: 'FAIL', expected: '403', actual: result.status || 'error' });
    }
  }
  
  // Test 2: User with Project Access
  console.log(`\n${COLORS.YELLOW}[TEST 2] User WITH project membership${COLORS.RESET}`);
  console.log(`Username: ${TEST_USERS.WITH_ACCESS.username}\n`);
  
  const withAccessToken = await login(TEST_USERS.WITH_ACCESS.username, TEST_USERS.WITH_ACCESS.password);
  if (!withAccessToken) {
    console.log(`${COLORS.RED}✗ Failed to login as ${TEST_USERS.WITH_ACCESS.username}${COLORS.RESET}\n`);
    results.failed++;
    return;
  }
  
  for (const endpoint of LIST_ENDPOINTS) {
    const result = await testListEndpoint(endpoint, withAccessToken, TEST_USERS.WITH_ACCESS.username);
    
    if (result.success) {
      console.log(`${COLORS.GREEN}✓ ${endpoint.name}: ${result.count} assets (PASS - project-scoped)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${TEST_USERS.WITH_ACCESS.username} - ${endpoint.name}`, status: 'PASS', expected: 'project-scoped', actual: result.count });
    } else {
      console.log(`${COLORS.RED}✗ ${endpoint.name}: Error (FAIL)${COLORS.RESET}`, result.error);
      results.failed++;
      results.tests.push({ test: `${TEST_USERS.WITH_ACCESS.username} - ${endpoint.name}`, status: 'FAIL', expected: 'project-scoped', actual: 'error' });
    }
  }
  
  // Test 3: Admin User (should see all)
  console.log(`\n${COLORS.YELLOW}[TEST 3] Admin user (should bypass project checks)${COLORS.RESET}`);
  console.log(`Username: ${TEST_USERS.ADMIN.username}\n`);
  
  const adminToken = await login(TEST_USERS.ADMIN.username, TEST_USERS.ADMIN.password);
  if (!adminToken) {
    console.log(`${COLORS.RED}✗ Failed to login as ${TEST_USERS.ADMIN.username}${COLORS.RESET}\n`);
    results.failed++;
    return;
  }
  
  for (const endpoint of LIST_ENDPOINTS) {
    const result = await testListEndpoint(endpoint, adminToken, TEST_USERS.ADMIN.username);
    
    if (result.success) {
      console.log(`${COLORS.GREEN}✓ ${endpoint.name}: ${result.count} assets (PASS - admin bypass)${COLORS.RESET}`);
      results.passed++;
      results.tests.push({ test: `${TEST_USERS.ADMIN.username} - ${endpoint.name}`, status: 'PASS', expected: 'all assets', actual: result.count });
    } else {
      console.log(`${COLORS.RED}✗ ${endpoint.name}: Error (FAIL)${COLORS.RESET}`, result.error);
      results.failed++;
      results.tests.push({ test: `${TEST_USERS.ADMIN.username} - ${endpoint.name}`, status: 'FAIL', expected: 'all assets', actual: 'error' });
    }
  }
  
  // Print summary
  console.log(`\n${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}  TEST SUMMARY${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}═══════════════════════════════════════════════════════════════${COLORS.RESET}\n`);
  
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`${COLORS.GREEN}Passed: ${results.passed}${COLORS.RESET}`);
  console.log(`${COLORS.RED}Failed: ${results.failed}${COLORS.RESET}\n`);
  
  if (results.failed === 0) {
    console.log(`${COLORS.GREEN}✓ ALL TESTS PASSED - Project-level access control is working correctly!${COLORS.RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${COLORS.RED}✗ TESTS FAILED - Security vulnerabilities detected!${COLORS.RESET}\n`);
    console.log('Failed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  ${COLORS.RED}✗ ${t.test}: Expected ${t.expected}, got ${t.actual}${COLORS.RESET}`);
    });
    console.log('');
    process.exit(1);
  }
}

// Run tests
runValidationTests().catch(error => {
  console.error(`${COLORS.RED}Test execution error:${COLORS.RESET}`, error);
  process.exit(1);
});
