# EML - Email providers & domains

## Summary
Two route files plus services. Email provider connections are stored in the shared `storage_connections` table (emailConnectionRoutes.js:18-31) with type in smtp, gmail_oauth2, outlook_oauth2, sendgrid, ses, azure_email, gcp_email (:30). They are "application-wide" (project_id null, :141) except OAuth2-created ones, which take a project_id (:713, :958). Allowed email domains are a separate table `allowed_email_domains`, enforced when sending (NotificationService.js:254-277).
Mounts (server.js:13930-13941): `/api/email-connections` = authenticateToken only (no admin check); `/api/allowed-email-domains` = authenticateToken + requireAdmin. Adapters are chosen by EmailProviderFactory.js:25-51.
Not deeply traced: the individual adapters' send logic (only the facts cited below), the SMTP and SendGrid adapters, and the frontend pages beyond the API call sites.

## Entry points

### Email connections (all behind authenticateToken, server.js:13931)
1. GET /api/email-connections/ (emailConnectionRoutes.js:14). Any authenticated user. Returns every storage_connections row of an email type, newest first, with columns connection_id, type as provider_type, name, status, timestamps, project_id, description, config (:19-32). Response `{success, connections}`. 500 on error. No project filter, no masking of config here.
2. GET /:connectionId (:51). Any authenticated user. 404 if not found (:57); 400 "not an email provider" if type not in the list (:66). Returns `{success, connection}` from ConnectionService.getConnectionById.
3. POST / (:91). Any authenticated user (no role check). Inputs name, provider_type (or legacy `type`, :102), description, config. 400 if name, type or config missing (:105-133); 400 if type not in the list (:121). Calls ConnectionService.createConnection with project_id null, connection_direction 'outbound', status 'active' (:137-145) (comment says it encrypts). Returns 201 `{success, connection}`. No config validation against the adapter's validateConfig.
4. PUT /:connectionId (:168). Any authenticated user. Updatable: name, description, config, status (:180-183); 400 if none (:185). 404 if the service returns nothing. No check that the connection is an email type (any connection id can be updated through this route, see Flags). Status values are not validated.
5. DELETE /:connectionId (:225). Any authenticated user. 404 if not found; returns `{success, deleted}`. No email-type check; no check for usage by alerts, digests or workflows.
6. POST /:connectionId/test (:261). Any authenticated user. Requires `to_email` (400, :266). 404 if not found. Parses config, decrypts via notificationService.connectionService.decryptSensitiveFields (:293), sends a fixed message "Test Email from Data File Observatory" through NotificationService.sendWithProvider (:307). Side effect: a real email is sent, and the allowed-domain check applies (a blocked recipient gives success false). Failure returns 500 with `error` and `details`. Thrown errors are mapped by substring to friendly messages: invalid/expired/revoked/401 gives "API key is invalid..." (:353); rate limit/429 (:355); ECONNREFUSED/ENOTFOUND (:357); authentication/unauthorized (:359). No email-type check.
7. POST /oauth2/authorize-url (:382). Any authenticated user (no project permission check). Inputs provider (gmail|outlook), redirect_uri, project_id, all required (400). State is base64 of JSON `{project_id, timestamp}` (:412), not stored or signed server-side. Builds the Google URL (scope gmail.send, access_type=offline, prompt=consent, :428-435) or the Microsoft URL (scope `Mail.Send offline_access`, tenant `common`, :446-451). 500 if the client ID env var is missing. Returns `{auth_url, state}`. The redirect_uri is caller-supplied.
8. POST /oauth2/gmail/auth (:477). Uses authorizeProjectResource with permission 'connection:create' on body.project_id (:478-482). Requires project_id and req.user.id (400/401). Generates a 32-byte random hex nonce, caches `oauth2_state:<nonce>` with {project_id, user_id, provider, timestamp} for 600 seconds (:512-525). Redirect URI is `${API_BASE_URL || 'http://localhost:3000'}/api/email-connections/oauth2/gmail/callback` (:527). Returns `{auth_url, nonce}`.
9. POST /oauth2/outlook/auth (:557). Same as 8 for Outlook (:582-622).
10. GET /oauth2/gmail/callback (:636). Registered under the JWT mount; the comment says Google redirects without Authorization headers (:634). Reads code, state(nonce), error. Every outcome is a redirect to `/oauth2-callback?success=...`. Checks: provider error; missing code/nonce; cached state missing; JSON parse; provider must be 'gmail' (:673); age > 600000 ms (:680); then deletes the state (one-time, :687). Exchanges the code at https://oauth2.googleapis.com/token (:695) (JSON body). Creates a connection named 'Gmail OAuth2 Connection', type gmail_oauth2, project_id from state, config {access_token, refresh_token, expires_at = now + expires_in*1000} (:709-721). The user_id in the state is only logged, not used for authorization.
11. GET /oauth2/outlook/callback (:741). Same as 10, with the token endpoint https://login.microsoftonline.com/common/oauth2/v2.0/token (:800), name 'Outlook OAuth2 Connection'.
12. POST /oauth2/callback (:844). authorizeProjectResource 'connection:create', project taken from the base64 state (:848-864). Used by the SPA. Requires provider, code, state (400). Decodes the state, rejects it if older than 600000 ms (:898), 403 if req.projectId differs from the state project (:906). Exchanges the code for gmail or outlook (redirect_uri from body), else 400 'Invalid provider'. Creates a connection named `name` or "Gmail/Outlook OAuth2 Connection" with project_id from the state. Returns `{success, connection}`. 500 includes `details: error.response?.data || error.message` (:984).

### Allowed email domains (authenticateToken + requireAdmin, server.js:13941)
13. GET /api/allowed-email-domains/ (allowedEmailDomainsRoutes.js:6). Lists id, domain, description, is_active, created_by and timestamps, ordered by domain.
14. POST / (:27). Requires domain (400). Normalised with lower-case and trim. Regex `^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$` (:41), else 400. INSERT with created_by = req.user?.id. 201 on success; 409 on unique violation 23505 (:64).
15. PUT /:id (:79). Optional domain (same regex), description, is_active. 400 if no fields; sets updated_at = NOW(); 404 if no row; 409 on a duplicate. No type check on is_active.
16. DELETE /:id (:163). Hard delete; 404 if no row; returns `{deleted:{id,domain}}`.
17. POST /validate (:199). Body `{emails: []}` (400 if not an array). Reads active domains. If none are active, returns `valid:true` with 'No domain restrictions configured' (:216). Otherwise exact domain match (no subdomain matching); returns `{valid, invalidEmails, allowedDomains}`.

### Frontend routes
- /email-providers (src/pages/EmailProvidersConfig.jsx; App.jsx:452 per inventory). Calls the domain CRUD (:62, :76, :102, :113) and `/api/email-connections/oauth2/${provider}/auth` (:270).
- /oauth2-callback (src/pages/OAuth2Callback.jsx, App.jsx:453). Not wrapped in a protected route per inventory.

### Non-HTTP behaviour
- Send-time domain enforcement: NotificationService.sendWithProvider (NotificationService.js:254-277) validates all recipients via EmailDomainValidationService.validateEmails and returns `{success:false, domainValidationFailed:true}` without sending. EmailDomainValidationService (:1-108): active-domain cache TTL 5 * 60 * 1000 ms (:8); no active domains means everything allowed (:46); an email without exactly one '@' is invalid when restrictions exist (:35, :60); on DB error getAllowedDomains returns [] (:27), which means all domains are allowed.
- Adapter factory (EmailProviderFactory.js:25-51): unknown type throws. getAvailableProviders lists 7 types; the comments mark gmail/outlook as "Coming soon" (:64-65), although the adapters exist.
- Adapter facts: Gmail token refresh when within a 5 minute buffer of expiry (GmailOAuth2Adapter.js:129); the adapter keeps refreshed tokens in memory and returns updatedCredentials for NotificationService to persist (NotificationService.js:287-293). AWS SES assumed-role cache TTL 45 * 60 * 1000 (AwsSesAdapter.js:15). SES validateConfig requires access_key_id, secret_access_key and region (:313-319), although the header says IAM role and AssumeRole are supported (:6). Azure requires connection_string or endpoint, plus from_email (:244-250). GCP requires password or private_key, and username or service_account_email (:149-152), default port 587 (:30). Config validation (validateConfig) is not called by the create or update routes.

## Data touched
- storage_connections (read/insert/update/delete via pool and ConnectionService); filtered on type IN the 7 email types for the list only.
- allowed_email_domains (id, domain, description, is_active, created_by, created_at, updated_at).
- Cache keys `oauth2_state:<nonce>` (600 s).
- Env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, API_BASE_URL (names only).
- External: accounts.google.com, oauth2.googleapis.com, login.microsoftonline.com, plus the provider send APIs.

## Flags
- SECURITY: Email connection create/update/delete/test and list have no role check, only authenticateToken (server.js:13931; routes :14-261). Any logged-in user can create, change or delete the application-wide providers. Domain routes are admin-only, so the policy is inconsistent.
- SECURITY: GET / and GET /:id return `config` (emailConnectionRoutes.js:28, :73); whether sensitive fields are encrypted or masked in the response is not shown here (depends on ConnectionService). See Open questions.
- SECURITY: PUT and DELETE /:connectionId and POST /:connectionId/test do not check the connection type, so they act on any storage_connections id (:193, :229, :273); GET /:id does check (:66).
- SECURITY: POST /oauth2/authorize-url and POST /oauth2/callback use an unsigned base64 state that the client can forge. The callback's project check relies on the same state (:848-864, :906), and it has the 'connection:create' permission check for that state's project; no nonce or user binding (contrast the nonce flow at :512-525). Redirect_uri is taken from the request body (:384, :868).
- SECURITY: The GET OAuth callbacks (:636, :741) sit behind authenticateToken at the mount while their own comment says no Authorization header arrives. Whether they work depends on authenticateToken (not traced). They also create the connection using the project_id in cached state with no permission re-check and do not verify the callback user is the user who started the flow.
- SECURITY: Error details from the token exchange are returned to the client (:984) and redirected in the URL (:733).
- DUPLICATE: Three OAuth2 flows for the same result: authorize-url + POST callback (base64 state, :382/:844) versus nonce flow + GET callbacks (:477-840). Gmail and Outlook GET callbacks and auth endpoints are near copies (differences: provider strings, endpoints, env names, connection names). Inventory notes the SPA uses POST /oauth2/callback; the frontend at EmailProvidersConfig.jsx:270 calls the `/oauth2/${provider}/auth` nonce flow, so both are reachable.
- DUPLICATE: Allowed-domain checking exists in two places: the route /validate (allowedEmailDomainsRoutes.js:199-249) and EmailDomainValidationService (:39-85). They differ: the route has no cache, treats a missing domain as 'unknown', and allows multiple '@' (split()[1]); the service caches for 5 minutes, requires exactly one '@' and returns different message text. The domain regex is repeated in POST and PUT (:41, :90). The email type list is repeated 3 times in the routes (:30, :65, :120) and again in EmailProviderFactory.js:59-65.
- DUPLICATE: Test-send logic (parse, decrypt, build provider) is mirrored in DigestService.js:23 (comment) and visualWorkflowExecutor.js:746.
- BUG: POST / logs `type` (:149), which is undefined when the client sends `provider_type`; the effective value is connectionType.
- BUG: Domain cache is never cleared by the CRUD routes (the grep found no clearCache caller in the area; EmailDomainValidationService.js:102 defines it), so changes can take up to 5 minutes to affect sending, while /validate reflects them immediately.
- BUG: DB failure while loading allowed domains returns [] = "no restrictions" (EmailDomainValidationService.js:25-28), so enforcement fails open.
- BUG: Wrong status code on test failure: send failures return 500 (:336) even for client-side config problems; the substring matching maps any message containing "invalid" to an "API key" message (:353) regardless of provider.
- BUG: Create accepts any status; update accepts any string status (:183) without validation. Domain PUT passes is_active unvalidated.
- UNCLEAR: GET /oauth2 callback tokens are stored in `config` with names access_token / refresh_token; whether ConnectionService encrypts these for gmail_oauth2/outlook_oauth2 was not checked (ConnectionService.js:243 encryptSensitive by type).
- UNCLEAR: getAvailableProviders comments "Coming soon" for gmail/outlook (EmailProviderFactory.js:64-65) although complete flows exist.
- UNCLEAR: Email list includes OAuth connections with a non-null project_id (:26), so "application-wide" is not strictly true; the list ignores project membership.
- DEAD: EmailProviderFactory.validateProviderConfig, testProviderConnection, getProviderDisplayName and getAvailableProviders: no callers found in the routes in this area (only definitions, EmailProviderFactory.js:57-123). Not exhaustively grepped across the repo.

## Domain terms
- Email connection / email provider / provider / storage connection (same table row; `provider_type` in the API = `type` in the DB; `type` accepted for backward compatibility, :101).
- Provider types: smtp, sendgrid, ses (AWS SES), azure_email (Azure Communication Services), gcp_email (GCP SMTP Relay), gmail_oauth2, outlook_oauth2.
- Allowed email domain / domain restriction (empty active list = unrestricted).
- OAuth2 state / nonce (two schemes); connection_direction 'outbound'.
- Test email (to_email).

## Open questions
1. Does authenticateToken accept a cookie or query token, so the Gmail/Outlook GET callbacks (:636, :741) can ever run? (server.js authenticateToken not traced.)
2. Does ConnectionService.getConnectionById / the list route return decrypted or masked secrets? The list route reads raw `config` from the DB (:28).
3. Which table and which fields does ConnectionService encrypt for gmail_oauth2 and outlook_oauth2 (ConnectionService.js:243-)? Inventory notes this table name as a gap; storage_connections confirmed here at :29.
4. Is the base64 state intended to be accepted from the client (authorize-url flow) or is it a legacy path replaced by the nonce flow?
5. Is there a clearCache caller after domain changes (not found in this area)?
6. SMTP and SendGrid adapter validation and defaults were not read.
7. Whether the frontend protects /email-providers by role (App.jsx:452 not read).
