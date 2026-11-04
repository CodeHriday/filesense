# SEC - Security middleware and secrets (cross-cutting)

## Summary
Security in the live app (server.js) is assembled from: helmet (CSP built asynchronously), a hand-written CORS origin check, express-session, three express-rate-limit limiters, Joi validation (login/register only), and two JWT authentication middlewares that behave differently. Authorization is a mix of permission checks, an admin bypass derived from role name or permission names, and project membership checks. Secrets come from AWS Secrets Manager with environment fallback. Two unauthenticated endpoints expose Okta config and the full DATABASE_URL. Several modules in this area are not reachable (backend/src/middleware/security.js, hybridAuthorization.js, policyAuthorization.js, enterpriseRateLimiter.js, pathValidator except DBTService).

## Entry points

### 1. GET /api/secrets (server.js:10758)
- Trigger: frontend `loadSecrets()` when `VITE_ENV !== 'development'` (src/config/secrets.js:5-14).
- Auth: none (no middleware on route, server.js:10758). Behind generalLimiter only (mounted at :767, before the route).
- Input: none.
- Output: 200 JSON `OKTA_CLIENT_ID, OKTA_DOMAIN, OKTA_ISSUER, OKTA_REDIRECT_URI, BACKEND_URL` (server.js:10762-10768); 500 `{error:'Failed to fetch secrets'}` (:10771).
- Side effects: may call AWS Secrets Manager once, then cached (backend/config/config-secrets.js:111-146).
- Rules: frontend falls back to `"http://localhost:5000/auth/callback"` for OKTA_REDIRECT_URI if missing (src/config/secrets.js:21).

### 2. GET /api/db_url (server.js:10780)
- Trigger: Flask profile_api.py calls `{BACKEND_API_URL or http://localhost:5000}/api/db_url` (profile_api.py:182-183).
- Auth: none.
- Output: 200 `{DATABASE_URL}` from `process.env.DATABASE_URL` (:10782, :10795); if unset, can return `secrets.database_url`/`DATABASE_URL` directly (:10786), else builds `postgres://user:encodeURIComponent(password)@host:port(default 5432)/dbname` from AWS secret fields (:10786-10789); 500 `DATABASE_URL not available` (:10791).
- Side effects: none besides secret fetch.
- Note: returns the full connection string including credentials to any caller.

### 3. generalLimiter on /api/ (server.js:643-667, applied :767)
- Window 15 min, max 500 per IP (:644-645; comment at :645 says "100"). 429 JSON `{error:'Too many requests from this IP, please try again later'}` (:660). Skips `/health/ready` and `/health/live` (:653). `trust proxy` = 1 (:110) so IP is from X-Forwarded-For hop.
- Registered after `GET /api/files/:fileId/status` (:703), which is therefore exempt (comment :700-702).
- Other limiters defined here: authLimiter 5 per 15 min, skipSuccessfulRequests true (:667-671), used on POST /api/auth/login (:10417), /api/auth/register (:10513), /api/auth/request-password-reset (:10830). uploadLimiter 20 per 1 hour (:685-688), used on /api/files/check-duplicate (:2489), /api/files/upload (:2557), /api/files/drop (:3476).
- Limiter store is express-rate-limit default (in-memory, per process); no store configured in :643-698.

### 4. Global middleware chain (server.js:432-640)
- Order: compression (level 6, threshold 1024, :499-510) -> CORS (:517-555) -> bodyParser json/urlencoded limit '50mb' (:556-557) -> logger attach -> prod GET / probe (:573-589) -> session (:593-602) -> audit middleware (:606) -> extractFileId (:609) -> timeouts (:612-640) -> generalLimiter (:767).
- Helmet is INERT: `app.use(helmet(...))` is called inside an async IIFE only after `await getAllSecretData()` (server.js:435-437, :467). server.js is CommonJS and registers every route, the static handler, the SPA catch-all (:14007-14023), the 404 handler (:14030) and `errorHandler` (:14041) synchronously at top level, so the IIFE resumes only after the module has finished loading and `app.use(helmet)` lands after `errorHandler`. `errorHandler` always responds and never calls `next` (errorHandler.js:41-101), so no response carries the helmet headers (CSP, HSTS, etc.). If `getAllSecretData()` throws, the catch only logs (:490-491) and helmet is not installed at all.
- Tail of the chain (registered synchronously at top level): static files `express.static(distPath)` (:14007) and the SPA catch-all (:14011-14023, inside a conditional block that closes at :14024; non-`/api` paths get `index.html`, `/api` paths go to `next`), then the 404 handler (:14030-14037, passes `NotFoundError` to `next`), then `errorHandler` (:14041).
- Helmet CSP (configured but never applied, see above): defaultSrc self; scriptSrc `'self' 'unsafe-inline'` (:471); styleSrc adds `'unsafe-inline'` + fonts.googleapis.com; imgSrc `self data: https:`; connectSrc self + Okta domain + localhost URLs when NODE_ENV != production (:448-451); objectSrc none; frameSrc none; frameAncestors none; HSTS maxAge 31536000, includeSubDomains, preload (:483-487); referrer `strict-origin-when-cross-origin`. In production the Okta domain comes from `getAllSecretData()` (:444-446).
- CORS: allowed origins from `ALLOWED_ORIGINS` (comma split) else `localhost:5000, localhost:3000, https://*.replit.dev, https://*.replit.app, https://filesense.blumetra.com` (:513-515). Requests with no Origin always allowed (:520). Wildcards converted with `globToRegex` (:527-530). Methods GET/POST/PUT/DELETE/OPTIONS, headers Content-Type/Authorization/X-Requested-With, credentials true (:550-552). Blocked origin gives an Error 'Not allowed by CORS' (:547), a plain Error passed to `errorHandler`, which responds 500 with code `INTERNAL_ERROR` (errorHandler.js:86-92), including `stack` outside production (:86, :95).
- Session: secret `SESSION_SECRET || SECURITY_CONFIG.JWT_SECRET` (:594); cookie secure only when NODE_ENV=production, httpOnly, maxAge 24h (:597-601); default MemoryStore (no store given). Used only as an audit id: server.js reads only `req.sessionID` (audit, :5698, :5745, :5789) and has no `req.session` use; outside server.js, backend/middleware/auditMiddleware.js:139 and backend/routes/fileAudit.js:23 read `req.session?.id`, and `req.sessionID` is read in projectRoutes.js (e.g. :70), transformations.js:960 and visualMappings.js:711, all as `sessionId` for audit.
- Timeouts: request 30000 ms -> 408; response 35000 ms -> 408 and `req.socket.destroy()` (:614-637).
- CSRF: commented out; `ENABLE_CSRF` config exists (environment.js:40) but is not read in server.js (grep of server.js for csrf shows only comments :782-795).
- `app.use('/api/files', authenticateToken, schemaHistoryRoutes)` (server.js:5283) puts authentication on every /api/files/* path that reaches this mount.

### 5. authenticateToken (new) - backend/src/middleware/authenticate.js:17
- Used by server.js (:406) and routes such as lineageGraph, subProjects, retentionRoutes, rdm, notifications, lineageRoutes, auth.js, digestRoutes.js:12, schemaHistory.js:3.
- Reads `Authorization: <scheme> <token>` (split on space, 2nd part, :20-21). No token -> 401 'Authentication token is required'. `authService.verifyToken` (jwt.verify with SECURITY_CONFIG.JWT_SECRET, authService.js:401-403) failure -> 401 'Invalid or expired token'. `decoded.type === 'refresh'` -> 401 (:41).
- Loads user via `userRepository.findById(decoded.id)` (:50); status 404 -> 401 'User no longer exists' (:75-79); other errors -> 500 (:83-88).
- Sets `req.user = {...decoded, ...user}`, `permissions` (cached 600 s in Redis key `permissions:user:<id>`, :187, :295), `roles = effectiveRoles` (direct + group-inherited, :64-67, :162-197), and `features` (permission prefix map, :97-155).
- Base permissions always granted: `dashboard:read, file_profile:read, quality_checks:read` (:218-222).
- `req.user.permissions` mixes strings with objects `{name, resource, action}` (:218-282), see section 9 for the effect on callers.
- Helpers exported: `requirePermission` (:309-329) built on `checkPermission` (string match or object resource/action with `*` wildcard, :337-359), `requireRole` (:366), `getUserPermissions`.

### 6. authenticate (legacy) - backend/middleware/authenticate.js:14
- Used by vendorAgreementTemplateRoutes.js:7, userManagement.js:9, schemaValidation.js:10, cacheRoutes.js:14, bulkProfiling.js:9, apiTokenRoutes.js:4 (grep of `middleware/authenticate` requires in backend). digestRoutes.js:12 and schemaHistory.js:3 use the new one.
- No token (Authorization header missing or no 2nd space-separated part, :16-17) -> 401 `{error:'Authentication required'}` (:19-22).
- Verifies with `process.env.JWT_SECRET` directly (:26-32); missing secret -> 500. Expired -> 401 `{code:'TOKEN_EXPIRED'}`; else 401 'Invalid token'.
- Sets `req.user = decoded` only: no DB lookup, no refresh-token type check, no permissions/roles unless in the token. So permissionHelpers admin checks on these routes depend on the token payload.

### 7. authorize(requiredPermissions) - backend/middleware/authorize.js:17
- Used by visualMappings, retentionRoutes. 401 if no `req.user`; `userHasAdminAccess` bypass (:31); else all permissions must match as strings `resource:action` (:40-46) (no wildcard support, unlike `requirePermission`). 403 `{error:'Permission denied', requiredPermissions}`.

### 8. requireProjectAccess / authorizeProjectResource - backend/middleware/requireProjectAccess.js:29, authorizeProjectResource.js:39
- Used by server.js (:89-90), transformations, nStepWorkflows, mappingGroups, subProjects.
- Project id resolved in order: `params.projectId`, `query.project_id`, `body.project_id` (each via `parseInt`, so a non-numeric value gives NaN, which is falsy), then lookup by resourceType (file, transformation, mapping_group, workflow, workflow_step, schedule, connection, alert_policy, job) (requireProjectAccess.js:181-288). None -> 400 'Project context required' (:55-61). This 400 comes BEFORE the admin bypass, so admins get it too. A SQL error in `lookupResourceProject` is caught and returns null (:213-219), which also yields 400 (per-resource lookup failures are 400, not 500).
- Admin bypass (default true) when `userHasAllProjectAccess` (:66); sets `projectRole='Admin'`.
- Otherwise membership via project_members or user_groups -> project_access_groups, on project or its parent (:84-102); none -> 403 (:104-114). The "target project missing -> 404" branch (:124-133) is unreachable in practice: a missing project makes the :84-102 query return no rows, so the 403 at :111 fires first. `is_active` false -> 403 'This project is not active'.
- Denied or failed checks respond themselves (400/403/404/500) and never call `next` (see B8).
- Layer 2 global permissions: all required as `resource:action` strings (authorizeProjectResource.js:85-122); Layer 3 ProjectPolicyEngine only when `enforcePolicies` true (default false, :127).
- `getUserProjects` (:362) = direct + group parent projects + their sub-projects, active only, ordered by name; returns [] on error (:431).

### 9. Permission helpers - backend/utils/permissionHelpers.js
- `hasAdminRole`: roles include 'Admin' or 'admin' (string or object name/role_name) (:42-51).
- `userHasAllProjectAccess`: admin role or any of `project_management:write, all_projects:read, users:write, roles:write` (:60-73).
- `userHasAdminAccess`: admin role or any of `users:write, roles:write, project_management:write` (:80-92).
- `userHasPermission` matches string, or object `name`/`permission_name`/`permission_code` (:12-23) (not `resource`+`action`).
- Third copy: `userHasAdminAccess` in server.js:380-403 (admin role, or `users:write` / `roles:write` only; no `project_management:write`). It is the one used by `requireAdmin` (server.js:5417-5418), which guards /api/audit/* (:5430-5651), /api/governance-tags writes (:9336-9392), /api/admin/cleanup and /api/admin (:13871, :13876) and /api/allowed-email-domains (:13941); it is also called inline at :9692, :10185, :10937, :10975, :11041, :13585, :13648. A fourth predicate is in digestRoutes.js:17-34 (`users:write`, `roles:write`, `project_management:write` by name; comment at :17 says it mirrors the server.js copy).
- `req.user.permissions` mixes strings and objects `{name, resource, action}` (authenticate.js:218-282). `includes('x:y')` checks miss the object form; permissionHelpers matches by name/code, authorizeProjectResource and authorize match by resource:action.

### 10. Joi validation - backend/src/middleware/validation.js
- `validateRequest(schema)` validates body/query/params with `abortEarly:false, allowUnknown:true, stripUnknown:true` (:15-19); 400 `{error:'Validation Error', errors:[{field,message}]}`. Used in server.js on login (loginSchema, :10417) and register (userSchema, :10513).
- userSchema: username alphanum 3-30; password 8-100 with regex requiring lower, upper, digit, one of `@$!%*?&` and only those chars (:153-154); email; `roles` array of strings default `['User']` (:173).

### 10a. POST /api/auth/register (server.js:10513-10570)
- Trigger: user-creation call. Middleware chain: `authLimiter` (5 per 15 min, runs before auth, so unauthenticated calls consume the IP allowance), `authenticateToken`, `validateRequest(userSchema)` (:10513).
- Auth: handler requires `req.user.permissions.some(p => p.name === 'user_create')` (:10516); otherwise 403 'You do not have permission to create users' (:10518). No admin bypass; string-form permissions never match.
- Input: `username, password, email, fullName, roles` (:10521). Missing username/password -> 400 (:10523-10525); existing username -> 400 'Username already exists' (:10528-10531).
- Side effects: `bcrypt.genSalt(10)` hard-coded (:10534); INSERT into users (username, password, email, full_name) (:10538-10541); if `roles` is a non-empty array, looks up roles by name and inserts user_roles rows (:10546-10560). Response 201 with the user minus password (:10564-10565); other errors 500 'An error occurred during registration' (:10568).
- Notes: roles from the body are inserted with no check on what the caller may grant (:10546-10560), see S11. `BCRYPT_SALT_ROUNDS` (12, environment.js) is not used here. `fullName` is not in userSchema (only firstName/lastName, validation.js:170-171) and Joi uses stripUnknown, so `fullName` is stripped and full_name is saved as undefined (:10540). userSchema also has `params: {id: required}` (validation.js:176-182) and validateRequest validates params when a schema is given (:64-65); the route has no `:id`, so req.params is `{}` and the params check fails at validation.js:64-78 before the handler runs: register always returns 400 `Validation Error` with "User ID is required" (validation.js:179-180). The handler body (and so S11, B9, B10) is dormant.

### 11. Encryption - backend/utils/encryption.js
- AES-256-GCM, 12-byte IV, output `iv:authTag:data` hex (:44-60). Decrypt also accepts legacy `iv:data` AES-256-CBC (:97-111).
- Module throws at require time if `ENCRYPTION_KEY` missing or not 64 hex chars (:16-37).
- `decryptCredentials(type, config)` handles aws/s3 (access_key, access_key_id, secret_key, secret_access_key), gcs/google (private_key), azure/blob (account_key); unknown type logs a warning and returns copy unchanged (:130-173).
- server.js startup only logs the key length/validity; it does not stop startup (:14117-14130).
- Gap: `ConnectionService.createConnection` inserts `config` (including secrets) as plaintext `JSON.stringify(config)` (ConnectionService.js:707); the `encryptSensitiveFields` calls are in the update path (ConnectionService.js:775-836).

### 12. Secrets loading - backend/config/config-secrets.js
- Auto-runs `initializeSecrets()` and `getAllSecretData()` on require (:158-164).
- If `DATABASE_URL` env is set, AWS is not contacted (:45-50, :119-122). Otherwise reads AWS secret id hard-coded `"filevantage-prod"` in init (:56) but `AWS_SECRET_ID || 'filevantage-prod'` in getAllSecretData (:126); region default `us-east-2` (:18). Builds `postgres://user:password@host:port/db` (password not URL-encoded, :76) and writes it to `process.env.DATABASE_URL` (:86). On failure falls back to env (Okta vars; `OKTA_ISSUER` default `https://<OKTA_DOMAIN>/oauth2/default`, :29).

### 13. JWT/config validation - backend/src/config/environment.js
- JWT_EXPIRATION default '30m', refresh '7d', BCRYPT_SALT_ROUNDS 12, COOKIE_SECRET default 'cookie-secret-change-in-production' (:36-39).
- Missing JWT_SECRET: throw in production, otherwise random 64-byte hex (:62-81). Production also throws if secret contains weak words (`secret`, `test`, `password`, etc.) or length < 64 (:85-104).
- Rate limit env `RATE_LIMIT_WINDOW_MS` 900000 and `RATE_LIMIT_MAX` 500 are defined in APP_CONFIG (:19-20) but server.js uses hard-coded values.

### 14. Utilities
- regexValidator.safeRegex: max length 200, flags `[gimsuvy]`, blacklist of nested-quantifier patterns, alternations <= 10, capturing groups <= 20 (regexValidator.js:23-74). `globToRegex` used by CORS (server.js:527), filePatternMatcher, cloudStorageFileList.
- pathValidator.safePath / isSafeFilename: used by DBTService.js:5 only (grep of backend).
- credentialSanitizer.sanitizeCredentials: redacts keys containing any of 16 sensitive names (substring, case-insensitive) with '[REDACTED]' (:8-25, :43-49). Used via `createCredentialsSummary` by NotificationService and the Gmail/Outlook adapters.

## Data touched
- Reads: users (via userRepository), roles, permissions, role_permissions, user_groups, access_group_roles, project_members, project_access_groups, projects (parent_id, is_active), files, transformation_mappings, mapping_groups, business_processes, workflow_steps, schedules, storage_connections, alert_policies, transformation_jobs.
- Writes (register, server.js:10538, :10556): users, user_roles. Reads roles by name (:10547). Writes storage_connections.config in plaintext on create (ConnectionService.js:684-707).
- Redis: `permissions:user:<id>` TTL 600 s.
- Process env: writes `DATABASE_URL` (config-secrets.js:86). External: AWS Secrets Manager `filevantage-prod`.
- idempotency_keys is listed for SEC in the inventory but is not touched by any code read for this area (not verified).

## Flags

### SECURITY
- S1. `/api/db_url` returns full DATABASE_URL without authentication (server.js:10780-10795). CORS does not block callers without an Origin header (:520).
- S2. `/api/secrets` unauthenticated, returns Okta config and BACKEND_URL (server.js:10758-10768); values are public-client settings but the endpoint is open.
- S3. Project id taken from client-supplied `params.projectId`, `query.project_id` or `body.project_id` before the resource lookup (requireProjectAccess.js:183-191). A member of project A can pass their own project id for a resource in project B and pass the membership check, because the resource's real project is only looked up if none is supplied; it is never cross-checked against the resource's real project.
- S4. `projectRoles` option (Owner/Admin/Member/Viewer) is accepted but never used; any member passes, and `req.projectRole` is only set for admin bypass (requireProjectAccess.js:32, :66-76, :150-153). `checkProjectMembership` returns `role: null` (:345).
- S5. Legacy `authenticate` does not reject refresh tokens and does not check the user still exists (backend/middleware/authenticate.js:32-35) vs new middleware (backend/src/middleware/authenticate.js:41, :50). Whether refresh tokens carry `type:'refresh'` is signed at authService.js:49 (payload not read). Routes using legacy: userManagement, schemaValidation, vendorAgreementTemplateRoutes, cacheRoutes, bulkProfiling, apiTokenRoutes.
- S6. Legacy `authenticate` reads `process.env.JWT_SECRET` while everything else uses `SECURITY_CONFIG.JWT_SECRET`; in development environment.js generates a random secret if unset (environment.js:80) so the two can differ and legacy returns 500.
- S7. CSP `scriptSrc` includes `'unsafe-inline'` (server.js:471), though helmet is never applied (S15). CSRF disabled (server.js:782-795), justified in comment by header-based JWT; session cookie is set but session store is MemoryStore.
- S8. Session secret falls back to the JWT secret (server.js:594).
- S9. AWS-built DATABASE_URL does not URL-encode the password (config-secrets.js:76) while db_url fallback does (server.js:10788). Also logs first 20 chars of the URL (config-secrets.js:88), which can include username.
- S10. `COOKIE_SECRET` has a hard-coded default and is not rejected in production (environment.js:39). Not shown to be used (not traced).
- S11 (dormant, not exploitable: register always returns 400, see entry 10a and B11). Register accepts `roles` from the body (validation.js:173) and inserts them into user_roles with no check of what the caller may grant (server.js:10546-10560); the only gate is the `user_create` object-permission check (:10516), so a `user_create` holder could grant Admin if the handler were reached.
- S12. Rate limiters use the in-process default store: limits are per instance (server.js:643-698).
- S13. Rate limit config mismatch: `RATE_LIMIT_*` env vars not applied to the live limiters (environment.js:19-20 vs server.js:644-645).
- S14. Body limit 50mb on JSON and urlencoded (server.js:556-557).
- S15. Helmet (CSP, HSTS) is inert / never applied: it is registered after `await getAllSecretData()` (server.js:435-437, :467), i.e. after `errorHandler` (:14041), which always responds; it is also not installed if that call throws (:490-491). See entry 4.
- S16. `ConnectionService.createConnection` stores `config`, including secrets, as plaintext JSON (ConnectionService.js:707).

### BUG
- B1. Comment says 100 requests but `max: 500` (server.js:645; also environment.js:20).
- B2. `config-secrets.js` uses the hard-coded `SecretId: "filevantage-prod"` at init (:56) but honours `AWS_SECRET_ID` in `getAllSecretData` (:126); the two can read different secrets.
- B3. `backend/src/middleware/security.js:10` imports `CORS_CONFIG` and `RATE_LIMIT_CONFIG` from environment.js, which exports neither (environment.js:140-145); `configureSecurityMiddleware` would throw on `CORS_CONFIG.ALLOWED_ORIGINS`.
- B4. `userHasPermission` does not match object permissions by `resource:action` (permissionHelpers.js:19-21) whereas authorize/authorizeProjectResource do (authorize.js:40-42); `requirePermission` additionally supports `*` wildcards (authenticate.js:350-351). Three different matching rules.
- B5. Password regex permits only the characters `[A-Za-z\d@$!%*?&]` so passwords with other special characters (e.g. `#`) are rejected, while the message says "one special character" (validation.js:154, :159).
- B6. `uniquePermissions = [...new Set(permissions)]` does not dedupe object permissions (authenticate.js:290); log prints `permissions.length` not unique length (:291).
- B7. Startup ENCRYPTION_KEY check only warns (server.js:14125-14130) while encryption.js throws at require; if the module is loaded earlier the app fails differently.
- B8. In authorizeProjectResource, the project check is wrapped in a promise that resolves only when `requireProjectAccess` calls `next` (authorizeProjectResource.js:67-71). On denial (400/403/404/500) requireProjectAccess responds itself and never calls `next` (requireProjectAccess.js:61, :111, :129, :144, :172), so the promise stays pending forever; the `.catch` (:72-75) and the `res.headersSent` branch (:78-80) are not reached on denial. Result: one leaked pending async function per denied request, not a throw.
- B9 (dormant, handler never reached). `/api/auth/register` handler reads `fullName`, which userSchema does not define and Joi strips, so full_name is saved as undefined (server.js:10521, :10540; validation.js:170-171, :15-19).
- B10 (dormant, handler never reached). `/api/auth/register` uses `bcrypt.genSalt(10)` (server.js:10534), so `BCRYPT_SALT_ROUNDS` (12, environment.js:36-39) is not applied.
- B11. userSchema requires `params.id` (validation.js:176-182) but the register route has no `:id` (server.js:10513), so `req.params` is `{}` and register always returns 400 "User ID is required" (validation.js:64-78) before the handler runs.
- B12. The 404 "Project not found" in requireProjectAccess.js:124-133 is unreachable because the 403 at :111 fires first when the project is missing.

### DUPLICATE
- D1. Two JWT authentication implementations: backend/src/middleware/authenticate.js (DB lookup, permissions, roles, features, refresh rejection) vs backend/middleware/authenticate.js (token only; `req.user.roles` and `req.user.permissions` come from the token payload only).
- D2. Admin checks differ in the permission list: `hasAdminRole` / `userHasAdminAccess` / `userHasAllProjectAccess` in permissionHelpers.js (`all_projects:read` only in AllProjectAccess, :65-70 vs :85-89); a third `userHasAdminAccess` in server.js:380-403 (`users:write`, `roles:write` only) used by `requireAdmin` (server.js:5417); a fourth predicate in digestRoutes.js:17-34. A permission set satisfying permissionHelpers.js:80 via `project_management:write` does not satisfy requireAdmin.
- D3. Two permission-check implementations: `requirePermission` (authenticate.js:309) and `authorize` (authorize.js:17), plus the inline Layer 2 in authorizeProjectResource.js:85-122.
- D4. Two project-access-by-membership implementations: server.js:727-734 (inline in `/api/files/:fileId/status`) and requireProjectAccess.js:84-102; the inline one does not check parent project or `is_active`.
- D5. Two CORS configurations: server.js:513-555 (live) and security.js:18-25 (dead); Flask has a third (profile_api.py:55-63) with different defaults (`https://localhost:*`, no filesense.blumetra.com).
- D6. Three rate limiter implementations: server.js limiters, security.js apiLimiter, enterpriseRateLimiter.js.
- D7. Two secrets sources of Okta config: `/api/secrets` and VITE_* env in frontend when `VITE_ENV==='development'`.

### DEAD
- X1. backend/src/middleware/security.js: `configureSecurityMiddleware` referenced nowhere else except coverage output (grep across *.js/*.json/*.md).
- X2. backend/middleware/hybridAuthorization.js (exports HybridAuthorizationMiddleware, initializeAuthMiddleware), policyAuthorization.js (exports PolicyAuthorizationMiddleware; both depend on `../services/policyEngine`) and enterpriseRateLimiter.js: no `require` of them found in any .js outside coverage/ and extraction/ (grep). Dead status confirmed.
- X3. pathValidator: used only by DBTService.js:5 (not dead, but nearly unused for uploads).
- X4. `ENABLE_CSRF`, `BCRYPT_SALT_ROUNDS`, `JWT_REFRESH_EXPIRATION` in SECURITY_CONFIG: only the last is shown used (authService.js:52); `BCRYPT_SALT_ROUNDS` is not used by the register handler (server.js:10534); the others not traced.
- X5. Legacy test-only `JWT_EXPIRES_IN` (tests/setup.js:10 per inventory), not read.
- X6. Express session: configured (server.js:593-602) and used only as an audit session id: `req.sessionID` in server.js (:5698, :5745, :5789), projectRoutes.js, transformations.js:960, visualMappings.js:711, and `req.session?.id` in auditMiddleware.js:139 and fileAudit.js:23. No other `req.session` use found in backend.

### UNCLEAR
- U1. `extractFileId` (server.js:410-430) sets `req.params.fileId` in an app-level middleware, where `req.params` is not yet populated for later routes; effect on handlers unknown.
- U2. enterpriseRateLimiter "fail open on Redis error" and `SKIP_RATE_LIMIT` (:117, :209) are moot while unreferenced.
- U3. Session is configured "for Okta SSO" (server.js:592); the session is read only for an audit session id (X6); no Okta SSO use of it is shown.

## Domain terms
- authenticateToken / authenticate: two names for JWT verification middleware.
- Admin bypass / all-project access / admin access: permission-derived admin, three helper names.
- effectiveRoles = direct roles + groupInheritedRoles (access groups).
- features: UI menu items derived from permissions.
- projectRoles Owner/Admin/Member/Viewer (declared, unused).
- Sub-project inherits parent membership.
- Secrets: AWS secret `filevantage-prod`; "Replit Secrets" (server.js:14130).
- Tier: basic/premium/enterprise/admin multipliers 1/2/5/10 (enterpriseRateLimiter.js:66-71, unused).
- user_create: object permission name required by the register handler (server.js:10516).

## Open questions
1. Does any route actually use `userHasPermission` for object permissions, and are role/permission `name` values stored as `resource:action`? (permissionHelpers.js:12-23)
2. Is /api/db_url blocked at the network level (it is on the public Express app, server.js:10780)?
3. Do refresh tokens carry `type:'refresh'` (authService.js:49 payload not read)? (The list of routes using legacy `authenticate` is now enumerated in entry 6.)
4. How are `ENABLE_CSRF` and `COOKIE_SECRET` consumed, if at all?
5. (Closed: register always returns 400 because of the `params.id` requirement, see entry 10a and B11; S11, B9, B10 are dormant.)
6. Which side of the legacy vs new auth is intended for new code?
7. idempotency_keys (inventory row 928, PRJ/SEC): no SEC code touching it was found.
8. (Closed: hybridAuthorization.js and policyAuthorization.js are unreferenced dead code, see X2.)
9. (Closed: helmet is inert, registered after errorHandler, see entry 4 and S15.)
10. (Closed: a blocked CORS origin yields 500 INTERNAL_ERROR, see entry 4.)

## Inventory corrections
- inventory row for ENCRYPTION_KEY says server.js:14118 "logs key length only": confirmed (:14120-14125).
- `generalLimiter` is mounted at server.js:767, not 643 (643 is its definition); authLimiter and uploadLimiter (used by 6 other routes) are not in the inventory under SEC.
- `backend/utils/credentialSanitizer.js` and `pathValidator.js` are not dead (used by NotificationService/email adapters and DBTService). `security.js` is also dead and broken (B3).
