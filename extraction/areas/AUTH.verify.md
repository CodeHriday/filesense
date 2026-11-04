# AUTH verification

Verdict: PASS

Written by the orchestrator from the verifier's reply; the verifier itself declined to write this file.

- About 55 claims checked: 0 wrong, 0 unsupported, 0 missed entry points.
- Coverage: all 12 server.js routes, 4 userManagement routes, the unreachable backend/src/routes/auth.js entry and all 4 frontend route rows. /api/secrets and /api/db_url belong to SEC.
- Confirmed: SEC 1, 3, 4, 6, 8, 9, 10, 12, 13; BUG 1-5 and 7-12; DUP 1, 2, 4, 7; and UNC-3 (an effective 11-minute inactivity timeout). Also confirmed: the lockout logic (5 attempts, 15 minutes, remainingTime only on the pre-locked path), the password policy, refresh-token rotation and the 30m/7d lifetimes, the rate limiters, the session cookie, the Okta permission recipe and the reset-request approve/deny flows. Further confirmed: the userSchema params-id issue behind BUG-3, and the change-password-required 500 path (the asyncHandler in src/middleware/error-handler.js forwards to the global handler at server.js:14040, backend/middleware/errorHandler.js, which returns INTERNAL_ERROR).

## Not verified (library behaviour, already open questions)
- SEC-5: bcrypt 72-byte truncation.
- BUG-6: pg array to jsonb.

## Minor omissions (not errors)
1. AuthContext.logout calls /api/auth/logout only when a refreshToken exists in localStorage (AuthContext.jsx:260). Okta users never store one (BUG-9), so their inactivity-timer logout skips the backend too.
2. change-password-required verifies with SECURITY_CONFIG.JWT_SECRET (userManagement.js:96-99). The notes' "JWT_SECRET" is ambiguous next to DUP-1.
3. generalLimiter skips /health/ready and /health/live (server.js:653).
4. Some validation.js citations omit the directory backend/src/middleware/.
