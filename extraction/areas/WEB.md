# WEB: Frontend shell and shared UI

## Summary
Scope read: src/main.jsx, src/App.jsx, src/components/InactivityTimer.jsx, src/config/secrets.js, src/utils/userHelpers.js, server.js SPA serving. NOT read in depth (Sidebar, Header, common/*, hooks/*, lib/*, contexts, apiUtils, Documentation and PerformanceOptimizations internals): see Open questions.
The shell bootstraps by loading Okta config, then renders providers and a router (src/main.jsx:12-21). Routes are rendered only when `currentUser` is set; otherwise a separate 3-route login tree is rendered (src/App.jsx:332, :482-488).

## Entry points

### FE /documentation and /help
- Trigger: browser route, src/App.jsx:456-457. Both render lazy `Documentation` (:108).
- Auth: ProtectedRoute only (:175-213); no role check. Inputs: none. Documentation.jsx imports only PageLayout and icons (Documentation.jsx:2-4); no API calls found by grep (imports only).
- Side effects: none found.

### FE /performance-optimizations
- src/App.jsx:460, ProtectedRoute only. The page imports Callback, LazyLoading, VirtualizedList demo components (PerformanceOptimizations.jsx:2-4); no axios/fetch found by grep. Reachable by any logged-in user; purpose is a developer demo (UNCLEAR whether intended for production).

### FE * (catch-all)
- src/App.jsx:462: any unknown path while logged in redirects to `/`. For logged-out users, `*` redirects to /login with `state.from` (:486).

### Shell behaviours (cross-cutting, not in inventory)
- ProtectedRoute (:175-213): authStatus CHECKING shows "Loading..."; UNAUTHENTICATED or no currentUser redirects to /login with `state.from`. If children is a function, extracts fileId by regex from /profile/, /quality/, /report/, /lineage/impact/ paths; the literal string 'undefined' becomes null (:207). Missing fileId redirects to /catalog (:351, :360, :369) which is not a defined route (falls to `*` then `/`), or /lineage (:392).
- Vendor redirect: `/` (DashboardOrRedirect :222-232) and `/upload`, `/drop` (:235-245) send vendor users to /vendor-file-upload. Vendor = `internal_user === false && user_type === 'Vendor'` (userHelpers.js:17). Only client-side: other routes (e.g. /file-catalog) are not blocked for vendors in App.jsx.
- Login welcome toast (:295-312): once per session, GET /api/notifications/count; if `unread_count` > 0, info toast for 8000 ms; errors swallowed.
- InactivityTimer (InactivityTimer.jsx): constants 20 min total, 10 min before logout (:6-7), 60 s countdown (:8). Warning is shown after 20-10 = 10 minutes idle (:82), then forced logout after 60 s (:68-70). Activity events: mousedown, mousemove, keydown, scroll, touchstart, click (:105). Once the warning shows, activity does not dismiss it (:76, :108); only "Stay Logged In" does. Logout failure sends window.location to /login (:48).
- Audit interceptor: initializeAuditInterceptor() on mount (App.jsx:250-252) registers an axios response interceptor that skips /api/audit/frontend-api-error, /api/auth/login, /api/auth/logout (auditInterceptor.js:14). Rest not read.
- Okta redirect: if URL contains '?iss=' AppContent calls initiateOktaLogin() (App.jsx:281-283). Builds PKCE S256 challenge (:127-146), stores verifier in cookie and localStorage (:155-157), redirect_uri default 'http://localhost:5000/auth/callback' (:166), scope 'openid profile email'.
- Secrets loading (secrets.js:4-24): in dev (VITE_ENV==='development') reads VITE_* vars; otherwise GET `${API_BASE_URL}/api/secrets`, throws on non-OK (:15). main() awaits it with no catch (main.jsx:12-13).
- Provider nesting order: ErrorBoundary > Accessibility > Auth > Sidebar > Announcement > Notification > Toast > Notifications > Modal > Router (App.jsx:255-274). React Query client from ./lib/react-query (main.jsx:5,15); devtools in development only (:17).
- Skip link to #main-content (App.jsx:329); main has tabIndex -1 (:337).

### Server: static dist and SPA fallback (inventory USE row)
- server.js:14007 `express.static(distPath)`; :14011-14023 fallback sends dist/index.html for any path not starting with /api; no method check (any HTTP method gets index.html). No auth. Production only per inventory.

## Data touched
- localStorage keys: token, refreshToken (AuthContext.jsx:118, :195-197), pkce_verifier (App.jsx:157). Cookie codeVerifier (:155). window.APP_SECRETS (secrets.js:6, 17-23).
- API calls from shell: GET /api/notifications/count (App.jsx:298); GET /api/secrets (secrets.js:14).

## Flags
- SECURITY: GET /api/secrets has no auth check in handler (server.js:10758-10772) and returns OKTA_CLIENT_ID, OKTA_DOMAIN, OKTA_ISSUER, OKTA_REDIRECT_URI, BACKEND_URL. Values are public-type OIDC config, but endpoint is open. (Route may be gated by global middleware; not verified.)
- SECURITY: OAuth `state` is the constant 'xyz' (App.jsx:168); no CSRF protection of the flow from this code. Callback verification not read (AUTH area).
- SECURITY: PKCE verifier stored in localStorage and a cookie not HttpOnly (App.jsx:155-157). Access and refresh tokens in localStorage (AuthContext.jsx:195-197).
- SECURITY: vendor restriction is only a client-side redirect on two routes (App.jsx:222-245); no role gating on any other route in the shell.
- BUG: AppContent returns early before hooks when '?iss=' is present (App.jsx:281-285), violating hook order rules and returning undefined (React error for components returning undefined in older versions).
- BUG: `React.lazy(...).render(...)` for AI Insights (App.jsx:472-475) is not a valid React API; would throw if reached. Reachable when showAIInsights && selectedFileId (:469) via toggleAIInsights passed to DataProfile/QualityChecks.
- BUG: redirect target /catalog (App.jsx:351,360,369) has no route; ends at `*` then `/`.
- BUG: initiateOktaLogin mismatch: secrets.js default redirect is 'http://localhost:5000/auth/callback' hardcoded in two places (secrets.js:21, App.jsx:166).
- BUG: secrets.js:17 assigns window.APP_SECRETS then immediately overwrites it (:18); `OKTA_ISSUER` is dropped. getSecret throws TypeError if APP_SECRETS unset (:27-28).
- BUG/UNCLEAR: InactivityTimer constant name INACTIVITY_TIMEOUT_MS = 20 min, but the warning shows at 10 min and logout at about 11 min of inactivity (InactivityTimer.jsx:82, :68). Warning text says nothing about the countdown base.
- DEAD: BlumeETLRedirect component (App.jsx:17-22) never used; points to "https://blume-etl.example.com".
- DEAD: `showOnboarding` state and setter passed down but unused (App.jsx:248, :265, :492); `AppContent` props unused. `/alerts` redirect to /quality-rules is live (:374). Unused imports `useRef` fine; `Navigate` ok.
- DUPLICATE: two context dirs src/context and src/contexts (App.jsx:33-39: NotificationProvider from contexts, NotificationsProvider from hooks, plus NotificationList and ToastContainer). Three notification mechanisms (NotificationContext, NotificationsProvider, ToastContext) coexist; differences not traced.
- DUPLICATE: /login route exists in both the authenticated tree (:461) and unauthenticated tree (:484). /transformations, /transform; /vendor-management, /vendors; /documentation, /help; /upload, /drop map to the same components.
- DUPLICATE: Inventory also notes VITE_API_BASE_URL used per-page (inventory.md:1052) alongside src/config API_BASE_URL.
- UNCLEAR: /workflow-builder still routed to src/pages/archived/WorkflowBuilder (App.jsx:104, :430).

## Domain terms
- Vendor user (external, user_type 'Vendor') vs internal user (userHelpers.js:11-49); Executive dashboard = home page for non-vendors; Catalog / file-catalog; AI Insights sidebar; Toast vs Notification; AUTH_STATUS (CHECKING/AUTHENTICATED/UNAUTHENTICATED, values at AuthContext.jsx:11).

## Open questions
1. Sidebar, Header, common/*, accessibility/*, PageLayout, Modal, Toast, hooks, lib, apiUtils were not read; menu visibility and permission rules in Sidebar are unknown.
2. Is /api/secrets guarded by global middleware (server.js, not checked)?
3. Does Login honour `location.state.from` after login (Login.jsx not read)?
4. Content of Documentation.jsx (help text claims) and whether PerformanceOptimizations should ship.
5. Exact AUTH_STATUS values and token-refresh behaviour (AuthContext.jsx, AUTH area).
6. Whether the `?iss=` Okta-initiated flow works in practice given the early-return bug.

## Inventory corrections
- Inventory row 829 says /documentation,/help at App.jsx:456-457: correct. Row 217 USE: server.js:14007 and :14011 correct, but the fallback also serves non-GET methods.
- Shell behaviours above (inactivity timer, secrets load, /api/secrets) are not in the WEB inventory rows; /api/secrets may belong to AUTH/PLT.
