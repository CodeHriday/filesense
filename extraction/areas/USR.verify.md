# USR verification

Verdict: PASS

Written by the orchestrator from the verifier's reply; the verifier itself declined to write this file.

- About 45 claims checked: 0 wrong, 0 unsupported, 0 missed entry points.
- Coverage: all 25 HTTP routes (18 in userManagement.js, 7 in server.js) and both pages (/users, /roles) have a subsection. The /register, /password-requirements, /change-password-required and /change-password rows belong to AUTH.
- Confirmed: the server.js:5355 mount shadows the inline GET /api/users at server.js:11087. All handler auth/admin checks, defaults, status codes and messages match. Role routes in server.js match, including the commented-out permission checks. The passwordSecurity.js constants, userHasAdminAccess, userRepository.findAll, environment.js JWT/bcrypt defaults and the JWT* claim behaviour all match. Frontend claims match (App.jsx:402-403, 2500 ms debounce, Viewer filter, admin guards, role-update fallback). The listed bugs are real.

## Minor omissions (not errors)
- RoleManagement.jsx:819 disables renaming the Admin role in the edit form; the notes mention only the server-side rule.
- PUT /api/users/:id: an invalid password throws inside the transaction, so the profile update rolls back. This is implied by the notes but not stated.
