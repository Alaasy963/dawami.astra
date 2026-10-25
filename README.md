# Dawami — دوامي

Arabic-first multi-tenant attendance PWA. Phase 1 is in progress, not production ready. See [status](docs/PHASE-1-STATUS.md) and [acceptance checklist](FEATURES.md).

## Local development

Use Node 24 (tests use built-in SQLite).

```sh
npm ci
npm run db:migrate
npm run build
npm run preview
```

Open the URL printed by Wrangler. Rebuild after UI edits. Local storage is under `.wrangler/`; real Cloudflare resources are not required for local emulation.

Copy `.dev.vars.example` to `.dev.vars` for optional owner and push setup. `npm run owner:hash` reads a password from standard input and outputs its scrypt hash. Store the hash as `OWNER_HASH`; do not put plaintext passwords in arguments or Git. Unset owner hash disables owner login. Push requires VAPID secrets.

```sh
npm test
npm run test:integration
```

The first command tests actual Hono handlers against temporary SQLite and test KV/rate bindings. The second needs a running Wrangler server (port 8787, override `TEST_URL`). It creates synthetic companies and accounts: use a disposable development database only. Neither test proves Workers CPU limits or real push delivery.

## Deployment — not performed

Create D1, KV and R2 in the owner's account, replace placeholder IDs in `wrangler.toml`, configure secrets with `wrangler secret put`, apply remote migrations, then deploy. Do not deploy this unfinished draft for customers. Measure scrypt CPU on the actual Workers plan before release; never weaken hashing to fit Free. CI does not deploy or activate billing.

## Stack

React/Vite/Tailwind, Hono/Workers, D1/Drizzle, KV, R2 binding, Workbox static shell, Dexie queue, Web Push outbox. Arabic RTL and IBM Plex Sans Arabic. Server-side tenant scope, geofence, device binding, Origin/CSRF and audit triggers.

Global identity and company recovery PIN are separate. A company recovery session cannot switch tenants or accept global invitations. Unverified offline events remain review records and do not enter attendance totals.
