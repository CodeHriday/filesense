# AUTH - Authentication & sessions

## Summary

AUTH covers how a person gets a token and how the browser keeps it. The paths are local username/password login with lockout, Okta SSO (the browser runs PKCE and the backend only "syncs" the user), JWT access and refresh tokens, two different "must change password" mechanisms, an admin-approved password reset queue, and user creation (the inventory calls this "self-registration").

- The live backend handlers are inline in `server.js` (L10237-11082) plus four routes in `backend/routes/userManagement.js`. The router is mounted at `/api/users` with no router-level auth (server.js:5354-5355).
- Token logic lives in `backend/src/services/authService.js`.
- Lockout and password rules live in `backend/services/enhancedAuthService.js` and `backend/utils/passwordSecurity.js`.
- `backend/src/routes/auth.js` and `backend/src/controllers/authController.js` form a second, unreachable auth API.
- The frontend state is held in `src/context/AuthContext.jsx`. Tokens are kept in `localStorage`, and the client refreshes on any 401 or 403.

Configured values that drive behaviour:
- Access token: `JWT_EXPIRATION` defaults to `'30m'` (backend/src/config/environment.js:36). The response field `expiresIn` is hard-coded to `30 * 60` (authService.js:269, :336; server.js:10406).
- Refresh token: `JWT_REFRESH_EXPIRATION` defaults to `'7d'` (environment.js:37). The DB row's `expires_at` is now + 7 days (authService.js:95-96).
- `BCRYPT_SALT_ROUNDS` defaults to `'12'` (environment.js:38). Most auth code ignores it and uses `10` (see Flags).
- `JWT_SECRET` is required in production and must be at least 64 chars and not contain a weak word, otherwise startup throws (environment.js:62-71, 85-104). In non-production a random 64-byte secret is generated when it is unset (environment.js:80).
- Password policy (passwordSecurity.js:10-20):
  - `minLength: 12`
  - upper, lower, number and special required; special set `'!@#$%^&*()_+-=[]{}|;:,.<>?'`
  - `historyCount: 5`
  - `maxFailedAttempts: 5`
  - `lockoutDurationMinutes: 15`
- `authLimiter` (server.js:667-682):
  - 15-minute window, `max: 5` per IP, `skipSuccessfulRequests: true`, 429 `{error:'Too many authentication attempts, please try again later'}`.
  - The same limiter instance is used on `/api/auth/login`, `/api/auth/register` and `/api/auth/request-password-reset` (server.js:10417, :10513, :10830).
  - `trust proxy` is `1` (server.js:110).
- `generalLimiter`: 500 per 15 min per IP on `/api/` (server.js:643-664, :767).
- Express session (server.js:593-602):
  - secret is `SESSION_SECRET`, falling back to `SECURITY_CONFIG.JWT_SECRET`
  - cookie `httpOnly`; `secure` only in production; `maxAge` 24 h
  - No AUTH handler reads or writes `req.session`.

## Entry points

### POST /api/auth/okta/user (server.js:10237)
- **Trigger:** `src/pages/OktaCallback.jsx:80` after the browser has exchanged the Okta code for tokens and fetched `/userinfo`.
- **Who may call:** anyone. There is no auth middleware, and the handler never verifies an Okta token (server.js:10237-10247).
- **Input:** body `{okta_id, email, username, full_name}`. Only `okta_id` is checked (400 `{error:'Okta ID is required'}`, :10241-10243). The frontend sends `okta_id = userinfo.sub` and `username = preferred_username || email` (OktaCallback.jsx:84-87).
- **Behaviour:**
  - Looks up `users` by `okta_id` (:10247).
  - If no user is found, it inserts one (:10263-10268):
    - fields `username, password, email, full_name, okta_id`, with `auth_provider = 'okta'`
    - `password` is bcrypt(10) of `Math.random().toString(36).slice(-16)` (:10260-10261)
    - then assigns the first row of `SELECT id FROM roles WHERE name = 'User' OR name = 'Executor' LIMIT 1` (:10273-10282)
  - An existing user's email, name and username are not updated.
  - Sets `last_login = NOW()` (:10288).
  - Roles come from `user_roles` only. Group-inherited roles are not included (:10291-10298).
  - Permissions:
    - starts with core `['dashboard:read','file_profile:read','quality_checks:read']` (:10303-10308)
    - plus objects `{name,resource,action}` from `role_permissions` (:10313-10326)
    - plus `roles.permissions` (array, or `Object.values` of an object) (:10329-10359)
    - plus eight hard-coded `*:read` permissions when a role is named `Executor` (:10337-10349)
    - de-duplicated with `Set` (:10365)
  - Issues an access and a refresh token via authService and stores the refresh token (:10368-10380).
- **Output:** 200 `{user: {...users row without password, roles, permissions, roleDetails}, tokens:{accessToken, refreshToken, expiresIn:1800}}` (:10392-10408). Any error returns 500 `{error:'Failed to authenticate Okta user'}` (:10409-10413).
- **Side effects:** `users` insert/update, `user_roles` insert, `refresh_tokens` insert, a winston info log (:10383-10390).

### POST /api/auth/login (server.js:10417)
- **Trigger:** `Login.jsx:92` and then `AuthContext.login` at `AuthContext.jsx:177`. The page calls login twice; see BUG-7.
- **Who may call:** anyone. Limited by `authLimiter`.
- **Validation:** Joi `loginSchema` requires string `username` and `password` (validation.js:188-202). Options are `abortEarly:false`, `allowUnknown`, `stripUnknown` (validation.js:15-19). On failure it returns 400 `{error:'Validation Error', message, errors:[{field,message}]}` (validation.js:31-35). The handler checks both fields again (server.js:10421-10427).
- **Flow:** `enhancedAuthService.authenticateUserWithSecurity` (enhancedAuthService.js:19-158):
  1. `SELECT * FROM users WHERE username = $1 OR email = $1`, case-sensitive (:22-26). No row: `{success:false, message:'Invalid username or password'}`.
  2. If `auth_provider` is set and is not `'local'`: message ``This account uses ${auth_provider.toUpperCase()} SSO. Please use the SSO login button.``, `useSso:true` (:38-45). The route returns 401 `{error, useSso, ssoProvider}` (server.js:10452-10464).
  3. If `locked_until > now`, the account is locked. `remainingTime = ceil(ms/60000)` minutes (passwordSecurity.js:125-140). The route returns 403 `{error, locked:true, remainingTime}` (server.js:10437-10449).
  4. If `locked_until` is set but in the past, it resets `failed_login_attempts=0, locked_until=NULL` (enhancedAuthService.js:59-69).
  5. bcrypt-compares the password.
     - On mismatch: `failed_login_attempts+1`. At 5 or more it sets `locked_until = now + 15 min` (passwordSecurity.js:156-165, :146-149) and returns `locked:true` with "Account has been locked ... try again in 15 minutes." In this case the route returns 403 with no `remainingTime`.
     - Otherwise: "Invalid username or password. N attempt(s) remaining before account lockout." (enhancedAuthService.js:74-110). The route returns 401 `{error: message}` (server.js:10472).
  6. On a match: resets attempts and lock, sets `last_login` (enhancedAuthService.js:113-122).
  7. If `must_change_password` is set: returns `{success:true, requiresPasswordChange:true, userId, username, passwordChangeToken}`. The token is JWT `{userId, purpose:'password_change_only', username}`, `expiresIn:'10m'` (:125-148). See BUG-1: the route crashes on this result.
  8. Otherwise it calls `authService.authenticateUser(username, password, userAgent)` (:152). That calls `userRepository.validateCredentials`:
     - `findByUsername` (`WHERE u.username = $1`, userRepository.js:165-196)
     - bcrypt compare again
     - `last_login` update again (userRepository.js:593-619)
     - then generates tokens, stores the refresh token, and starts `cleanupExpiredTokens()` in the background (authService.js:234-276)
- **Output:** 200 `{user:{id,username,email,roles,internal_user,user_type,force_password_change}, token, tokens:{accessToken,refreshToken,expiresIn:1800}, refreshToken, force_password_change}`. `token` and `refreshToken` are duplicated "for backward compatibility" (server.js:10488-10494). Errors return 500 `{error: sanitizeError(...)}`: the generic message in production and `err.message` otherwise (server.js:125-139, :10495-10498).
- **Access token payload:** `{id, username, email, roles, internal_user (default true if undefined), user_type || null}` (authService.js:21-36).
- **Refresh token payload:** `{id, type:'refresh'}` (authService.js:43-54).

### GET /api/auth/password-requirements (server.js:10502)
- **Who may call:** anyone.
- **Output:** `{minLength:12, requireUppercase, requireLowercase, requireNumbers, requireSpecialChars, historyCount:5, maxFailedAttempts:5, lockoutDurationMinutes:15}` (passwordSecurity.js:182-193). Errors return 500 `{error:'Failed to fetch password requirements'}`.
- **Frontend callers:** none found. The frontend calls the `/api/users/` copy instead (PasswordChangeRequired.jsx:25).

### POST /api/auth/register (server.js:10513)
- **Who may call:** middleware order is `authLimiter`, then `authenticateToken` (JWT), then `validateRequest(userSchema)`. The handler then requires `req.user.permissions.some(p => p.name === 'user_create')`, otherwise 403 `{error:'You do not have permission to create users'}` (:10516-10519).
- **Validation (userSchema, validation.js:142-183):**
  - `username`: alphanum, 3-30 chars
  - `password`: 8-100 chars, regex `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$`
  - `email`: valid email
  - `firstName`, `lastName`: max 50
  - `roles`: string array, default `['User']`
  - `params.id` is required (see BUG-3)
- **Behaviour:** duplicate username returns 400 `{error:'Username already exists'}` (:10528-10531). Otherwise bcrypt(genSalt 10), then `INSERT INTO users (username,password,email,full_name)`, then `user_roles` rows for the role names that exist (:10534-10561).
- **Output:** 201 with the user row without password (:10564-10565). Errors return 500 `{error:'An error occurred during registration'}`.
- **Frontend callers:** none found.

### GET /api/auth/me (server.js:10573)
- **Trigger:** on app load when `localStorage.token` exists (AuthContext.jsx:117-121, :134), and right after login (AuthContext.jsx:212).
- **Who may call:** JWT.
- **Behaviour:**
  - `SELECT * FROM users WHERE id = req.user.id`. No row returns 404 `{error:'User not found'}` (:10582-10587).
  - Roles are always read fresh: direct `user_roles` UNION roles inherited through `access_group_roles` and `user_groups` (:10595-10607).
  - Permissions use the same recipe as the Okta handler: core 3, then `role_permissions` objects, then `roles.permissions` (array or object values), then the Executor extras (:10614-10716).
- **Output:** 200 `{...all users columns except password, roles, permissions (deduped), roleDetails:[{id,name,permissions}]}` (:10725-10736). Errors return 500 `{error:'An error occurred while fetching user info'}`.

### POST /api/auth/logout (server.js:10744)
- **Who may call:** JWT.
- **Behaviour:** `DELETE FROM user_sessions WHERE token = <bearer access token>` (:10746-10749). The body (the frontend sends `{refreshToken}`, AuthContext.jsx:262-268) is ignored. No refresh token is revoked.
- **Output:** 200 `{message:'Logged out successfully'}`. Errors return 500 with `sanitizeError`.

### POST /api/auth/refresh (server.js:10802)
- **Trigger:** the axios response interceptor on any 401 or 403 when `_retry` is not set (AuthContext.jsx:360-372).
- **Who may call:** anyone holding a refresh token. Only `generalLimiter` applies.
- **Input:** body `{refreshToken}`. Missing returns 400 `{error:'Refresh token is required'}`.
- **Behaviour** (`authService.refreshAccessToken`, authService.js:284-343):
  1. Verifies the JWT signature. Failure gives "Invalid refresh token".
  2. Requires `type === 'refresh'`, otherwise "Invalid token type".
  3. Loads all `refresh_tokens` rows for the user with `is_revoked = FALSE AND expires_at > NOW()`, newest first, and bcrypt-compares each row (authService.js:129-158). No match gives "Refresh token expired or revoked".
  4. `userRepository.findById`, served from Redis cache key `user:<id>` with TTL 300 s (userRepository.js:107-158).
  5. Issues new tokens, revokes the matched row (`is_revoked=TRUE, revoked_at=NOW()`), and stores the new refresh token.
- **Output:** 200 `{success:true, user:{id,username,email,roles,internal_user,user_type}, tokens:{accessToken,refreshToken,expiresIn:1800}}`. A failed result returns 401 `{error: message}`. A thrown error returns 500.

### POST /api/auth/request-password-reset (server.js:10830)
- **Trigger:** the "Forgot Password?" modal (Login.jsx:157). The link is shown only after a failed login (Login.jsx:386-396).
- **Who may call:** anyone. Limited by `authLimiter`; a success (200) is not counted.
- **Input:** body `{username}`, which may be a username or an email. Missing returns 400 `{error:'Username or email is required'}`.
- **Behaviour:**
  - If no user matches, or `auth_provider !== 'local'`, it returns 200 with the generic `'If the user exists, a password reset request has been submitted to the administrators.'` (:10844-10855).
  - If a `pending` request already exists, it returns 200 `'A password reset request is already pending for this account.'` (:10858-10867). This reveals that the account exists.
  - Otherwise it inserts `password_reset_requests (user_id, status='pending')` and returns 200 `'Password reset request submitted. An administrator will review your request.'` (:10870-10882). This also differs from the generic message.
- **Side effects:** no email or notification is sent. A winston log entry is written (:10876-10880).

### POST /api/auth/force-change-password (server.js:10890)
- **Trigger:** the `ForcePasswordChange` modal (ForcePasswordChange.jsx:35). AuthContext shows it when `force_password_change` is set (AuthContext.jsx:152-154, :201-207).
- **Who may call:** JWT, for your own account (`req.user.id`).
- **Input:** `{newPassword}`. Missing returns 400. It is checked with `passwordSecurity.validatePasswordStrength`; failure returns 400 `{error:'Password does not meet requirements', details:[...]}` (:10900-10907).
- **Behaviour:** bcrypt(genSalt 10), then `UPDATE users SET password, force_password_change = FALSE` (:10910-10919). It does not check:
  - the current password
  - that `force_password_change` was actually set
  - `auth_provider`
  - password history
  It also does not write `password_history`.
- **Output:** 200 `{message:'Password changed successfully'}`. The frontend then reloads the page (AuthContext.jsx:247-253).

### GET /api/password-reset-requests (server.js:10934)
- **Who may call:** JWT plus `userHasAdminAccess` (server.js:380-403). That means role `Admin` or `admin` (string, or object `name`/`role_name`), or permission `users:write` or `roles:write`. Otherwise 403 `{error:'Access denied. Admin privileges required.'}`.
- **Output:** every request row (no pagination):
  - fields `id,user_id,requested_at,status,approved_by,approved_at,denied_at,notes,username,email,full_name,approved_by_username`
  - sorted pending first, then `requested_at DESC` (:10942-10964)
- **Frontend callers:** UserManagement.jsx:168, :179.

### POST /api/password-reset-requests/:id/approve (server.js:10972)
- **Who may call:** same admin check as the GET.
- **Input:** `:id` (`parseInt`) and body `{notes}`.
- **Behaviour:**
  - No such id returns 404 `{error:'Password reset request not found'}`.
  - Status other than `pending` returns 400 `{error:'This request has already been processed'}`.
  - Otherwise it sets the user's password to bcrypt(10) of `'TempPass@' + new Date().getFullYear()` and `force_password_change = TRUE` (:11000-11010).
  - Then it updates the request to `status='approved', approved_by=req.user.id, approved_at=NOW(), notes` (:11013-11018).
- **Output:** 200 `{message:'Password reset approved. Temporary password has been set.', tempPassword}` (:11027-11030). The UI shows the temp password to the admin (UserManagement.jsx:200-204).
- **Not done:** the two updates are not in a transaction. `failed_login_attempts`, `locked_until`, `password_history` and refresh tokens are not touched.

### POST /api/password-reset-requests/:id/deny (server.js:11038)
- **Who may call:** same admin check.
- **Behaviour:** same 404/400 checks, then `status='denied', approved_by=req.user.id, denied_at=NOW(), notes` (:11064-11069). The denier is stored in `approved_by`.
- **Output:** 200 `{message:'Password reset request denied'}`.

### POST /api/users/register (backend/routes/userManagement.js:53)
- **Trigger:** the admin "create user" form: UserManagement.jsx:412 calls `createUser` (src/api/authService.js:81-83).
- **Who may call:** anyone. There is no middleware on the route (userManagement.js:53) and none on the mount (server.js:5355). No `authLimiter`.
- **Input** (`registerLocalUser`, enhancedAuthService.js:165-334): `username, password, email, first_name, last_name, middle_name, phone_number, internal_user (default false), user_type, roles (default [])`.
- **Validation:**
  - required: non-blank username, email, password
  - `phone_number`: digits only (`/^\d*$/`), at most 10 chars
  - password strength (12-char policy)
  - username or email must not already exist, compared case-insensitively (`LOWER(...)`)
- **Behaviour:** inside a transaction it inserts the user with:
  - `auth_provider='local'`, `failed_login_attempts=0`
  - `password_history = JSON.stringify([hash])`
  - `internal_user`, `user_type` from the body
  Each `roles` entry is looked up by numeric id or by name, and unknown roles are skipped with a warning (:283-316).
- **Output:**
  - 201 `{message:'User registered successfully', user:{id,username,email,first_name,last_name,auth_provider,internal_user,user_type, roles}}` (userManagement.js:64-67)
  - validation failure: 400 `{error:'Registration failed', message, errors}`
  - thrown errors go through `asyncHandler` to `backend/middleware/errorHandler.js`, which returns 500 `{error:{message,code:'INTERNAL_ERROR',...}}` (errorHandler.js:85-101)

### GET /api/users/password-requirements (userManagement.js:74)
- **Who may call:** anyone.
- **Output:** the same object as `/api/auth/password-requirements`.
- **Frontend callers:** PasswordChangeRequired.jsx:25.

### POST /api/users/change-password-required (userManagement.js:84)
- **Trigger:** `PasswordChangeRequired.jsx:83`. That page is rendered by Login.jsx when the login response has `requiresPasswordChange` (Login.jsx:97-104, :179-188).
- **Who may call:** anyone holding a `passwordChangeToken` in the body.
- **Input:** `{userId, newPassword, passwordChangeToken}`. Any missing returns 400 `{error:'Missing required fields', ...}` (:87-92).
- **Token checks:** `jwt.verify` with `JWT_SECRET`.
  - invalid or expired: 401 `{error:'Invalid or expired token', message:'Your password change session has expired. Please log in again.'}`
  - `purpose !== 'password_change_only'`: 403
  - `decoded.userId !== userId` (strict): 403 `{error:'Unauthorized', message:'You can only change your own password'}` (:98-121)
- **Then:** calls `enhancedAuthService.validatePassword(newPassword)` (:124). That function does not exist (BUG-2). The code after it would hash with `BCRYPT_SALT_ROUNDS`, set `must_change_password = FALSE`, return 404 if no row is updated, and otherwise return `{success:true, message, user:{id,username,email}}` (:133-158).
- **Frontend follow-up:** on success, PasswordChangeRequired calls `login(username, newPassword)` (PasswordChangeRequired.jsx:89-98).

### PUT /api/users/change-password (userManagement.js:303)
- **Who may call:** JWT\* (`backend/middleware/authenticate.js`), for your own account (`req.user.id`).
- **Input:** `{currentPassword, newPassword}`.
- **Behaviour** (`enhancedAuthService.changePassword`, :343-435):
  - user not found: "User not found"
  - `auth_provider !== 'local'`: "SSO users cannot change password here. Please use your SSO provider."
  - current password must match: "Current password is incorrect"
  - strength check
  - must not match any of the stored history hashes: "Password was recently used ... Cannot reuse last 5 passwords."
  - bcrypt(10), then the history is prepended and cut to 5, then `UPDATE users SET password, password_history` (:403-412)
- **Output:** 200 `{message}`. A failed result returns 400 `{error:'Password change failed', message, errors}`.
- **Frontend callers:** none found in `src/`.

### Frontend routes and hooks
- **`/login`**
  - Authenticated tree (App.jsx:461): redirects to `/` when `currentUser` is set, otherwise renders `Login`.
  - Unauthenticated tree (App.jsx:484): renders `Login`.
  - After auth, Login navigates to `location.state.from.pathname`, otherwise `/drop` for vendor users (`internal_user === false && user_type === 'Vendor'`, src/utils/userHelpers.js:11-18), otherwise `/` (Login.jsx:34-40).
- **`/auth/callback`** (App.jsx:485, OktaCallback.jsx):
  1. Reads `code` from the query and `pkce_verifier` from localStorage.
  2. POSTs to `${OKTA_DOMAIN}/oauth2/default/v1/token`. `redirect_uri` defaults to `'http://localhost:5000/auth/callback'`.
  3. GETs `/v1/userinfo`.
  4. POSTs `/api/auth/okta/user` at `BACKEND_URL`.
  5. Stores `localStorage.token` and `localStorage.currentUser` and calls `oktaLogin(user)`.
  6. Navigates to `/` (OktaCallback.jsx:28-109).
- **`*` (unauthenticated):** redirects to `/login` with `state.from` (App.jsx:486).
- **Okta start:**
  - The "Sign In with Okta" button sets `window.location.href = OKTA_DOMAIN` (Login.jsx:125-135).
  - When the URL contains `?iss=`, `AppContent` calls `initiateOktaLogin()` (App.jsx:281-284). That function:
    - creates a 64-byte verifier and its S256 challenge
    - stores the verifier in a cookie and in localStorage
    - redirects to `${OKTA_DOMAIN}/oauth2/default/v1/authorize` with `scope:'openid profile email'` and `state:'xyz'` (App.jsx:151-172)
  - The Okta config comes from `GET /api/secrets` in non-development, or from `VITE_*` env vars when `VITE_ENV==='development'` (src/config/secrets.js:4-24).
- **ProtectedRoute** (App.jsx:175-189): shows a loading screen while `CHECKING`. When unauthenticated it redirects to `/login` with `state.from`.
- **AuthContext** (src/context/AuthContext.jsx):
  - On mount: when a token is present, calls `/me`; on any error it clears `token` and `refreshToken` (:117-166).
  - `login()` stores `token` and `refreshToken` in localStorage (:195-198).
  - The request interceptor adds `Bearer <localStorage.token>` to every axios request (:335-346).
  - The response interceptor refreshes on 401 or 403, once per request (:349-377). If the refresh fails, it clears the tokens and dispatches LOGOUT (:314-325).
  - `logout()` POSTs `/api/auth/logout` with `{refreshToken}`, then clears localStorage (:255-278).
  - Client-side `hasPermission`, `hasFeaturePermission`, `hasWritePermission`, `hasExecutePermission`, `hasTagPermission` and `hasRole` (:386-752):
    - The Admin shortcut is role `Admin` or `admin` only (:39-51).
    - Resource names are fuzzy-matched by adding or removing a trailing `s` and swapping `_` and `-` (:433-439).
    - `hasRole` maps legacy `role_id` 1, 2, 3 to Admin, Creator, Executor (:551-566).
- **Header logout** (Header.jsx:36-54):
  - Okta users: redirected to `${OKTA_DOMAIN}/login/signout?post_logout_redirect_uri` after localStorage keys are removed. The backend logout is not called.
  - Other users: `logout()` then navigate to `/login`.
- **InactivityTimer** (src/components/InactivityTimer.jsx, mounted at App.jsx:334):
  - Constants: `INACTIVITY_TIMEOUT_MS = 20 min`, `WARNING_BEFORE_LOGOUT_MS = 10 min`, `LOGOUT_AFTER_WARNING_MS = 60 s` (:6-8).
  - The warning modal opens after `20 - 10 = 10` min with no `mousedown/mousemove/keydown/scroll/touchstart/click` (:82-86, :105).
  - It logs out 60 s later unless "Stay Logged In" is clicked (:68-70, :89-95).

### Unreachable (see DEAD)
`backend/src/routes/auth.js:12-18` defines `POST /login`, `/refresh`, `/logout`, `/logout-all` and `GET /me`, backed by `authController.js`.

## Data touched

| Table | Columns | Operations | Where |
|---|---|---|---|
| users | `username, password, email, full_name, okta_id, auth_provider` (default `'local'`), `failed_login_attempts` (default 0), `locked_until`, `password_history` (jsonb default `[]`), `force_password_change` (default false), `must_change_password` (default false), `internal_user` (default false), `user_type`, `last_login`, `first/middle/last_name`, `phone_number` | R/W | DDL database_ddl_2026-01-07.sql:2394-2423. Writes at server.js:10263, :10288, :10538, :10914, :11005; enhancedAuthService.js:61, :90, :114, :247, :404; userManagement.js:137 |
| refresh_tokens | `id uuid, user_id, token varchar(255)` (bcrypt hash), `user_agent, ip_address` (never written), `expires_at, is_revoked, revoked_at` | insert, select, revoke, delete-expired | DDL :1833-1842; authService.js:101-224 |
| user_sessions | `user_id, token varchar(1000), expires_at` | delete only (AUTH never writes it) | DDL :2382-2387; server.js:10749 |
| password_reset_requests | `user_id, requested_at, status` (`pending`/`approved`/`denied`, default `'pending'`), `approved_by, approved_at, denied_at, notes` | insert, select, update | DDL :1663-1673; server.js:10859-11069 |
| roles, user_roles, role_permissions, permissions, access_group_roles, user_groups | read (user_roles is also inserted) | read | server.js:10273-10329, :10595-10653; backend/src/middleware/authenticate.js:162-283 |
| Redis cache | `user:<id>` (TTL 300 s, userRepository.js:12, :149); `permissions:user:<id>` (TTL 600 s, backend/src/middleware/authenticate.js:188, :295) | R/W | |
| audit log (via auditService) | request bodies of all AUTH calls | write | auditMiddleware.js:173-209 |

Timestamps are `TIMESTAMP WITHOUT TIME ZONE` (DDL :1665-1669, :1838-1841, :2416). `locked_until` and `expires_at` are written from JS `Date` objects (passwordSecurity.js:148; authService.js:95-96), while `approved_at`, `last_login` and similar use DB `NOW()`.

## Flags

### SECURITY
- **SEC-1: Okta sync trusts the client.** `POST /api/auth/okta/user` has no auth and does not verify any Okta token (server.js:10237-10247). Anyone who can send an `okta_id` of an existing Okta-linked user receives a 7-day refresh token and an access token for that user (:10378-10380). Any new `okta_id` creates a user with a default role (:10263-10282). `@okta/jwt-verifier` and `@okta/oidc-middleware` are listed (package.json:26-27) but never imported (grep: no matches outside package files).
- **SEC-2: Unauthenticated user creation with caller-chosen roles.** `POST /api/users/register` has no auth (userManagement.js:53; server.js:5355). The caller supplies `roles` (id or name, e.g. `Admin`), `internal_user` and `user_type`, and they are applied as given (enhancedAuthService.js:174-176, :283-316). Only `generalLimiter` applies.
- **SEC-3: Predictable temporary password.** Approval sets the password to `'TempPass@' + <current year>` (server.js:11000). Reset requests can be filed by anyone for any local username or email (server.js:10830-10874). Once an admin approves, whoever filed the request can log in with the known password before the real user does. The temp password is also returned in the HTTP response (:11029).
- **SEC-4: Logout does not revoke anything.**
  - `/api/auth/logout` deletes from `user_sessions` by access token (server.js:10749), but no code inserts into `user_sessions`. The only other references are deletes at userManagement.js:1267, :1352 and adminCleanupRoutes.js:494.
  - The `refreshToken` the frontend sends (AuthContext.jsx:262-264) is ignored, so it stays valid for up to 7 days.
  - The access token stays valid until it expires (default 30 min).
- **SEC-5: Refresh token rotation and revocation are likely ineffective.**
  - Refresh tokens are stored as `bcrypt.hash(token, 10)` and matched with `bcrypt.compare` (authService.js:61-83, :145-150).
  - bcrypt only uses the first 72 bytes of its input. A refresh JWT's first 72 bytes are the fixed HS256 header (36 chars), the dot, and the start of the payload `{"id":<n>,"type":"refresh",...` (authService.js:44-47). Those bytes are identical for every refresh token of the same user.
  - So any unexpired refresh JWT for a user would match any of that user's non-revoked rows. A token rotated out at authService.js:318 keeps working as long as a newer row exists.
  - This depends on library truncation behaviour. See Open questions.
- **SEC-6: The JWT\* middleware accepts refresh tokens.** `backend/middleware/authenticate.js:32-38` verifies the signature and sets `req.user = decoded` without checking `type`. The 7-day refresh token (`{id, type:'refresh'}`) therefore works as a bearer token on JWT\* routes, including `PUT /api/users/change-password`. The JWT middleware rejects `type === 'refresh'` (backend/src/middleware/authenticate.js:41-46).
- **SEC-7: Password-history hashes and internal fields are returned to the client.** `/api/auth/me` returns `SELECT *` minus `password` (server.js:10582, :10725-10731). `/api/auth/okta/user` does the same (:10247, :10392-10399). Both include `password_history` (up to 5 bcrypt hashes), `failed_login_attempts`, `locked_until`, `okta_id`, `external_id` and the address fields.
- **SEC-8: Password change without the current password.** `/api/auth/force-change-password` lets any valid access-token holder set a new password for that account (server.js:10890-10919). There is no current-password check, no check that `force_password_change` was set, and no history check.
- **SEC-9: Plaintext passwords in the audit log.** `sanitizeBody` redacts only top-level keys named exactly `password, token, secret, apiKey, api_key, accessToken, refreshToken, privateKey` (auditMiddleware.js:8-23). The audit middleware covers every `/api/auth/*` and `/api/users/*` request (auditMiddleware.js:112-121). The following are therefore stored unredacted in `newValues` and `metadata.requestBody` (auditMiddleware.js:185, :202-204):
  - `newPassword` (force-change-password, change-password-required, change-password)
  - `currentPassword`
  - `passwordChangeToken`
- **SEC-10: Fixed OAuth state.** The OAuth `state` is the constant `'xyz'` (App.jsx:167), and OktaCallback never checks `state` (OktaCallback.jsx:31-36).
- **SEC-11: Tokens in localStorage.** Access and refresh tokens are kept in `localStorage` (AuthContext.jsx:195-198; OktaCallback.jsx:97).
- **SEC-12: Session secret fallback.** The session secret falls back to the JWT secret (server.js:594).
- **SEC-13: Account enumeration via reset messages.** `request-password-reset` returns three different 200 messages (generic, "already pending", "submitted") (server.js:10846, :10866, :10882). Only the first is generic, so the reply reveals whether a local account exists.

### BUG
- **BUG-1: Login fails with 500 for users flagged `must_change_password`.** For such users `authenticateUserWithSecurity` returns `{success:true, requiresPasswordChange:true, ...}` with no `user` (enhancedAuthService.js:140-147). The route then reads `result.user.username` (server.js:10476-10479), throws a TypeError and returns 500 (`sanitizeError`; :10495-10498). The `requiresPasswordChange` branch in Login.jsx:97-104 is therefore never reached. Admin unlock sets `must_change_password = TRUE` (userManagement.js:781-786), so every unlocked user hits this.
- **BUG-2: `/api/users/change-password-required` always fails after the token checks.** It calls `enhancedAuthService.validatePassword` (userManagement.js:124), but that module exports only `authenticateUserWithSecurity, registerLocalUser, changePassword, getPasswordRequirements` (enhancedAuthService.js:444-449). The TypeError goes through `asyncHandler` to errorHandler, which returns 500 (errorHandler.js:85-101).
- **BUG-3: `/api/auth/register` always returns 400 for authenticated callers.**
  - `userSchema` includes `params: Joi.object({ id: Joi.string().required() })` (validation.js:176-182), and this route has no `:id`. So `validateRequest` returns 400 "The request URL parameters contain invalid data" (validation.js:64-78) before the handler runs.
  - Even if validation passed, `stripUnknown` (validation.js:18) would remove `fullName` (the schema has only `firstName`/`lastName`, validation.js:170-171), so `full_name` would be NULL (server.js:10521, :10540).
- **BUG-4: Login by email fails at the final step.**
  - The first lookup matches `username = $1 OR email = $1` (enhancedAuthService.js:24).
  - The final `authService.authenticateUser` calls `findByUsername`, which matches `u.username = $1` only (userRepository.js:176).
  - Logging in with an email therefore passes the lockout and password checks, resets `failed_login_attempts` (enhancedAuthService.js:113-122), and then returns "Invalid username or password" (authService.js:239-241) as a 401.
- **BUG-5: Login never reports `force_password_change`.**
  - `findByUsername` does not select `force_password_change` (userRepository.js:168-171), so `authService.authenticateUser` always returns `force_password_change: false` (authService.js:264), and so does the login response (server.js:10485, :10493).
  - After an admin approves a reset, the `ForcePasswordChange` modal does not appear at login. `login()` does not check the `/me` result for the flag (AuthContext.jsx:211-219).
  - The modal appears only on the next full page load, through `fetchUserData` (AuthContext.jsx:152-155).
- **BUG-6 (likely): `PUT /api/users/change-password` probably fails at the DB write.** `changePassword` passes a JS array as the `password_history` jsonb parameter (enhancedAuthService.js:403-411). The comment says "pass array directly, not stringified". Other writers of the same column use `JSON.stringify` (enhancedAuthService.js:274; userManagement.js:672 with `::jsonb`). See Open questions.
- **BUG-7: Each successful login calls the backend twice.** `Login.jsx` POSTs `/api/auth/login` (Login.jsx:92), discards the result, then calls `login()`, which POSTs `/api/auth/login` again (Login.jsx:106; AuthContext.jsx:177). Each successful sign-in stores two refresh tokens and updates `last_login` up to four times: enhancedAuthService.js:118 and userRepository.js:610, per call.
- **BUG-8: Approval leaves lockout and history untouched.** Approving a reset sets the password and `force_password_change` but does not clear `failed_login_attempts` or `locked_until` (server.js:11005-11010). A locked user stays locked until `locked_until` passes. The temp password is not added to `password_history`.
- **BUG-9: Okta sessions are not refreshed.** OktaCallback stores only the access token, not `authData.tokens.refreshToken` (OktaCallback.jsx:97-98). When the access token expires, `refreshAccessToken` returns `null` with no refresh token (AuthContext.jsx:284-287) and does not dispatch a logout. API calls then fail until the page is reloaded.
- **BUG-10: Mismatched client and server password rules.** The `ForcePasswordChange` modal checks only `length < 8` and tells the user "at least 8 characters" (ForcePasswordChange.jsx:26-29, :78-80). The server requires 12 characters plus all four character classes (passwordSecurity.js:10-16).
- **BUG-11: Approval is not atomic.** Reset approval runs two separate `UPDATE`s, first on `users` and then on `password_reset_requests`, with no transaction (server.js:11005-11018). If the second fails, the password has been reset while the request stays `pending`.
- **BUG-12: Client-side check is skipped before requirements load.** `PasswordChangeRequired.validatePassword` returns `true` instead of an array when the requirements have not loaded (PasswordChangeRequired.jsx:33). `validationErrors.length` is then undefined, so the client-side check is skipped (:73-74).

### DUPLICATE
- **DUP-1: Two JWT middlewares.**

  | | JWT (backend/src/middleware/authenticate.js:17-90) | JWT\* (backend/middleware/authenticate.js:14-48) |
  |---|---|---|
  | Secret | `SECURITY_CONFIG.JWT_SECRET` | `process.env.JWT_SECRET`; returns 500 when unset (:26-29) |
  | Refresh tokens | rejected | accepted |
  | User data | reloads the user (cached) | uses decoded claims only |
  | Permissions and roles | computes permissions, effective roles and `features` | none |
  | Error codes | 401, or 500 on error | `TOKEN_EXPIRED` code on expiry |

  userManagement.js:9 uses JWT\*. In development without the env var, SECURITY_CONFIG gets a random secret (environment.js:80) while JWT\* returns 500.
- **DUP-2: Two user-creation endpoints.**

  | | /api/auth/register (server.js:10513) | /api/users/register (userManagement.js:53) |
  |---|---|---|
  | Auth | JWT plus `user_create` | none |
  | Password rule | Joi 8+ chars, special set `@$!%*?&` | 12-char policy |
  | Case check | case-sensitive username | case-insensitive username or email |
  | `auth_provider` | not set (DB default `'local'`) | `'local'` |
  | `password_history` | not written | written |
  | Roles | assigned by name | assigned by id or name |
  | Status | broken (BUG-3) | live |
- **DUP-3: Two identical password-requirements endpoints.** server.js:10502 and userManagement.js:74.
- **DUP-4: Two "must change password" flags with separate flows.**
  - `force_password_change`: set by reset approval (server.js:11007). Cleared by `/api/auth/force-change-password` (server.js:10916). Detected through `/me` and the login response.
  - `must_change_password`: set by admin unlock (userManagement.js:785). Checked at login and produces a `passwordChangeToken` (enhancedAuthService.js:125-147). Cleared by `/api/users/change-password-required` (userManagement.js:140). This path is broken by BUG-1 and BUG-2.
- **DUP-5: Three password-change handlers with different rules.**

  | Handler | Current password | Strength check | History | Hash |
  |---|---|---|---|---|
  | force-change (server.js:10890) | no | yes | no | salt 10 |
  | change-password-required (userManagement.js:84) | no | intended | no | `BCRYPT_SALT_ROUNDS` (12) |
  | PUT change-password (enhancedAuthService.js:343) | yes | yes | yes, 5 | salt 10 |

  bcrypt cost is otherwise inconsistent too: 10 at server.js:10261, :10534, :10910, :11001 and enhancedAuthService.js:241, :395; 12 via `BCRYPT_SALT_ROUNDS` at userManagement.js:134 and userRepository.js:218.
- **DUP-6: Three permission-resolution recipes.**
  - Okta handler (server.js:10291-10365): direct roles only, plus the Executor extras.
  - `/me` (server.js:10595-10716): direct and group roles, Executor extras, and object-valued `roles.permissions`.
  - Middleware `getUserPermissions` (backend/src/middleware/authenticate.js:186-302): direct and group roles, array or JSON-string `roles.permissions` only, no Executor extras, cached for 600 s.

  So the UI's permission list (from `/me`) can differ from what the backend enforces.
- **DUP-7: Two `userHasAdminAccess` functions.** server.js:380-403 uses `users:write` and `roles:write`. backend/utils/permissionHelpers.js:80-92 also accepts `project_management:write`. The reset-queue routes use the server.js version.
- **DUP-8: Two login implementations.** server.js:10417 (enhanced, live) and authController.login (authService only, unreachable).
- **DUP-9: Three password-strength validators.**
  - server: passwordSecurity.js:27-83
  - Joi: validation.js:153-154
  - frontend: PasswordChangeRequired.jsx:32-58, special regex `[!@#$%^&*(),.?":{}|<>]`, which differs from the server set

### DEAD
- **`backend/src/routes/auth.js` and `backend/src/controllers/authController.js`.** They are required only by `backend/src/app.js`, which only `backend/src/server.js:6` loads. The inventory lists that entry as possibly dead (inventory.md:720, :723). So `authService.logout` (authService.js:350) and `logoutAll` (:382) are unreachable.
- **`userRepository.setMustChangePassword`** (userRepository.js:627): no callers.
- **Unused exports in `src/api/authService.js`:** `login`, `logout`, `getCurrentUser` (:10-47). Only `getAllUsers, getRoles, createUser, updateUser, deleteUser, createRole, updateRole, deleteRole, getPermissions` are imported (UserManagement.jsx:12; RoleManagement.jsx:6).
- **`codeVerifier` cookie** written at App.jsx:155 and never read. Only the localStorage copy is used (OktaCallback.jsx:33).
- **`localStorage.currentUser`** written at OktaCallback.jsx:98 and never read (no `getItem('currentUser')` in `src/`).
- **`user_sessions` delete in logout** (server.js:10749): a no-op, because the table is never written.
- **`refresh_tokens.ip_address`:** never written (authService.js:101-105).

### UNCLEAR
- **UNC-1: Default role for new Okta users is not deterministic.** `WHERE name = 'User' OR name = 'Executor' LIMIT 1` has no `ORDER BY` (server.js:10273-10275).
- **UNC-2: Okta start relies on Okta redirecting back.** The "Sign In with Okta" button navigates to the bare `OKTA_DOMAIN` (Login.jsx:129). The PKCE redirect starts only when the app is later loaded with `?iss=` in the URL (App.jsx:281-284), which presumably relies on Okta's "initiate login URI". `AppContent` returns before calling its hooks in that case (App.jsx:281-288).
- **UNC-3: Effective inactivity timeout is 11 minutes, not 20.** The warning shows at 10 min of inactivity and logout happens at 11 min (InactivityTimer.jsx:6-8, :82), although the constant is named `INACTIVITY_TIMEOUT_MS = 20 min`. No server-side idle timeout exists. The access token lifetime is `JWT_EXPIRATION`.
- **UNC-4: Okta access tokens claim `internal_user: true`.** The Okta handler builds `userForToken` without `internal_user` (server.js:10371-10376), so the token claims `internal_user: true` (authService.js:27), while the DB default is `false` (DDL :2419). Middleware overwrites `req.user` with DB values (backend/src/middleware/authenticate.js:53-56). JWT\* routes see the token claim.
- **UNC-5: `user_create` permission format.** `/api/auth/register` checks for an object permission named `user_create` (server.js:10516). Elsewhere the format is `resource:action` (e.g. `users:write`, server.js:398). String permissions can never satisfy this check.
- **UNC-6: Any 403 triggers a refresh.** The response interceptor refreshes on 403 as well as 401 (AuthContext.jsx:360). Every permission-denied response therefore causes a refresh call and rotates the refresh token.
- **UNC-7: The Okta logout URL** passes `post_logout_redirect_uri` with no value (Header.jsx:40).
- **UNC-8: `PUT /api/users/change-password`** has no frontend caller in `src/`.

## Domain terms
- **User / account.** `username` is the login identifier. The login field accepts a username or an email (enhancedAuthService.js:24; Login.jsx:431 "Username or Email").
- **Auth provider.** `auth_provider`: `'local'` vs `'okta'`. The code and UI call the non-local case "SSO" or "SSO-only account" (`useSso`, `ssoProvider`, server.js:10451-10463). Users are linked by `okta_id`, the Okta `sub` (OktaCallback.jsx:84).
- **Access token** is also called `token` or JWT (server.js:10490; localStorage key `token`). **Refresh token** is `refreshToken` and `type:'refresh'`. **Password change token** is `passwordChangeToken`, `purpose:'password_change_only'`, and lasts 10 min.
- **Session** means different things in different places:
  - the express-session cookie (server.js:593)
  - the never-populated `user_sessions` table
  - a refresh-token row ("sessions" in the `logoutAll` message, authService.js:388)
  - the UI's "Session Timeout" (InactivityTimer.jsx:139)
- **Lockout / locked account:** `failed_login_attempts`, `locked_until`, `remainingTime` in minutes. **Unlock** is an admin action that sets `must_change_password`.
- **Forced password change:** `force_password_change` (after a reset approval; UI "Password Change Required ... reset by an administrator") vs `must_change_password` (after an unlock; UI "Your account requires a password change"). Both mean "must change password".
- **Password reset request:** statuses `pending`, `approved`, `denied`. The approver and the denier are both stored in `approved_by`. **Temporary password** is `tempPassword`.
- **Password history:** `password_history`, the last 5 hashes.
- **Roles:**
  - **direct roles** come from `user_roles`
  - **group-inherited roles** are also called `groupInheritedRoles` (from `access_group_roles` via `user_groups`)
  - **effective roles** are also called `effectiveRoles` (both together)
  - `roleDetails` is role rows with their `permissions` JSON
- **Permissions:** either strings `resource:action` (e.g. `dashboard:read`) or objects `{name, resource, action}`, also read as `permission_name` or `permission_code`. The "core permissions" are given to every user. **Features** are the permission prefixes mapped to UI routes (backend/src/middleware/authenticate.js:97-155).
- **Admin access** (`userHasAdminAccess`) vs **all-project access** (`userHasAllProjectAccess`, server.js:348-373). On the client, "admin-level access" means the Admin role only (AuthContext.jsx:39-51).
- **Internal user vs vendor user:** `internal_user`, `user_type`. A vendor user has `internal_user === false && user_type === 'Vendor'`.

## Open questions
- **SEC-5:** does the installed `bcrypt` package truncate input at 72 bytes, so that any refresh JWT for a user matches any of that user's stored hashes? Confirm with a test: issue two refresh tokens, revoke one, and refresh with it.
- **BUG-6:** confirm whether node-pg serialises the JS array passed for `password_history` into a Postgres array literal, which would make `PUT /api/users/change-password` fail on jsonb.
- **Okta insert collisions:** what happens when a new Okta user's `username` or `email` collides with an existing row? This depends on unique constraints on `users` that were not checked here. The handler would return 500 (server.js:10409-10412).
- **Redis cache absent:** what do `cache.get/set` (backend/config/redis) do when Redis is not configured? This decides whether the 300 s user cache and the 600 s permission cache are active. Nothing in AUTH invalidates `permissions:user:<id>` or, after password or flag changes, `user:<id>`.
- **Timestamp time zone:** what time zone does node-pg use when writing JS `Date` values into `TIMESTAMP WITHOUT TIME ZONE` (`locked_until`, `refresh_tokens.expires_at`)? This affects lockout and expiry comparisons against DB `NOW()`.
- **Area count:** `areas.md` counts 17 AUTH HTTP entry points. This document found 16 live routes (12 in server.js, 4 in userManagement.js) plus 5 unreachable ones in backend/src/routes/auth.js.
- **Notifications:** is there any out-of-band notification (email or in-app) for reset approval or the temp password? None was found in the handlers (server.js:10972-11035).
