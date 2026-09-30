# Learning Quest

Homeschool math & reading practice app, with multi-student progress tracking, a parent dashboard, and offline (PWA) support.

- `index.html` - the main app
- `admin.html` - parent/admin dashboard (password protected)
- `docs.html` - help guide for students, parents, and offline mode
- `manifest.json`, `service-worker.js`, `icon-*.png` - installable/offline PWA support
- `netlify/functions/api.mts` - sync API (`/api/*`), a Netlify Function storing data in Netlify Blobs; nothing runs on your computer
- `server/server.js` - older self-hosted alternative (Node + SQLite + ngrok); not used by the live site

Deployed on Netlify from the `main` branch: every push to `main` publishes automatically.
