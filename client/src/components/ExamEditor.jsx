import { useState, useRef, useCallback, useEffect } from "react";
import { useKeystroke } from "../hooks/useKeystroke";
import IntegrityChart from "./IntegrityChart";
import FaceMonitor from "./FaceMonitor";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ExamEditor({ candidateName = "Candidate", examId = "exam_001" }) {
  const [code, setCode] = useState("# Write your solution here\n");
  const [keystrokes, setKeystrokes] = useState([]);
  const [tabWarnings, setTabWarnings] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [camStatus, setCamStatus] = useState("loading");
  const [faceViolationCount, setFaceViolationCount] = useState(0);

  const sessionId = useRef(generateSessionId());
  const keystrokeBuffer = useRef([]);
  // Accumulate face violations: [{ type, timestamp }]
  const faceViolationsRef = useRef([]);

  const onTabExit = useCallback(({ count }) => {
    setTabWarnings(count);
  }, []);

  const { record, handlePaste, getSubmitPayload } = useKeystroke({ onTabExit });

  // Sync keystroke buffer → state every 2s for IntegrityChart
  useEffect(() => {
    const interval = setInterval(() => {
      setKeystrokes([...keystrokeBuffer.current]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleKeyDown = (e) => {
    const event = { key: e.key, type: "keydown", timestamp: Date.now() };
    keystrokeBuffer.current.push(event);
    record(e.key, "keydown");
  };

  const handleKeyUp = (e) => {
    const event = { key: e.key, type: "keyup", timestamp: Date.now() };
    keystrokeBuffer.current.push(event);
    record(e.key, "keyup");
  };

  const handlePasteEvent = () => {
    handlePaste();
  };

  // Called by FaceMonitor on each violation
  const handleFaceViolation = useCallback((type, timestamp) => {
    faceViolationsRef.current.push({ type, timestamp });
    setFaceViolationCount((c) => c + 1);
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = await getSubmitPayload();
      const res = await fetch(`${API}/api/exam/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current,
          candidateName,
          examId,
          code,
          faceViolations: faceViolationsRef.current,       // ← new
          faceViolationCount: faceViolationsRef.current.length, // ← new
          ...payload,
        }),
      });
      const data = await res.json();
      setResult(data);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit failed:", err);
      alert("Submission failed. Check console.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && result) {
    return (
      <div style={styles.container}>
        <div style={styles.resultBox}>
          <h2 style={styles.resultTitle}>Submission Received</h2>
          <p>Session: <code>{sessionId.current}</code></p>
          <p>Merkle Integrity: <strong style={{ color: result.merkleValid ? "#22c55e" : "#ef4444" }}>
            {result.merkleValid ? "✓ VALID" : "✗ TAMPERED"}
          </strong></p>
          <p>Verdict: <strong style={{ color: verdictColor(result.finalVerdict) }}>
            {result.finalVerdict}
          </strong></p>
          {result.faceViolationCount > 0 && (
            <p>Face Violations: <strong style={{ color: "#ef4444" }}>
              {result.faceViolationCount}
            </strong></p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.logo}>ExamGuard</span>
        <span style={styles.meta}>{candidateName} · {examId}</span>
        <div style={styles.badges}>
          {tabWarnings > 0 && (
            <span style={styles.warningBadge}>⚠ Tab exits: {tabWarnings}</span>
          )}
          {faceViolationCount > 0 && (
            <span style={styles.warningBadge}>👁 Face alerts: {faceViolationCount}</span>
          )}
        </div>
      </header>

      {/* Main two-column layout: editor left, webcam right */}
      <div style={styles.main}>
        <div style={styles.editorCol}>
          <textarea
            style={styles.editor}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPaste={handlePasteEvent}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="Write your code here..."
          />

          <div style={styles.chartSection}>
            <p style={styles.chartLabel}>Live Keystroke Analysis</p>
            <IntegrityChart keystrokes={keystrokes} />
          </div>
        </div>

        {/* Webcam panel */}
        <div style={styles.camCol}>
          <p style={styles.camLabel}>Proctoring Camera</p>
          <FaceMonitor
            onViolation={handleFaceViolation}
            onStatusChange={setCamStatus}
          />

          {/* Face violation log */}
          {faceViolationCount > 0 && (
            <div style={styles.violationLog}>
              <p style={styles.violationTitle}>Recent Alerts</p>
              {faceViolationsRef.current.slice(-5).reverse().map((v, i) => (
                <div key={i} style={styles.violationRow}>
                  <span style={styles.violationType(v.type)}>
                    {v.type === "NO_FACE" && "No face"}
                    {v.type === "MULTI_FACE" && "Multiple faces"}
                    {v.type === "LOOK_AWAY" && "Look away"}
                  </span>
                  <span style={styles.violationTime}>
                    {new Date(v.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <span style={styles.counter}>
          {keystrokes.filter((e) => e.type === "keydown").length} keystrokes
        </span>
        <button
          style={{ ...styles.btn, opacity: submitting ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Submitting…" : "Submit Exam"}
        </button>
      </div>
    </div>
  );
}

function verdictColor(v) {
  return { CLEAN: "#22c55e", SUSPICIOUS: "#f59e0b", FLAGGED: "#ef4444", PENDING: "#94a3b8" }[v] || "#fff";
}

const VIOLATION_COLORS = {
  NO_FACE: "#ef4444",
  MULTI_FACE: "#f59e0b",
  LOOK_AWAY: "#fb923c",
};

const styles = {
  container: {
    background: "#0f172a", minHeight: "100vh", color: "#e2e8f0",
    fontFamily: "monospace", display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", alignItems: "center", gap: 16,
    padding: "12px 24px", borderBottom: "1px solid #1e293b",
  },
  logo: { fontWeight: 700, fontSize: 18, color: "#38bdf8" },
  meta: { color: "#64748b", fontSize: 13 },
  badges: { marginLeft: "auto", display: "flex", gap: 10 },
  warningBadge: { color: "#f59e0b", fontWeight: 600, fontSize: 13 },
  main: { display: "flex", flex: 1, gap: 0 },
  editorCol: { flex: 1, padding: "16px 24px", display: "flex", flexDirection: "column" },
  editor: {
    flex: 1, minHeight: 300,
    background: "#1e293b", color: "#e2e8f0",
    border: "1px solid #334155", borderRadius: 8,
    padding: 16, fontSize: 14, lineHeight: 1.6,
    resize: "vertical", outline: "none",
    fontFamily: "monospace", boxSizing: "border-box",
  },
  chartSection: { paddingTop: 12 },
  chartLabel: { fontSize: 11, color: "#475569", marginBottom: 6 },

  camCol: {
    width: 340, padding: "16px 16px 16px 0",
    display: "flex", flexDirection: "column", gap: 12,
    borderLeft: "1px solid #1e293b",
    paddingLeft: 16,
  },
  camLabel: { fontSize: 11, color: "#475569", textTransform: "uppercase", margin: 0 },

  violationLog: {
    background: "#1e293b", borderRadius: 8, padding: 12,
  },
  violationTitle: { fontSize: 10, color: "#475569", textTransform: "uppercase", margin: "0 0 8px" },
  violationRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 4,
  },
  violationType: (type) => ({
    fontSize: 11, fontWeight: 600,
    color: VIOLATION_COLORS[type] || "#e2e8f0",
  }),
  violationTime: { fontSize: 10, color: "#64748b" },

  footer: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 24px", borderTop: "1px solid #1e293b",
  },
  counter: { fontSize: 12, color: "#475569" },
  btn: {
    background: "#38bdf8", color: "#0f172a", border: "none",
    borderRadius: 6, padding: "10px 28px",
    fontWeight: 700, fontSize: 14, cursor: "pointer",
  },
  resultBox: {
    margin: "80px auto", maxWidth: 480,
    background: "#1e293b", borderRadius: 12, padding: 32,
  },
  resultTitle: { marginTop: 0, color: "#38bdf8" },
};