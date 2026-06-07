// PixelStream backend
// ----------------------------------------------------------------------------
// Flow:  Frontend  <--WebSocket-->  this server  <--CDP-->  headless Chromium
//
//  - "start"  : launch Chromium, begin CDP screencast, stream JPEG frames out
//  - mouse/keyboard/scroll events come in, get injected via CDP Input.* events
//  - "navigate": load a new URL in the page
// ----------------------------------------------------------------------------

const http = require("http");
const { WebSocketServer } = require("ws");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Stealth plugin masks ~20 different headless/automation fingerprints that
// sites like Google use to detect bots. Far stronger than manual masking.
puppeteer.use(StealthPlugin());

const PORT = process.env.PORT || 8080;
const VIEWPORT = { width: 1280, height: 720 };
// Default to Google. With real Chrome + headful (Xvfb) + stealth + your local
// residential IP (Docker NATs through the host network), reCAPTCHA should now
// accept manual solves. Override with START_URL if you want another landing page.
const START_URL = process.env.START_URL || "https://www.google.com";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Map of special (non-printable) keys -> Windows virtual key codes.
// CDP needs windowsVirtualKeyCode for keys like Enter, Backspace, arrows, etc.
const KEY_CODES = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Escape: 27,
  " ": 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
};

const server = http.createServer((req, res) => {
  // simple health check
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("PixelStream backend running\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[ws] client connected");

  let browser = null;
  let page = null;
  let client = null; // CDP session

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const cleanup = async () => {
    try {
      if (browser) await browser.close();
    } catch (_) {}
    browser = page = client = null;
  };

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      // ---------------------------------------------------------------- START
      if (msg.type === "start") {
        if (browser) return; // already running
        console.log("[browser] launching...");

        browser = await puppeteer.launch({
          headless: false, // headful under Xvfb -> much higher reCAPTCHA trust
          executablePath: process.env.CHROME_PATH || undefined,
          defaultViewport: VIEWPORT,
          userDataDir: "/app/user-data", // persist cookies/profile across sessions
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-blink-features=AutomationControlled", // hide automation flag
            "--lang=en-US,en",
            `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
          ],
        });

        page = await browser.newPage();
        await page.setViewport(VIEWPORT);

        // --- make the headless browser look like a real one (less bot-detection) ---
        await page.setUserAgent(USER_AGENT);
        await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
        await page.evaluateOnNewDocument(() => {
          // hide the webdriver flag that automation tools expose
          Object.defineProperty(navigator, "webdriver", { get: () => undefined });
          // pretend to have plugins + languages like a normal Chrome
          Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
          Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
        });

        await page.goto(START_URL, { waitUntil: "domcontentloaded" }).catch(() => {});

        // CDP session: handles both screencast (out) and input (in)
        client = await page.target().createCDPSession();

        client.on("Page.screencastFrame", async ({ data, sessionId }) => {
          send({ type: "frame", data }); // base64-encoded JPEG
          try {
            await client.send("Page.screencastFrameAck", { sessionId });
          } catch (_) {}
        });

        await client.send("Page.startScreencast", {
          format: "jpeg",
          quality: 60,
          maxWidth: VIEWPORT.width,
          maxHeight: VIEWPORT.height,
          everyNthFrame: 1,
        });

        send({ type: "started", ...VIEWPORT, url: page.url() });
        console.log("[browser] started");
        return;
      }

      if (!client || !page) return;

      // ---------------------------------------------------------------- MOUSE
      if (msg.type === "mousemove") {
        await client.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: msg.x,
          y: msg.y,
        });
      } else if (msg.type === "mousedown" || msg.type === "mouseup") {
        await client.send("Input.dispatchMouseEvent", {
          type: msg.type === "mousedown" ? "mousePressed" : "mouseReleased",
          x: msg.x,
          y: msg.y,
          button: msg.button === 2 ? "right" : "left",
          clickCount: 1,
        });
      } else if (msg.type === "scroll") {
        await client.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: msg.x,
          y: msg.y,
          deltaX: msg.deltaX || 0,
          deltaY: msg.deltaY || 0,
        });
      }

      // ------------------------------------------------------------- KEYBOARD
      else if (msg.type === "keydown") {
        const key = msg.key;
        if (key && key.length === 1) {
          // printable character
          await client.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            text: key,
            key,
          });
          await client.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key,
          });
        } else if (KEY_CODES[key] !== undefined) {
          // special key
          const code = KEY_CODES[key];
          await client.send("Input.dispatchKeyEvent", {
            type: "rawKeyDown",
            key,
            windowsVirtualKeyCode: code,
            nativeVirtualKeyCode: code,
          });
          await client.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key,
            windowsVirtualKeyCode: code,
            nativeVirtualKeyCode: code,
          });
        }
      }

      // ------------------------------------------------------------- NAVIGATE
      else if (msg.type === "navigate" && msg.url) {
        let url = msg.url.trim();
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
        send({ type: "navigated", url: page.url() });
      }
    } catch (err) {
      console.error("[error]", err.message);
    }
  });

  ws.on("close", () => {
    console.log("[ws] client disconnected");
    cleanup();
  });
  ws.on("error", cleanup);
});

server.listen(PORT, () => console.log(`PixelStream backend listening on :${PORT}`));
