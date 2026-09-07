---
name: Dashboard project-access parity
description: Why dashboard access must not rely solely on a PostgreSQL routine across development and production.
---

# Dashboard project-access parity

## Rule
Treat `public.get_user_projects(integer)` as an optional legacy optimization. Dashboard project scoping must retain an application-level query fallback based on direct project membership and access-group membership.

**Why:** The development-to-production Publish schema diff can report no changes even when the routine exists in development and is missing in production. Routines are therefore not a reliable cross-environment schema contract for dashboard availability.

**How to apply:** Keep the dashboard ready when its required tables and role data are healthy, and route project-scoped dashboard queries through the fallback when the routine is unavailable. Do not restore the routine with startup-time DDL.