# 两个人 · Two of Us

A private space for two people: shared plans, individual habit check-ins, memories, and photo albums. The interface is in Simplified Chinese.

Built with React 19, TypeScript, Tailwind, Vinext/Vite, Cloudflare Workers, D1/Drizzle, and R2. Requires Node.js >=22.13.0.

## Local setup

```sh
npm ci --prefer-offline --no-audit --no-fund
npm run build
```

Apply each migration once, in filename order, to a fresh local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lying_adam_warlock.sql
```

Repeat with `0001_dashing_susan_delgado.sql`, `0002_blushing_vindicator.sql`, and `0003_nifty_stick.sql`. An existing database with migrations 0000–0002 only needs 0003. Do not replay applied migrations.

Create the two invitations, then start the server:

```sh
npm run invite -- --local --slot 1 --email first@example.com --name First --origin http://127.0.0.1:5173
npm run invite -- --local --slot 2 --email second@example.com --name Second --origin http://127.0.0.1:5173
npm run dev
```

Open each generated link and set a password. There are no default accounts or passwords. `npm run dev:mobile` exposes the server to your LAN but does not bypass app login.

## Authentication

There is no public signup. A database constraint allows only account slots 1 and 2. An administrator with D1 access creates an email-bound, one-use invitation, valid for seven days. Its random secret is in the URL fragment, removed when the login form mounts; only its hash is stored in D1.

Passwords require 15–128 characters and use salted scrypt (N=32768, r=8, p=3). Seven-day opaque sessions use hashed tokens in D1 and HttpOnly, SameSite=Lax cookies, marked Secure on HTTPS. Logout revokes the current session. Persistent email/IP counters limit authentication attempts, and all mutations check Origin. ChatGPT identity headers do not grant app access.

Share invitation links privately. The app does not send email or independently verify mailbox ownership; possession of the email-bound invitation is the enrollment credential.

For password recovery, the administrator reissues an invitation:

```sh
npm run invite -- --local --slot 1 --email first@example.com --name First --origin http://127.0.0.1:5173 --reset
```

`--reset` immediately revokes that account's sessions and clears its password. The recipient sets a new password through the new link. Unused invitations can be reissued without `--reset`. The tool refuses to replace a slot with another email.

## Existing data and production rollout

Migration 0003 adds authentication tables without deleting shared content. Invite the existing profile emails to preserve user IDs, names, authorship, and habit history. Duplicate old profiles sharing an email must be resolved first. Unlinked profiles cannot sign in and are not shown as members; their shared content remains.

Before release, back up D1, apply migration 0003 to production, and issue both invitations. Production provisioning uses `--remote`, an HTTPS `--origin`, and `--config PATH` pointing to a Wrangler configuration with the real production D1 database ID. The generated local configuration's all-zero ID is a placeholder, unsuitable for production administration.

Bindings remain `DB` (D1) and `BUCKET` (R2). On Sites hosting, the external access policy must allow visitors to reach `/login`; this change does not alter that hosting policy or deploy the site. The app itself requires its own session.

Benchmark password hashing against the production Worker plan's CPU allowance before rollout. Local runtime tests do not enforce production plan CPU limits.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration
```

Unit tests cover hashing, invitations, schema constraints, date validation, request security, and photo rollback. Integration tests use the compiled Worker and isolated local D1/R2 storage. They never access production resources; disposable state is under ignored `.wrangler/integration-*` directories.

## Code map

- `app/login/`: login and invitation UI
- `app/auth.ts`, `app/api/auth/route.ts`: sessions, registration, login, logout
- `app/together-app.tsx`: shared UI and refresh every 15 seconds while visible
- `app/api/workspace/route.ts`: plans, habits, memories, and names
- `app/api/memory-photos/route.ts`: authenticated R2 uploads and reads
- `db/schema.ts`, `drizzle/`: database schema and migrations
- `scripts/invite.mjs`: administrator invitations and password recovery
- `worker/index.ts`: Worker entrypoint and private response caching

Habit frequency is currently a descriptive label. Cross-device changes use polling and refresh when the window regains focus.
