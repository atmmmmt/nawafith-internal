# Deploy on Hostinger

## Runtime

- Node.js: `22.x`
- Entry file: `server.js`
- Build command: `npm install`
- Start command: `npm start`
- Port: `process.env.PORT` (fallback `3000`)

## Required environment variables

```env
NODE_ENV=production
SESSION_SECRET=PUT_A_LONG_RANDOM_SECRET_HERE
ADMIN_USERNAME=salem
ADMIN_PASSWORD=PUT_OWNER_PASSWORD_HERE
```

Do **not** commit the real `.env` file.

## Archive database

Before starting the app, provide either:

- `data/nawafith_internal.sqlite3.zst`, or
- `data/nawafith_internal.sqlite3`, or
- an `ARCHIVE_URL` environment variable pointing to the compressed archive.

`npm install` runs `scripts/prepare-archive.js` automatically.

## Persistent users and audit log

For production, create a Hostinger MySQL database and add:

```env
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
```

When these values are present the app stores users, roles and audit logs in MySQL. Without MySQL it falls back to `state/local_state.sqlite3`, which is not recommended for managed redeployments.

## Verification

After deploy open:

`/health`

Expected: `ok: true` and `archive: true`.
