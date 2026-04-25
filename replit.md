# BonziWORLD Server

Server for the BonziWORLD chat client (a fork of heyjoeway/BonziWORLD). It is a Node.js / Express + Socket.io application that also serves the prebuilt static client from `build/www`.

## Tech Stack
- Node.js 20
- Express 4
- Socket.io 2
- winston (logging)
- sanitize-html, fs-extra

## Project Structure
- `index.js` — entry point; sets up Express + Socket.io, loads settings, starts the server
- `meat.js` — main chat / room / event logic
- `ban.js`, `console.js`, `log.js`, `utils.js` — helpers
- `settings.json` — runtime configuration (port, prefs, logging, etc.)
- `build/www/` — prebuilt static client (HTML/JS/CSS/assets)
- `logs/`, `bans.json`, `blacklist.txt`, `colors.txt` — runtime data

## Replit Setup
- Workflow `Start application` runs `node index.js` and serves the app on port `5000` (webview).
- The HTTP server binds to `0.0.0.0:5000` so it's reachable through Replit's preview proxy.
- `settings.json` was changed from port `3000` to `5000` to match Replit's required frontend port.

## Deployment
- Configured as a `vm` (always-running) deployment using `node index.js`.
- VM is required because Socket.io maintains in-memory state for rooms and connected users, which would not survive autoscale instance recycling.

## Notes
- The client is already built into `build/www`; rebuilding requires the original client repo (Sass/Grunt). Not needed to run the server.
- Console messages about `cordova.js` / `css/platform.css` 404s are expected: those files only exist in the Cordova mobile build, not the web build.
