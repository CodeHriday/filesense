# WEB verification (round 3, final, after fix round 2)

Verdict: FIX (minor)

Counts: 34 claims checked, 1 WRONG, 1 UNSUPPORTED, 2 missed. Coverage of assigned inventory rows is complete (USE static + fallback, /documentation and /help, /performance-optimizations, `*`, Google Fonts CSP, VITE_API_BASE_URL line). The round-2 rewrite lost nothing from the previous report.

## Round-2 changes: results
- Refresh self-recursion (AuthContext.jsx:291, :349-377): CORRECT. The refresh POST uses the global axios, the refresh URL is not excluded, and a fresh config has `_retry` unset, so a 401 re-enters refreshAccessToken() at :364. This is a runaway chain for a dead refresh token, as the notes say. The catch at :314-325 is reached only for non-401 failures. Wording "read, not run" is right.
- Audit interceptor string bodies (auditInterceptor.js:36): CORRECT. `JSON.parse(JSON.stringify(str))` returns the string, so `.substring(0,500)` posts the raw body. Skip list at :14 is login, logout and the audit endpoint only. The SECURITY flag is justified. `originalRequest.url.includes` at :16 is outside the try block: CORRECT.
- Vite NODE_ENV: still open and honestly labelled. vite.config.js has no `define`. Acceptable as UNSUPPORTED/open.
- Interceptor order: CORRECT. AuthProvider's effect (child) runs before App's effect (App.jsx:250-252).
- Authz helpers: CORRECT. hasFeaturePermission :491, :526, :533; hasRole :552-566; hasWritePermission :599 and hasExecutePermission :669 use hasRole('Admin'); isWriteAction :626-628; hasTagPermission :740-742.
- Login.jsx:92/:97-104/:106 double submit, :37 redirect, :129 Okta button: CORRECT.
- isInternalUser default (userHelpers.js:26, :29) and isVendorUser (:17): CORRECT.
- /apifoo prefix test (server.js:14013): CORRECT. server.js:14007 static: CORRECT.
- Provider nesting (App.jsx:255-274), AppContent early return (:281-285), main.jsx:12-17: CORRECT.
- React Query v5 (package.json:31 `^5.74.4`), `cacheTime` :34 and `suspense` :38 ignored in v5, `gcTime` at useAPINotifications.js:29, 30 s timer :43-45: CORRECT. Axios ^1.8.4 at :45, React ^18.3.1 at :102.
- Google Fonts lines server.js:463-465 and helmet at :467, IIFE :435-494, scriptSrc 'unsafe-inline' :471, connect-src :444-457: CORRECT.
- lib/redux.js: CORRECT (empty reducers :11-13, RootState/AppDispatch runtime values :34, :37, devTools :30). Import check done: grep of src finds no importer of lib/redux.js (the only "redux" match is the file's own import of @reduxjs/toolkit). The notes' "no import of it was searched for" (DEAD line) and open question 1 can be closed: it is unused.
- hooks/index.js barrel (:1-51), components/common/index.js (:1-6), Modal.jsx (:9-71, :40): CORRECT.
- apiUtils.js (:14, :41-55), jobGroupsService.js:8-9 axios passed to handleApiSuccess, groupsService.js:9 fetch with no Authorization header, jobsService.js:20 fetch with Authorization: CORRECT. (Note: jobsService.js:20 does send a bearer token, and :39, :51 do not. Notes only say it uses fetch, which is true.)
- useDeletePermission.js (:4-38 map, guardDelete throws :52): CORRECT.
- Carried-over lines re-opened:
  - authService.js:318 (backend/src/services/authService.js) revokeRefreshToken(tokenRecord.id): CORRECT. :133-134 `is_revoked = FALSE`: CORRECT. The notes cite bare `authService.js`; the real path is backend/src/services/authService.js.
  - server.js:10817-10819 `!result.success` returns 401: CORRECT.
  - AuthContext.jsx:599, :669, :626: CORRECT.
  - useVisualMappingExecution.js: the cited :316, :346, :401, :447, :515 are the `localStorage.getItem('token')` lines (fetch is on the next line at :317, :347, :402, :448, :516). useVisualWorkflowExecution.js :285, :315, :390 likewise (fetch at :286, :316, :391). Each is off by one if read as the fetch line; acceptable since the token read is the cited point, but the note should say "token read at".

## WRONG
1. Notes line 95: "PLT and SEC report ... (PLT.md:92, :103)". Those lines are not the claim. The Helmet-never-applied BUG is at PLT.md:98 and the SECURITY entry at PLT.md:110. PLT.md:92 is an External-services line. The claim itself (helmet registered after routes inside the async IIFE, so CSP is never sent) is supported by PLT.md:98 and by the code shape (server.js:435-494 vs routes), but the citation is wrong.

## UNSUPPORTED
1. main.jsx:17 and ErrorBoundary.jsx:86 `process.env.NODE_ENV` in Vite: cited code does not settle it (no `define` in vite.config.js). Kept as an open question, which is the right treatment.

## MISSED (new)
1. Production-only early route `app.get('/', ...)` at server.js:573-589 serves dist/index.html for GET / (or a 200 "Application is starting" shell when dist/index.html is absent), registered before session and audit middleware. The fallback comment at :14017 depends on it. The "Server: static dist and SPA fallback" section omits it: the fallback therefore does not see GET / in production, and a missing dist/index.html on deep links goes to the error handler instead (comment :14019-14021).
2. Production `/profile-api` proxy to port 8000 registered just before the static handler (server.js:13973-14004, 502 on error). It sits in the same block as the static serving and is not mentioned.

Minor: the 401 from a failed /api/auth/login in Login.jsx:92 also passes through the refresh interceptor (only the audit interceptor skips login), so a stale `refreshToken` in storage triggers a refresh attempt on a bad password. Not in the notes; low value.

## Still not read (accurately disclosed in Open questions)
components/common Button, Table, Tooltip; accessibility component bodies; the 12 grep-only hooks plus useTransformations (exported by the barrel but listed nowhere); PageLayout, Toast.
