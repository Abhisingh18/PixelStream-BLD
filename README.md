# PixelStream 🖥️➡️🌐

A mini "TeamViewer for a browser". You open a web UI, hit **Start Browser**, and a
**headless Chromium running inside a Docker container** streams its screen back to
your browser in real time. You can **click, scroll, type, and navigate** — and it
all happens inside that remote headless browser..

Built for the **BLD SDE Intern assignment**.

---

## How it works

```
┌──────────────┐   click / scroll / type (WebSocket)   ┌───────────────┐   CDP    ┌──────────────────┐
│  Web UI      │  ───────────────────────────────────► │  Node backend │ ───────► │ Headless Chromium │
│ (Next.js)    │                                        │  (ws + CDP)   │          │   (Puppeteer)     │
│  <canvas>    │  ◄─────────────────────────────────── │               │ ◄─────── │                  │
└──────────────┘     live JPEG frames (WebSocket)       └───────────────┘ screencast └──────────────────┘
```

- **Frontend** (`/frontend`) — Next.js app. A `<canvas>` paints the live frames;
  mouse/keyboard/scroll events are captured, converted to real browser
  coordinates, and sent over a WebSocket.
- **Backend** (`/backend`) — Node.js + `ws` + Puppeteer. Launches Chromium, uses the
  **Chrome DevTools Protocol (CDP)** `Page.startScreencast` to get a continuous
  stream of JPEG frames, and injects input via `Input.dispatchMouseEvent` /
  `Input.dispatchKeyEvent`.
- **Docker** — both services run in containers via `docker compose`. The backend
  uses the official Puppeteer image (Chromium + system deps preinstalled).

### Why CDP screencast (not a screenshot loop)?

`Page.startScreencast` only emits a frame when the page actually changes, and it's
much smoother and lower-latency than taking `page.screenshot()` on a timer.

---

## Run it

### Option A — Docker (recommended)

```bash
docker compose up --build
```

Then open **http://localhost:3000** and click **Start Browser**.

### Option B — Local (no Docker, for fast iteration)

```bash
# terminal 1
cd backend && npm install && npm start      # ws server on :8080

# terminal 2
cd frontend && npm install && npm run dev    # UI on :3000
```

---

## Deploy (Frontend → Vercel, Backend → Render)

> ⚠️ The browser page is served over **HTTPS** (Vercel), so it can only open a
> **secure** WebSocket (`wss://`). Render gives you an `https://…onrender.com`
> URL, whose WebSocket endpoint is `wss://…onrender.com`. Plain `ws://` will be
> blocked as mixed content.

### 1. Backend on Render

- New **Web Service** → connect this repo.
- Runtime: **Docker**, Dockerfile path: `backend/Dockerfile`, context: `backend`
  (or just use the included `render.yaml` Blueprint).
- Deploy. Note the URL, e.g. `https://pixelstream-backend.onrender.com`.
- Render injects `PORT` automatically — the server already reads it.

### 2. Frontend on Vercel

- New Project → import this repo → set **Root Directory = `frontend`**.
- Add an environment variable:

  | Key | Value |
  |-----|-------|
  | `NEXT_PUBLIC_WS_URL` | `wss://pixelstream-backend.onrender.com` |

- Deploy. Open the Vercel URL → **Start Browser**.


---

## What works ✅

- Start a headless Chromium in a Docker container from the web UI
- Live screen streaming via CDP screencast (JPEG frames over WebSocket)
- Mouse: move, left/right click, scroll
- Keyboard: printable characters + common special keys (Enter, Backspace, Tab,
  arrows, Esc, Delete…)
- URL bar to navigate the remote browser
- Accurate click mapping (canvas coords → real viewport coords)

## Known limitations / where it gets hard ⚠️

- **Keyboard coverage** — only common special keys are mapped; modifier
  combos (Ctrl+C, Shift+selection) aren't fully wired yet.
- **Single session** — one browser per server; no multi-user / multi-tab.
- **Streaming** — JPEG-over-WebSocket is simple but bandwidth-heavy; WebRTC or
  VP8/H.264 encoding would be smoother at scale.
- **Chromium-in-Docker** — needs `--no-sandbox`, `--disable-dev-shm-usage`, and
  `shm_size: 1gb` or Chromium crashes. (These are already set.)

## Next steps 🚀

1. Full keyboard model with modifiers + IME/composition events
2. Multiple isolated sessions (one container per user, spawned on demand)
3. WebRTC streaming for lower latency / adaptive quality
4. Reconnect handling + session timeouts + resource cleanup

---

## Project structure

```
Pixel/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js          # ws server + Puppeteer + CDP screencast/input
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.js
    └── app/
        ├── layout.js
        └── page.js        # UI + canvas + input capture
```
