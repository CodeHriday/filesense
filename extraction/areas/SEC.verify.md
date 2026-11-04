# SEC verification (final re-verify after fix round 2)

Verdict: FIX (minor). No WRONG claim of substance; one imprecise claim, two UNSUPPORTED, one missed item.

Counts: checked 52, wrong 1 (minor wording), unsupported 2, missed 1.

## Round-2 changes: all CORRECT
- Helmet inert (entry 4, S7, S15, Q9): `app.use(helmet)` is inside the async IIFE after `await getAllSecretData()` (server.js:435-437, :467). Everything else is registered synchronously, ending with `app.use(errorHandler)` at :14041. errorHandler (backend/middleware/errorHandler.js:39-101) always responds and never calls next. The `catch` at :490-491 only logs. CORRECT.
- Chain tail: static :14007, catch-all :14011-14023 (block closes :14024), 404 handler :14030-14037, errorHandler :14041. CORRECT.
- CORS block gives `Error('Not allowed by CORS')` at :547. It falls to the default branch of errorHandler, 500 `INTERNAL_ERROR`, with stack/originalError outside production (errorHandler.js:86-97). CORRECT.
- Session wording: server.js:5698, :5745, :5789 use `req.sessionID`. transformations.js:960, visualMappings.js:711 and projectRoutes.js use `req.sessionID`. fileAudit.js:23 uses `req.session?.id`. No `req.session` use in server.js. CORRECT, except for the auditMiddleware.js:139 point under WRONG below.
- Register always 400: userSchema has `params: Joi.object({id: required})` (validation.js:176-182). validateRequest validates params when present (:64-78). The route `/api/auth/register` has no `:id` (server.js:10513). S11, B9, B10 and Q5 are consistent as dormant/closed. CORRECT. Order is authLimiter, then authenticateToken, then validate.
- Legacy authenticate no-token 401 (backend/middleware/authenticate.js:16-22): CORRECT. The 500 for missing JWT_SECRET (:26-29), TOKEN_EXPIRED (:42-44) and `req.user = decoded` (:35) are CORRECT.
- requirePermission :309-329 and checkPermission :337-359 (string match, then object resource/action with `*`): CORRECT.

## Other claims checked (CORRECT unless noted)
- Entry 1/2: server.js:10758-10773 and :10780-10800 (env first, fallback to secret fields, encodeURIComponent, 500 messages).
- generalLimiter :643-667: skip list :653, 429 body :660, mount :767, and `/api/files/:fileId/status` at :703 registered before it. Limiter values: authLimiter 5/15 min with skipSuccessfulRequests :667-671; uploadLimiter 20/1 h :685-688; routes using them (authLimiter :10417, :10513, :10830).
- CORS defaults :513-515, no-origin allowed :520, wildcard via globToRegex :527-530, methods/headers/credentials :550-552.
- Body limit 50mb :556-557, session :593-602, timeouts :612-640, prod probe :573-589.
- Helmet config :467-489, including `unsafe-inline` :471, HSTS, and the Okta domain at :444-451.
- authenticateToken (new) :17-90: token split, 401s, refresh type check :41, findById :50, 404 to 401 :75-79, 500 :83-88, effectiveRoles :64-67, features :70.
- requireProjectAccess :37-148: 400 before bypass, bypass :66, membership query on parent too :84-102, 403 :111, 404 :129 unreachable, is_active 403 :144. extractProjectId :181-199 (parseInt). Lookup errors give null at :213-219.
- authorizeProjectResource B8 :67-80 and Layer 2 :85-122. authorize.js :17-69.
- permissionHelpers :12-23, :42-51, :60-73, :80-92. Server.js third copy :380-403 (`users:write`, `roles:write` only). The `requireAdmin` usages and line numbers listed in entry 9 all match the grep.
- `/api/files` + schemaHistoryRoutes :5283. Legacy `authenticate` users list (userManagement, schemaValidation, vendorAgreementTemplate, cache, bulkProfiling, apiToken) matches the grep.
- Validation: password regex :154, userSchema :173, firstName/lastName only :170-171.
- config-secrets.js: :45-50, :56 vs :126, :76, :86, :88, :111-146, :158-164.
- environment.js :19-20, :36-40, :62-104.
- ENCRYPTION_KEY startup log server.js:14117-14131; encryption.js GCM/CBC split; ConnectionService.js:707 plaintext and :828 encrypt in the update path.
- regexValidator limits :24-72; pathValidator used only by DBTService.js:5; credentialSanitizer used by the 3 services; dead modules grep (only security.js references configureSecurityMiddleware).
- profile_api.py:182-183.

## Findings
1. WRONG (minor wording), X6 and entry 4: the notes say auditMiddleware.js:139 reads `req.session?.id`. The code is `req.sessionID || req.session?.id || null`, so it prefers `req.sessionID`. Only fileAudit.js:23 reads `req.session?.id` alone.
2. UNSUPPORTED/imprecise, entry 4 tail: the static handler (:14007) and the SPA catch-all (:14011-14023) are inside `if (process.env.NODE_ENV === 'production')` (:13968). The notes say only "conditional block" and "registered synchronously at top level". In non-production there is no catch-all, and non-API unknown paths hit the 404 handler. The condition should be stated.
3. UNSUPPORTED, Open Question 7, Data touched and the "idempotency_keys not touched by any code read" claim: `backend/src/middleware/idempotency.js` (createIdempotencyMiddleware) reads and inserts `idempotency_keys` (:41, :76) and deletes expired rows (:113). It is used by projectRoutes.js:11. It is a security-area middleware dir file, and the inventory lists the table for SEC. Missing as an entry or section (Idempotency-Key header, 255 char limit, user-scoped lookup, cleanup). It is not just "not found".
4. Minor imprecision, timeouts: the response-timeout callback sends the 408 only if `!res.headersSent` (:632), but always destroys the socket (:636). The notes imply the 408 is unconditional. The request-timeout 408 (:620) has no headersSent guard.
5. Not covered, low priority: the 401/403 responses of `requirePermission` (:311-325, 401 when `req.user.permissions` is falsy) are not described. Other middleware files in backend/middleware (apiTokenAuth.js, vendorAccessControl.js, vendorPermissions.js) are not mentioned. They are presumably owned by other areas.

Rewrite loss check: nothing from the earlier flagged material appears lost. Flags S1-S16, B1-B12, D1-D7 and X1-X6 are all present and consistent.

Coverage: all inventory rows assigned to SEC (generalLimiter :767, /api/secrets, /api/db_url, ENCRYPTION_KEY hook, env vars) have subsections. idempotency_keys is addressed only as unverified (finding 3).
