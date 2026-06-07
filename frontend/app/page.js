"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export default function Home() {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const dims = useRef({ width: 1280, height: 720 });

  const [status, setStatus] = useState("idle"); // idle | connecting | live
  const [url, setUrl] = useState("https://www.google.com");

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  const start = useCallback(() => {
    if (wsRef.current) return;
    setStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "start" }));

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "started") {
        dims.current = { width: msg.width, height: msg.height };
        if (msg.url) setUrl(msg.url);
        setStatus("live");
      } else if (msg.type === "navigated") {
        if (msg.url) setUrl(msg.url);
      } else if (msg.type === "frame") {
        const img = new Image();
        img.onload = () => {
          const c = canvasRef.current;
          if (!c) return;
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        };
        img.src = "data:image/jpeg;base64," + msg.data;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus("idle");
    };
    ws.onerror = () => setStatus("idle");
  }, []);

  // map a DOM event on the canvas -> real browser pixel coordinates
  const toBrowser = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * dims.current.width),
      y: Math.round(((e.clientY - r.top) / r.height) * dims.current.height),
    };
  };

  // forward keyboard while live
  useEffect(() => {
    const onKey = (e) => {
      if (status !== "live") return;
      // don't hijack typing in the URL bar
      if (document.activeElement?.tagName === "INPUT") return;
      e.preventDefault();
      send({ type: "keydown", key: e.key });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, send]);

  const navigate = (e) => {
    e.preventDefault();
    send({ type: "navigate", url });
    canvasRef.current?.focus();
  };

  const live = status === "live";

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={S.logo}>
          Pixel<span style={{ color: "#6366f1" }}>Stream</span>
        </h1>
        <span style={S.badge(status)}>{status.toUpperCase()}</span>
      </header>

      {!live && (
        <button onClick={start} disabled={status === "connecting"} style={S.startBtn}>
          {status === "connecting" ? "Starting…" : "▶  Start Browser"}
        </button>
      )}

      {live && (
        <form onSubmit={navigate} style={S.urlBar}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={S.urlInput}
            placeholder="Enter a URL and press Go"
          />
          <button type="submit" style={S.goBtn}>
            Go
          </button>
        </form>
      )}

      <div style={S.stage}>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          tabIndex={0}
          style={{ ...S.canvas, display: live ? "block" : "none" }}
          onMouseMove={(e) => send({ type: "mousemove", ...toBrowser(e) })}
          onMouseDown={(e) => {
            canvasRef.current.focus();
            send({ type: "mousedown", ...toBrowser(e), button: e.button });
          }}
          onMouseUp={(e) => send({ type: "mouseup", ...toBrowser(e), button: e.button })}
          onWheel={(e) =>
            send({ type: "scroll", ...toBrowser(e), deltaX: e.deltaX, deltaY: e.deltaY })
          }
          onContextMenu={(e) => e.preventDefault()}
        />
        {!live && (
          <div style={S.placeholder}>
            Click <b>Start Browser</b> to launch a headless Chromium and stream it here.
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #ffffff 0%, #f5f3ff 35%, #ede9fe 70%, #ddd6fe 100%)",
    color: "#3b0764",
    fontFamily: "system-ui, sans-serif",
    padding: 24,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center", // center everything horizontally
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },
  logo: { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: "#4c1d95" },
  badge: (s) => ({
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 999,
    background: s === "live" ? "#7c3aed" : s === "connecting" ? "#a78bfa" : "#e9d5ff",
    color: s === "idle" ? "#6d28d9" : "#fff",
  }),
  startBtn: {
    fontSize: 16,
    fontWeight: 700,
    padding: "12px 22px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    color: "#fff",
    cursor: "pointer",
    marginBottom: 20,
    boxShadow: "0 6px 18px rgba(124,58,237,0.35)",
  },
  urlBar: { display: "flex", gap: 8, marginBottom: 16, width: 960, maxWidth: "100%" },
  urlInput: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #c4b5fd",
    background: "rgba(255,255,255,0.85)",
    color: "#4c1d95",
    fontSize: 14,
    outline: "none",
  },
  goBtn: {
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  stage: {
    width: 960,
    height: 540,
    maxWidth: "100%",
    background: "#1e1b2e",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #c4b5fd",
    position: "relative",
    boxShadow: "0 10px 30px rgba(124,58,237,0.18)",
  },
  canvas: { width: "100%", height: "100%", cursor: "crosshair", outline: "none" },
  placeholder: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#a78bfa",
    fontSize: 15,
    textAlign: "center",
    padding: 24,
  },
};
