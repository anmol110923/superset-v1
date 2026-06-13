/**
 * FaceMonitor.jsx
 * ---------------
 * Webcam-based face proctoring using face-api.js (loaded from CDN).
 * Checks every POLL_MS milliseconds and reports violations:
 *   - NO_FACE      : candidate has left the frame
 *   - MULTI_FACE   : more than one face visible (external help)
 *   - LOOK_AWAY    : face detected but head turned > LOOK_AWAY_DEG degrees
 *
 * Props:
 *   onViolation(type, timestamp) — called on each new violation event
 *   onStatusChange(status)       — "loading" | "ready" | "error"
 */

import { useEffect, useRef, useState } from "react";

const POLL_MS = 3000;           // check every 3 s
const LOOK_AWAY_DEG = 25;       // yaw threshold for "looking away"
const MODEL_URL =
  "https://justadudewhohacks.github.io/face-api.js/models";

// Dynamically load face-api.js from CDN once
function loadFaceApi() {
  return new Promise((resolve, reject) => {
    if (window.faceapi) return resolve(window.faceapi);
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
    s.onload = () => resolve(window.faceapi);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function FaceMonitor({ onViolation, onStatusChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | denied
  const [lastAlert, setLastAlert] = useState(null);

  const changeStatus = (s) => {
    setStatus(s);
    onStatusChange?.(s);
  };

  useEffect(() => {
    let stream = null;

    async function init() {
      try {
        // 1. Load face-api.js
        const faceapi = await loadFaceApi();

        // 2. Load models (tiny detector + landmarks for yaw estimation)
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);

        // 3. Open webcam
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await new Promise((res) => {
          videoRef.current.onloadedmetadata = res;
        });
        videoRef.current.play();

        changeStatus("ready");

        // 4. Polling loop
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;

          const detections = await faceapi
            .detectAllFaces(
              videoRef.current,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 160 })
            )
            .withFaceLandmarks(true); // tiny landmarks

          // Draw overlay
          drawOverlay(faceapi, detections);

          // --- Violation logic ---
          let violation = null;

          if (detections.length === 0) {
            violation = "NO_FACE";
          } else if (detections.length > 1) {
            violation = "MULTI_FACE";
          } else {
            // Estimate yaw from nose tip vs face width
            const lm = detections[0].landmarks;
            const nose = lm.getNose();
            const noseTip = nose[3]; // landmark 33
            const box = detections[0].detection.box;
            const faceCenterX = box.x + box.width / 2;
            const yawRatio = (noseTip.x - faceCenterX) / (box.width / 2);
            // yawRatio ≈ 0 = facing camera, ±1 = full profile
            const estimatedYawDeg = Math.abs(yawRatio) * 90;
            if (estimatedYawDeg > LOOK_AWAY_DEG) {
              violation = "LOOK_AWAY";
            }
          }

          if (violation) {
            const ts = Date.now();
            setLastAlert({ type: violation, ts });
            onViolation?.(violation, ts);
          } else {
            setLastAlert(null);
          }
        }, POLL_MS);
      } catch (err) {
        console.error("[FaceMonitor]", err);
        if (err.name === "NotAllowedError") {
          changeStatus("denied");
        } else {
          changeStatus("error");
        }
      }
    }

    init();

    return () => {
      clearInterval(intervalRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function drawOverlay(faceapi, detections) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);
    const resized = faceapi.resizeResults(detections, displaySize);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resized.forEach((d) => {
      const box = d.detection.box;
      const ok = detections.length === 1;
      ctx.strokeStyle = ok ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    });
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.videoWrap}>
        <video
          ref={videoRef}
          style={styles.video}
          muted
          playsInline
          width={320}
          height={240}
        />
        <canvas ref={canvasRef} style={styles.canvas} width={320} height={240} />

        {/* Status overlays */}
        {status === "loading" && (
          <div style={styles.overlay}>
            <span style={styles.overlayText}>Loading models…</span>
          </div>
        )}
        {status === "denied" && (
          <div style={{ ...styles.overlay, background: "rgba(239,68,68,0.85)" }}>
            <span style={styles.overlayText}>⚠ Camera access denied</span>
          </div>
        )}
        {status === "error" && (
          <div style={{ ...styles.overlay, background: "rgba(239,68,68,0.85)" }}>
            <span style={styles.overlayText}>⚠ Camera unavailable</span>
          </div>
        )}

        {/* Live violation banner */}
        {lastAlert && status === "ready" && (
          <div style={styles.alertBanner}>
            {lastAlert.type === "NO_FACE" && "⚠ No face detected"}
            {lastAlert.type === "MULTI_FACE" && "⚠ Multiple faces!"}
            {lastAlert.type === "LOOK_AWAY" && "⚠ Looking away"}
          </div>
        )}
      </div>

      <p style={styles.label}>
        {status === "ready" ? "🟢 Webcam active" : "⏳ Initialising…"}
      </p>
    </div>
  );
}

const styles = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  videoWrap: {
    position: "relative",
    width: 320,
    height: 240,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid #334155",
    background: "#000",
  },
  video: {
    position: "absolute", top: 0, left: 0,
    width: "100%", height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)", // mirror
  },
  canvas: {
    position: "absolute", top: 0, left: 0,
    width: "100%", height: "100%",
    transform: "scaleX(-1)",
  },
  overlay: {
    position: "absolute", inset: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(15,23,42,0.8)",
  },
  overlayText: { color: "#e2e8f0", fontSize: 13, fontFamily: "monospace" },
  alertBanner: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    background: "rgba(239,68,68,0.85)",
    color: "#fff", fontSize: 12, fontWeight: 700,
    textAlign: "center", padding: "4px 0",
    fontFamily: "monospace",
  },
  label: { fontSize: 11, color: "#475569", marginTop: 6, marginBottom: 0 },
};
