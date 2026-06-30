import { Hono } from "hono";
import { getVideoById } from "../db";

const pages = new Hono();

const NAV_LINKS = [
  { href: "/", label: "Download" },
  { href: "/videos", label: "Videos" },
] as const;

function layout(title: string, body: string, activePath = ""): string {
  const navHtml = NAV_LINKS.map(
    ({ href, label }) =>
      `<a href="${href}"${href === activePath ? ' class="active"' : ""}>${label}</a>`,
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --panel: #171b26;
      --border: #2a3142;
      --text: #e8ecf4;
      --muted: #9aa4b8;
      --accent: #6ea8ff;
      --accent-hover: #8cbcff;
      --danger: #ff6b7a;
      --success: #5fd38d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, system-ui, sans-serif;
      background: radial-gradient(circle at top, #1a2233, var(--bg));
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
    }
    .site-header {
      width: min(720px, 100%);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      padding: 0 4px;
    }
    .brand {
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--text);
      text-decoration: none;
      letter-spacing: 0.02em;
    }
    .brand:hover { color: var(--accent); }
    .site-header nav {
      display: flex;
      gap: 8px;
    }
    .site-header nav a {
      padding: 8px 14px;
      border-radius: 8px;
      color: var(--muted);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .site-header nav a:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }
    .site-header nav a.active {
      color: var(--accent);
      background: rgba(110, 168, 255, 0.12);
    }
    .card {
      width: min(720px, 100%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 8px; font-size: 1.6rem; }
    p { color: var(--muted); line-height: 1.5; }
    label { display: block; margin: 16px 0 8px; font-weight: 600; }
    input {
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #0d1018;
      color: var(--text);
      font-size: 1rem;
    }
    button {
      margin-top: 18px;
      width: 100%;
      padding: 12px 16px;
      border: none;
      border-radius: 10px;
      background: var(--accent);
      color: #08111f;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
    }
    button:hover { background: var(--accent-hover); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .status { margin-top: 16px; min-height: 1.2rem; font-size: 0.95rem; }
    .status.error { color: var(--danger); }
    .status.success { color: var(--success); }
    .links { margin-top: 20px; font-size: 0.95rem; }
    .links a { color: var(--accent); text-decoration: none; }
    video {
      width: 100%;
      border-radius: 12px;
      background: #000;
      margin-top: 16px;
    }
    .hidden { display: none; }
    .video-list { margin-top: 20px; display: grid; gap: 12px; }
    .video-item {
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #0d1018;
    }
    .video-item h2 {
      margin: 0 0 6px;
      font-size: 1rem;
      font-weight: 600;
    }
    .video-item .meta {
      font-size: 0.85rem;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .video-item a { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
    .video-item a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge.ready { background: rgba(95, 211, 141, 0.15); color: var(--success); }
    .badge.failed { background: rgba(255, 107, 122, 0.15); color: var(--danger); }
    .badge.pending, .badge.downloading { background: rgba(110, 168, 255, 0.15); color: var(--accent); }
  </style>
</head>
<body>
  <header class="site-header">
    <a href="/" class="brand">YT-DO</a>
    <nav>${navHtml}</nav>
  </header>
  ${body}
</body>
</html>`;
}

pages.get("/", (c) => {
  const html = layout(
    "YT-DO Admin",
    `<main class="card">
      <h1>Download a YouTube video</h1>
      <p>Paste a YouTube link and your master password. The video is saved locally in 720p and a watch link + per-video password is sent to Telegram.</p>
      <form id="download-form">
        <label for="url">YouTube URL</label>
        <input id="url" name="url" type="url" placeholder="https://www.youtube.com/watch?v=..." required />
        <label for="masterPassword">Master password</label>
        <input id="masterPassword" name="masterPassword" type="password" required autocomplete="current-password" />
        <button type="submit" id="submit-btn">Start download</button>
      </form>
      <div id="status" class="status"></div>
    </main>
    <script>
      const form = document.getElementById('download-form');
      const statusEl = document.getElementById('status');
      const submitBtn = document.getElementById('submit-btn');
      const masterPasswordInput = document.getElementById('masterPassword');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        statusEl.textContent = '';
        statusEl.className = 'status';
        submitBtn.disabled = true;

        const url = document.getElementById('url').value.trim();
        const masterPassword = masterPasswordInput.value;
        sessionStorage.setItem('masterPassword', masterPassword);

        try {
          const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, masterPassword }),
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Request failed');
          }
          statusEl.className = 'status success';
          statusEl.textContent = data.message + ' Job ID: ' + data.id;
        } catch (error) {
          statusEl.className = 'status error';
          statusEl.textContent = error.message;
        } finally {
          submitBtn.disabled = false;
        }
      });
    </script>`,
    "/",
  );

  return c.html(html);
});

pages.get("/videos", (c) => {
  const html = layout(
    "Videos — YT-DO",
    `<main class="card">
      <h1>Your videos</h1>
      <p>All downloads stored on this server. Enter your master password to load the list.</p>
      <form id="load-form">
        <label for="masterPassword">Master password</label>
        <input id="masterPassword" name="masterPassword" type="password" required autocomplete="current-password" />
        <button type="submit" id="load-btn">Load videos</button>
      </form>
      <div id="status" class="status"></div>
      <div id="video-list" class="video-list hidden"></div>
    </main>
    <script>
      const form = document.getElementById('load-form');
      const statusEl = document.getElementById('status');
      const listEl = document.getElementById('video-list');
      const loadBtn = document.getElementById('load-btn');
      const masterPasswordInput = document.getElementById('masterPassword');

      const saved = sessionStorage.getItem('masterPassword');
      if (saved) masterPasswordInput.value = saved;

      async function loadVideos() {
        statusEl.textContent = '';
        statusEl.className = 'status';
        loadBtn.disabled = true;

        const masterPassword = masterPasswordInput.value;
        sessionStorage.setItem('masterPassword', masterPassword);

        try {
          const response = await fetch('/api/videos?masterPassword=' + encodeURIComponent(masterPassword));
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Request failed');
          }

          if (data.videos.length === 0) {
            listEl.classList.add('hidden');
            statusEl.className = 'status';
            statusEl.textContent = 'No videos yet. Start a download from the Download page.';
            return;
          }

          listEl.innerHTML = data.videos.map((video) => {
            const title = video.title || 'Untitled';
            const watchHref = '/watch/' + video.id;
            return '<article class="video-item">' +
              '<h2>' + escapeHtml(title) + '</h2>' +
              '<div class="meta"><span class="badge ' + video.status + '">' + video.status + '</span></div>' +
              (video.status === 'ready'
                ? '<a href="' + watchHref + '">Open watch page</a>'
                : video.status === 'failed'
                  ? '<span class="meta">' + escapeHtml(video.error_message || 'Download failed') + '</span>'
                  : '<span class="meta">Still processing…</span>') +
              '</article>';
          }).join('');
          listEl.classList.remove('hidden');
        } catch (error) {
          listEl.classList.add('hidden');
          statusEl.className = 'status error';
          statusEl.textContent = error.message;
        } finally {
          loadBtn.disabled = false;
        }
      }

      function escapeHtml(text) {
        const el = document.createElement('span');
        el.textContent = text;
        return el.innerHTML;
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadVideos();
      });

      if (saved) loadVideos();
    </script>`,
    "/videos",
  );

  return c.html(html);
});

pages.get("/watch/:id", (c) => {
  const videoId = c.req.param("id");
  const video = getVideoById(videoId);

  if (!video) {
    return c.html(
      layout("Not found", `<main class="card"><h1>Video not found</h1><p>This link is invalid or expired.</p><p class="links"><a href="/">Back to download</a> · <a href="/videos">All videos</a></p></main>`),
      404,
    );
  }

  const html = layout(
    video.title ? `Watch — ${video.title}` : "Watch video",
    `<main class="card">
      <h1 id="title">${video.title ?? "Protected video"}</h1>
      <p id="subtitle">Enter the password sent with your Telegram link to stream this video.</p>
      <form id="unlock-form" class="${video.status === "ready" ? "" : "hidden"}">
        <label for="password">Video password</label>
        <input id="password" name="password" type="password" required autocomplete="off" />
        <button type="submit">Unlock and play</button>
      </form>
      <div id="status" class="status">${renderStatusMessage(video.status, video.error_message)}</div>
      <video id="player" class="hidden" controls playsinline controlsList="nodownload"></video>
    </main>
    <script>
      const videoId = ${JSON.stringify(videoId)};
      const initialStatus = ${JSON.stringify(video.status)};
      const form = document.getElementById('unlock-form');
      const statusEl = document.getElementById('status');
      const player = document.getElementById('player');
      const titleEl = document.getElementById('title');

      if (initialStatus === 'pending' || initialStatus === 'downloading') {
        const poll = setInterval(async () => {
          const response = await fetch('/api/videos/' + videoId);
          const data = await response.json();
          if (data.status === 'ready') {
            clearInterval(poll);
            statusEl.textContent = 'Video is ready. Enter the password to watch.';
            statusEl.className = 'status success';
            form.classList.remove('hidden');
          } else if (data.status === 'failed') {
            clearInterval(poll);
            statusEl.textContent = data.error_message || 'Download failed.';
            statusEl.className = 'status error';
          }
        }, 3000);
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        statusEl.textContent = '';
        statusEl.className = 'status';

        const password = document.getElementById('password').value;
        const response = await fetch('/api/videos/' + videoId + '/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await response.json();
        if (!response.ok) {
          statusEl.className = 'status error';
          statusEl.textContent = data.error || 'Invalid password';
          return;
        }

        form.classList.add('hidden');
        statusEl.className = 'status success';
        statusEl.textContent = 'Unlocked. Streaming...';
        if (data.title) titleEl.textContent = data.title;
        player.src = data.streamUrl;
        player.classList.remove('hidden');
        player.play().catch(() => {});
      });
    </script>`,
  );

  return c.html(html);
});

function renderStatusMessage(
  status: string,
  errorMessage: string | null,
): string {
  switch (status) {
    case "pending":
    case "downloading":
      return "Download in progress. This page will update automatically.";
    case "failed":
      return errorMessage ?? "Download failed.";
    default:
      return "";
  }
}

export { pages };
