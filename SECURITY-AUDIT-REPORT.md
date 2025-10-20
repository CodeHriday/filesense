# Security Audit Report - Data File Observatory
**Generated**: October 20, 2025
**Scanner**: Semgrep v1.121.0
**Files Scanned**: 371 files (JavaScript/TypeScript/Python)
**Rules Applied**: 204 security rules
**Total Findings**: 57 security issues

---

## Executive Summary

The Semgrep security scan identified **57 security findings** across the Data File Observatory codebase:
- **14 WARNING-level** findings (Medium to High severity)
- **43 INFO-level** findings (Low severity)

### Critical Areas Requiring Immediate Attention:
1. **SQL Injection Vulnerabilities** (2 findings) - HIGH PRIORITY
2. **TLS Verification Bypass** (2 findings) - HIGH PRIORITY  
3. **Path Traversal Risks** (4 findings) - MEDIUM PRIORITY
4. **ReDoS (Regular Expression Denial of Service)** (5 findings) - MEDIUM PRIORITY
5. **Prototype Pollution** (1 finding) - MEDIUM PRIORITY

---

## WARNING-Level Findings (14 Total)

### 1. SQL Injection Vulnerabilities ⚠️ HIGH PRIORITY

**Severity**: HIGH  
**CWE**: CWE-915 (Improper Object Attribute Modification)  
**OWASP**: A08:2021 - Software and Data Integrity Failures

**Affected Files**:
- `backend/config/database.js:52`
- `backend/src/config/database.js:37`

**Issue**: String concatenation detected in node-postgres SQL statements, which could lead to SQL injection if variables contain user-controlled data.

**Current Code Pattern**:
```javascript
// VULNERABLE: String concatenation in SQL
const query = "SELECT * FROM table WHERE column = '" + userInput + "'";
await client.query(query);
```

**Recommended Fix**:
```javascript
// SAFE: Parameterized query
const query = 'SELECT * FROM table WHERE column = $1';
await client.query(query, [userInput]);
```

**Action Required**: Review all database query construction and convert to parameterized queries.

---

### 2. TLS Verification Bypass ⚠️ HIGH PRIORITY

**Severity**: HIGH  
**Files**:
- `backend/migrations/createAuditTables.js:265`
- `backend/migrations/createJobDependencyTables.js:234`

**Issue**: Setting `NODE_TLS_REJECT_UNAUTHORIZED=0` disables TLS certificate verification, exposing connections to man-in-the-middle attacks.

**Current Code**:
```javascript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // DANGEROUS!
```

**Recommended Fix**:
- Remove TLS bypass completely for production
- If needed for development, use proper CA certificates or configure specific trust stores
- Add environment-based checks to ensure this NEVER runs in production:

```javascript
if (process.env.NODE_ENV === 'development') {
  console.warn('WARNING: TLS verification disabled for development only');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
```

**Action Required**: Remove or properly gate TLS bypass code.

---

### 3. Path Traversal Vulnerabilities ⚠️ MEDIUM PRIORITY

**Severity**: MEDIUM  
**CWE**: CWE-22 (Path Traversal)

**Affected Files**:
- `backend/services/DBTService.js:58` (2 instances)
- `backend/services/DBTService.js:59` (2 instances)

**Issue**: User input being passed to `path.join()` or `path.resolve()` without proper validation, potentially allowing attackers to access files outside intended directories.

**Vulnerable Pattern**:
```javascript
const filePath = path.join(baseDir, userInput);
```

**Recommended Fix**:
```javascript
const path = require('path');

function safePath(baseDir, userPath) {
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(baseDir, normalized);
  
  // Ensure the resolved path is still within baseDir
  if (!fullPath.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal attempt detected');
  }
  
  return fullPath;
}

// Usage
const safePath = safePath(baseDir, userInput);
```

**Action Required**: Add path validation to all file operations involving user input.

---

### 4. Regular Expression Denial of Service (ReDoS) ⚠️ MEDIUM PRIORITY

**Severity**: MEDIUM  
**CWE**: CWE-1333 (Inefficient Regular Expression Complexity)

**Affected Files**:
- `backend/services/cacheService.js:171`
- `backend/utils/cloudStorageFileList.js:161`
- `backend/utils/filePatternMatcher.js:19`
- `server.js:309`
- `src/utils/validators.js:56`

**Issue**: `new RegExp()` called with non-literal patterns that could be user-controlled, potentially causing catastrophic backtracking and CPU exhaustion.

**Vulnerable Pattern**:
```javascript
const regex = new RegExp(userPattern); // Dangerous!
```

**Recommended Fixes**:

**Option 1**: Validate and sanitize regex patterns before use:
```javascript
function safeRegex(pattern, options = '') {
  // Limit pattern complexity
  if (pattern.length > 100) {
    throw new Error('Pattern too complex');
  }
  
  // Blacklist dangerous patterns
  const dangerous = /(\.\*){2,}|(\.\+){2,}|(\(.*\)){2,}/;
  if (dangerous.test(pattern)) {
    throw new Error('Potentially malicious pattern detected');
  }
  
  return new RegExp(pattern, options);
}
```

**Option 2**: Use `safe-regex` npm package:
```javascript
const safeRegex = require('safe-regex');

if (!safeRegex(pattern)) {
  throw new Error('Unsafe regex pattern');
}
const regex = new RegExp(pattern);
```

**Option 3**: Set timeout for regex operations:
```javascript
const { matches } = require('regex-with-timeout');
const result = matches(input, pattern, { timeout: 1000 }); // 1 second timeout
```

**Action Required**: Add regex validation or timeouts to all dynamic regex creation.

---

### 5. Prototype Pollution ⚠️ MEDIUM PRIORITY

**Severity**: MEDIUM  
**CWE**: CWE-1321 (Prototype Pollution)

**Affected File**:
- `backend/services/jobExecutionEngine.js:1764`

**Issue**: Detected object property assignment in a loop that could lead to prototype pollution attacks.

**Vulnerable Pattern**:
```javascript
for (let key in userObject) {
  target[key] = userObject[key]; // Can pollute Object.prototype
}
```

**Recommended Fix**:
```javascript
// Option 1: Use Object.hasOwnProperty
for (let key in userObject) {
  if (userObject.hasOwnProperty(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
    target[key] = userObject[key];
  }
}

// Option 2: Use Object.assign with null prototype
const target = Object.create(null);
Object.assign(target, userObject);

// Option 3: Use Object.entries (safest)
Object.entries(userObject).forEach(([key, value]) => {
  if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
    target[key] = value;
  }
});
```

**Action Required**: Review object assignment patterns and add prototype pollution protection.

---

## INFO-Level Findings (43 Total)

### 1. Unsafe Format Strings (42 findings)

**Severity**: LOW  
**Files**: Multiple (console.log/util.format statements across backend)

**Issue**: String concatenation in logging statements could allow format string injection if attacker controls log input.

**Recommended Fix**:
```javascript
// Instead of:
console.log('Error for user: ' + username);

// Use:
console.log('Error for user:', username);
// Or:
console.log(`Error for user: ${username}`); // Template literals are safe
```

**Priority**: LOW - Primarily informational, but good practice to fix.

---

### 2. Missing CSRF Protection (1 finding)

**Severity**: LOW  
**File**: `backend/src/app.js:24`

**Issue**: No CSRF middleware detected in Express application.

**Note**: Your application already uses JWT authentication which provides CSRF protection for API endpoints. However, if you have any form-based submissions, consider adding CSRF tokens.

**Recommended Action**:
- If using cookie-based auth for forms: Add `csurf` middleware
- If using JWT only: Document this as an accepted risk (JWT in headers is CSRF-safe)

---

## Remediation Priority Matrix

| Priority | Issue | Files Affected | Effort | Impact |
|----------|-------|----------------|--------|--------|
| 🔴 **CRITICAL** | SQL Injection | 2 | Medium | HIGH |
| 🔴 **CRITICAL** | TLS Bypass | 2 | Low | HIGH |
| 🟡 **HIGH** | Path Traversal | 4 | Medium | MEDIUM |
| 🟡 **HIGH** | ReDoS | 5 | Medium | MEDIUM |
| 🟡 **HIGH** | Prototype Pollution | 1 | Low | MEDIUM |
| 🟢 **MEDIUM** | Unsafe Format Strings | 42 | Low | LOW |
| 🟢 **LOW** | Missing CSRF | 1 | Low | LOW |

---

## Recommended Action Plan

### Phase 1: Immediate (Critical Issues)
1. **SQL Injection**: Convert all SQL queries to parameterized statements
2. **TLS Bypass**: Remove or properly gate TLS verification bypass

### Phase 2: Short-term (High Priority)
3. **Path Traversal**: Add path validation helpers
4. **ReDoS**: Add regex validation/timeouts
5. **Prototype Pollution**: Fix object assignment pattern

### Phase 3: Long-term (Good Hygiene)
6. **Format Strings**: Update logging patterns
7. **CSRF**: Document JWT-based protection or add CSRF middleware

---

## Testing Recommendations

After implementing fixes, re-run Semgrep to verify:
```bash
semgrep --config=auto --json --output=/tmp/semgrep-post-fix.json .
```

Consider adding Semgrep to your CI/CD pipeline:
```yaml
# .github/workflows/security.yml
- name: Run Semgrep
  run: semgrep --config=auto --error
```

---

## Additional Security Recommendations

Beyond the Semgrep findings, consider:

1. **Dependency Scanning**: Run `npm audit` regularly
2. **Secret Scanning**: Use tools like `trufflehog` or `gitleaks`
3. **Container Scanning**: If using Docker, scan images with Trivy
4. **Penetration Testing**: Consider professional security assessment
5. **Security Headers**: Ensure Helmet.js is properly configured
6. **Rate Limiting**: Verify rate limiting on all auth endpoints (already implemented)
7. **Input Validation**: Use Joi/express-validator consistently (already implemented)

---

## Summary

Your application has a solid security foundation with:
✅ JWT authentication
✅ Bcrypt password hashing  
✅ Rate limiting
✅ Input validation (Joi)
✅ Helmet.js security headers
✅ File upload validation

The Semgrep findings are primarily **defensive improvements** rather than actively exploited vulnerabilities. Prioritize fixing the SQL injection and TLS bypass issues first, then address the medium-priority items.

