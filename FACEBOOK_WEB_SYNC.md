# Facebook Local to Web Sync

This project can watch a local JSON file and push the same posts to the public
`/facebook` dashboard after the local import succeeds.

## Flow

1. Run the local server with `npm run dev`.
2. Run the Master Prompt in Codex, Claude, GPT, or Antigravity.
3. The prompt writes JSON to `C:\Users\dungvuq1920\Desktop\facebook-posts.json`.
4. The local server imports the JSON into `http://localhost:3000/facebook`.
5. If remote sync env variables are configured, the local server also sends the
   same JSON to `https://bongbanviet.com/api/fb-posts/import`.
6. The public server upserts posts by `source_id`, so rerunning the same week
   updates existing posts instead of creating duplicates.

## Local env

Create or update `.env` on the local machine:

```env
FACEBOOK_AUTO_IMPORT=1
FACEBOOK_IMPORT_JSON_FILE=C:\Users\dungvuq1920\Desktop\facebook-posts.json
FACEBOOK_REMOTE_SYNC_URL=https://bongbanviet.com/api/fb-posts/import
FACEBOOK_REMOTE_SYNC_TOKEN=change-this-long-random-token
```

## Public/Railway env

Set this on the public server:

```env
FACEBOOK_IMPORT_TOKEN=change-this-long-random-token
```

`FACEBOOK_IMPORT_TOKEN` must match `FACEBOOK_REMOTE_SYNC_TOKEN`.

## Manual one-off sync

After env is set, this command pushes the JSON file to the configured endpoint:

```bash
npm run facebook:sync-web
```

## Security notes

- Do not commit `.env`.
- Use a long random token.
- If `FACEBOOK_IMPORT_TOKEN` is set on the public server, imports without the
  token are rejected.
- On Railway, the import endpoint requires `FACEBOOK_IMPORT_TOKEN` unless
  `FACEBOOK_ALLOW_PUBLIC_IMPORT=1` is explicitly set.
