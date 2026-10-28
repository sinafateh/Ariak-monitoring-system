# Human accounts and access control

Human users sign in at `/login` with an individual username and password. The old `SITE_USERNAME` / `SITE_PASSWORD` shared login and the Talk console's shared administrator password are no longer read by the server. ESP bearer credentials remain machine credentials and are not human accounts.

## First deployment

1. Configure PostgreSQL with the existing connection variables in `.env`.
2. Run `npm run create-admin` from an interactive terminal before starting the application. It creates the first account only when `app_users` is empty. The password is entered without terminal echo; there is no default account or password.
3. Start the server with `npm start` (or the existing service manager). The app state and user-auth schema scripts are idempotent and are applied on the first login/session request. The migration removes the retired local account structures from the workspace JSON while preserving projects, settings, maps, and device data.
4. Sign in through `/login`. Create other accounts in Settings → System → User management.

The bootstrap command refuses to run after any account exists. For recovery, use the account-management password reset while signed in as an authorized administrator; do not insert a hard-coded credential into the database or environment.

## Account and session behavior

- Usernames are normalized with Unicode NFKC and case folding for uniqueness. They must be 3–64 letters, digits, dots, underscores, or hyphens.
- Passwords are stored using Node.js `scrypt` with a random per-user salt. Minimum length is 10 characters.
- Session IDs are random, stored as SHA-256 hashes in PostgreSQL, expire after eight hours of inactivity, and use `HttpOnly`, `SameSite=Strict`, and `Secure` in production. Logout, account disablement, and password reset revoke sessions.
- Password reset requires the user to change the temporary password on their next sign-in. Passwords and session tokens are never returned from account APIs or recorded in audit details.
- Failed login attempts are rate-limited per client IP in the current server process. A multi-instance deployment should move this counter to a shared store before exposing the service to untrusted networks.

## Permission model

Accounts have independent global permissions, project memberships, full panel grants, and project-scoped permissions. No browser role field grants authority. The first administrator has the explicit `*` global grant.

Global permission keys: `users:read`, `users:manage`, `projects:create`, `projects:manage`, `permissions:delegate`, `audit:read`, `projects:all`, `panels:all`, and `devices:manage`.

Project permission keys: `project:manage`, `permissions:delegate`, `audit:read`, and `devices:manage`.

The management API is rooted at `/api/users`; account access is read and updated at `/api/users/:id/access`; activity is available from `/api/audit`; current-user password changes use `/api/auth/password`. Every route checks the authenticated user and its server-side permissions.

## Project and panel settings storage

Project and panel identity and project metadata remain in the existing `app_state` JSON document. Editable panel settings and that panel's saved draft files are stored in `app_panel_settings`, keyed by `(project_id, panel_id)`. The row is created lazily on first read/write, seeded from legacy active settings only when their `selectedPanelId` matches the requested panel; no existing workspace, floor-plan, or ESP data is dropped.

`GET` and `PUT /api/projects/:projectId/panels/:panelId/settings` require a live human session and an explicit panel grant or global `panels:all`/`*` permission. The server verifies that the panel belongs to the project in the workspace document. The write accepts only the application’s editable settings keys, runs in a transaction while locking the workspace identity row, and commits the settings row and its audit event together. Writes to separate panels do not replace each other. The workspace API filters project metadata to the caller's authorized scope and omits panel settings; its existing whole-workspace write permissions remain in force.

The panel settings migration is additive DDL in `server/user-auth-schema.sql` and is applied by the existing schema initialization. It preserves the old `app_state`, floor-plan, and ESP tables.

Apply the SQL files in `server/` through the documented command flow; do not drop or recreate `app_state`, floor-plan, or ESP tables during deployment. No administrative messaging feature is included.
