# YT-DO

A Bun + Hono server that downloads YouTube videos in **720p** with [yt-dlp](https://github.com/yt-dlp/yt-dlp), stores metadata in **SQLite**, and sends a **password-protected watch link** to Telegram. Videos are **streamed** in the browser (not downloaded as files).

## Features

- Admin page (`/`) — paste a YouTube URL + master password to start a download
- Per-video password — required to unlock the built-in player
- Telegram notification with watch link and password when download completes
- SQLite history — title, disk path, password, status, timestamps
- HTTP Range streaming for seeking in the video player

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| [Bun](https://bun.sh) | v1.0+ |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Auto-downloaded on first start if missing; or install manually |
| [Node.js](https://nodejs.org) | Required by yt-dlp for YouTube (included in Docker image) |
| [ffmpeg](https://ffmpeg.org) | Merges video+audio (included in Docker image) |
| Telegram bot | Create via [@BotFather](https://t.me/BotFather) |
| Subdomain (optional) | Point DNS A record to your server IP |

On first start the app checks for `yt-dlp` on `PATH`, then at `data/bin/yt-dlp`. If neither works, it downloads the latest release from GitHub.

Install yt-dlp manually (optional):

```bash
# Linux (pip)
pip install yt-dlp

# or download binary from GitHub releases
yt-dlp --version
```

## Quick start

```bash
cd yt-do
bun install
cp .env.example .env
# Edit .env (see step-by-step below)
bun run dev
```

Server runs on **http://localhost:9988** (or your configured `PORT`).

---

## Step-by-step: configure `.env`

### 1. Copy the example file

```bash
cp .env.example .env
```

### 2. Set `PORT` (optional)

Default is `9988`. Change only if that port is taken:

```env
PORT=9988
```

### 3. Set `BASE_URL` (public watch link)

This is the URL sent in Telegram messages. Use the **subdomain** that points to your machine — not `localhost`.

```env
BASE_URL=https://yt.yourdomain.com
```

**DNS setup:**

1. In your DNS provider, add an **A record**:
   - Name: `yt` (or your chosen subdomain)
   - Value: your server's public IP (e.g. `203.0.113.10`)
2. Put a reverse proxy (Caddy/nginx) in front of the app:

**Caddy example** (`/etc/caddy/Caddyfile`):

```
yt.yourdomain.com {
    reverse_proxy localhost:9988
}
```

**nginx example**:

```nginx
server {
    listen 443 ssl;
    server_name yt.yourdomain.com;
    # ... ssl certs ...

    location / {
        proxy_pass http://127.0.0.1:9988;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

For local testing only, you can use:

```env
BASE_URL=http://localhost:9988
```

Telegram links will then only work on your machine.

### 4. Set `MASTER_PASSWORD`

Password for the admin download page at `/`. Choose a strong secret:

```env
MASTER_PASSWORD=my-very-strong-admin-password
```

### 5. Set `SESSION_SECRET`

Used to sign video access cookies after password verification. Generate a random string:

```bash
openssl rand -hex 32
```

```env
SESSION_SECRET=paste-the-output-here
```

### 6. Set Telegram credentials

**Create a bot:**

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the **bot token**

**Get your chat ID:**

1. Message your bot (or add it to a group)
2. Open: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Find `"chat":{"id": ...}` in the JSON

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

For a group, the chat ID is usually negative (e.g. `-1001234567890`).

### 7. Optional storage paths

Defaults are fine for most setups:

```env
DATA_DIR=./data
VIDEOS_DIR=./data/videos
DB_PATH=./data/yt-do.db
```

### Example complete `.env`

```env
PORT=9988
BASE_URL=https://yt.yourdomain.com
MASTER_PASSWORD=SuperSecretAdminPass123!
SESSION_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=987654321
```

---

## Usage

### 1. Start the server

```bash
bun run dev    # development with hot reload
bun run start  # production
```

### 2. Download a video

1. Open **https://yt.yourdomain.com/** (or `http://localhost:9988/`)
2. Paste a YouTube URL
3. Enter your **master password**
4. Click **Start download**

The server downloads the video in 720p in the background.

### 3. Receive Telegram notification

When ready, you get a message like:

```
🎬 New video ready

Title: Example Video
Link: https://yt.yourdomain.com/watch/<uuid>
Password: Ab3xK9mN2p
```

### 4. Watch the video

1. Open the link from Telegram
2. Enter the **video password** from the same message
3. The video streams in the browser player (seeking supported)

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/download` | Body: `{ "url", "masterPassword" }` — starts download |
| `GET` | `/api/videos` | Query: `?masterPassword=...` — list all videos |
| `GET` | `/api/videos/:id` | Public status (no password in response) |
| `POST` | `/api/videos/:id/verify` | Body: `{ "password" }` — unlock streaming |
| `GET` | `/api/videos/:id/stream` | Stream video (requires unlock cookie) |

---

## Database

SQLite file: `data/yt-do.db`

`videos` table columns:

| Column | Description |
|--------|-------------|
| `id` | UUID |
| `title` | Video title from yt-dlp |
| `file_path` | Absolute path on disk |
| `password` | Per-video watch password |
| `youtube_url` | Original URL |
| `status` | `pending` / `downloading` / `ready` / `failed` |
| `error_message` | Set when status is `failed` |
| `created_at` | Unix ms timestamp |
| `completed_at` | Unix ms timestamp when finished |

Inspect with:

```bash
sqlite3 data/yt-do.db "SELECT id, title, status, password, file_path FROM videos;"
```

---

## Production

### Coolify (recommended for remote VPS)

See **[docs/COOLIFY.md](docs/COOLIFY.md)** for step-by-step deployment with Dockerfile, persistent volume, domain, and environment variables.

### Manual / process manager

Run with a process manager:

```bash
# systemd, PM2, etc.
bun run start
```

Ensure:

- `.env` is on the server (not committed)
- `yt-dlp` is available (auto-installed on first start, or install manually)
- Reverse proxy terminates HTTPS and forwards to port `9988`
- Firewall allows 443 (and 80 for ACME if using Let's Encrypt)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing required environment variable` | Fill in all required vars in `.env` |
| `yt-dlp is not installed` | Restart the app to trigger auto-download, or install yt-dlp manually |
| Telegram message not sent | Check bot token, chat ID, and that you messaged the bot first |
| Video won't play | Confirm status is `ready`; re-enter password; check file exists at `file_path` |
| Link in Telegram doesn't open | Verify DNS A record and reverse proxy point to this server |

---

## License

Private project — use as you like.
