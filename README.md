# Learning Quest

Homeschool math & reading practice app, with multi-student progress tracking, a parent dashboard, and offline (PWA) support.

- `index.html` - the main app
- `admin.html` - parent/admin dashboard (password protected)
- `docs.html` - help guide for students, parents, and offline mode
- `manifest.json`, `service-worker.js`, `icon-*.png` - installable/offline PWA support
- `server/server.js` - optional self-hosted sync server (Node 22.5+, SQLite, no dependencies); runs on your own computer, not on Netlify

Deployed on Netlify from the `main` branch: every push to `main` publishes automatically.
