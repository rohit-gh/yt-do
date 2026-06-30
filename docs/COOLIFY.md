# Deploy YT-DO on Coolify

Run [YT-DO](https://github.com/your-org/yt-do) as a Docker service on a [Coolify](https://coolify.io) server. The app downloads YouTube videos with **yt-dlp**, stores them on disk, and sends watch links via Telegram.

## What you need

| Item | Notes |
|------|--------|
| Coolify server | v4+ with Docker |
| Git repository | This project pushed to GitHub/GitLab/Gitea |
| Domain (recommended) | e.g. `yt.yourdomain.com` — used in Telegram links (`BASE_URL`) |
| Telegram bot | Token + chat ID from [@BotFather](https://t.me/BotFather) |

The container includes **Bun**, **Node.js** (for yt-dlp’s YouTube JS solver), and **ffmpeg** (for merging streams). **yt-dlp** is downloaded automatically on first start if it is not already on `PATH`.

---

## 1. Push the repo

Coolify deploys from Git. Push this project to a remote your Coolify instance can reach.

---

## 2. Create a new resource in Coolify

1. Open your **Project** → **+ New Resource**
2. Choose **Application** → **Public Repository** (or Private if you use deploy keys)
3. Paste the repository URL
4. **Build Pack**: select **Dockerfile**
5. **Dockerfile location**: `Dockerfile` (repository root)
6. **Port**: `9988` (must match `PORT` below)

---

## 3. Environment variables

In the application **Environment Variables** tab, add:

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes | `https://yt.yourdomain.com` | Public URL in Telegram messages (no trailing slash) |
| `MASTER_PASSWORD` | Yes | `your-strong-admin-password` | Admin page (`/`) password |
| `SESSION_SECRET` | Yes | output of `openssl rand -hex 32` | Signs video access cookies |
| `TELEGRAM_BOT_TOKEN` | Yes | `123456:ABC...` | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Yes | `123456789` | Your chat or group ID |
| `PORT` | No | `9988` | HTTP port (default `9988`) |
| `DATA_DIR` | No | `/app/data` | Persistent data root (default in image) |
| `YT_DLP_PATH` | No | `/app/data/bin/yt-dlp` | Override auto-download location |

**Do not** mark these as build variables — they are only needed at runtime.

Generate a session secret locally:

```bash
openssl rand -hex 32
```

---

## 4. Persistent storage (important)

Videos and the SQLite database live under `DATA_DIR` (`/app/data` in the image). Without a volume, data is lost when the container is recreated.

1. Open **Storages** (or **Persistent Storage**) for the application
2. Add a volume:

   | Field | Value |
   |-------|--------|
   | **Destination path** | `/app/data` |
   | **Name** | `yt-do-data` (or any label) |

Coolify creates a named Docker volume on the host. This keeps `yt-do.db`, downloaded videos, and the auto-installed `yt-dlp` binary across redeploys.

---

## 5. Domain and HTTPS

1. Open **Domains** for the application
2. Add your subdomain, e.g. `yt.yourdomain.com`
3. Point DNS **A record** to your Coolify server IP
4. Enable **HTTPS** (Let’s Encrypt) in Coolify
5. Set `BASE_URL` to the same HTTPS URL:

   ```env
   BASE_URL=https://yt.yourdomain.com
   ```

Coolify’s reverse proxy forwards traffic to container port **9988**.

---

## 6. Deploy

1. Click **Deploy**
2. Watch **Logs** for:

   ```
   [yt-dlp] Downloading yt-dlp_linux from GitHub…   # only on first run
   [yt-dlp] Installed to /app/data/bin/yt-dlp
   yt-dlp is available (2026.xx.xx)
   Server listening on http://0.0.0.0:9988
   ```

3. Open `https://yt.yourdomain.com/` — you should see the download page with **Download** / **Videos** in the header

---

## 7. Health check

The `Dockerfile` defines:

```dockerfile
HEALTHCHECK CMD curl -fsS http://127.0.0.1:9988/ || exit 1
```

If Coolify reports unhealthy builds, either wait for the first yt-dlp download to finish (~10s) or disable the health check in Coolify’s application settings.

---

## 8. Verify Telegram

1. Start a download from `/`
2. When it completes, you should receive a Telegram message with the watch link and per-video password
3. If not, check logs and confirm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and that you have messaged the bot at least once

---

## Architecture

```text
Internet
   │
   ▼
Coolify proxy (443) ──► container:9988 (Bun + Hono)
                              │
                              ├── SQLite  → /app/data/yt-do.db
                              ├── Videos  → /app/data/videos/
                              └── yt-dlp  → /app/data/bin/yt-dlp (auto-downloaded)
```

---

## Updating

- **App code**: push to Git → Coolify redeploys (or trigger manual deploy)
- **yt-dlp**: delete `/app/data/bin/yt-dlp` on the volume and restart, or run inside the container:

  ```bash
  docker exec -it <container> /app/data/bin/yt-dlp -U
  ```

  On next start, if the binary is missing, the app downloads the latest release again.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing required environment variable` | Set all required env vars in Coolify and redeploy |
| Downloads fail / `403` from YouTube | Restart to refresh yt-dlp; ensure Node is in the image (included in Dockerfile) |
| `ffmpeg` merge errors | Confirm `ffmpeg` is installed (included in Dockerfile) |
| Videos disappear after redeploy | Attach persistent volume at `/app/data` |
| Telegram link uses wrong host | `BASE_URL` must match your public HTTPS domain |
| Health check failing | Increase start period or disable health check during first deploy |

---

## Local Docker test (optional)

Before Coolify, smoke-test the image:

```bash
cp .env.example .env   # fill in values
docker build -t yt-do .
docker run --rm -p 9988:9988 --env-file .env -v yt-do-data:/app/data yt-do
```

Open http://localhost:9988

---

## Related docs

- [Coolify — Dockerfile build pack](https://coolify.io/docs/applications/build-packs/dockerfile)
- [Coolify — Environment variables](https://coolify.io/docs/knowledge-base/environment-variables)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
