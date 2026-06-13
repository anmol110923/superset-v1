import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const VERDICT_COLOR = {
  CLEAN: "#22c55e",
  SUSPICIOUS: "#f59e0b",
  FLAGGED: "#ef4444",
  PENDING: "#94a3b8",
};

export default function JudgeDashboard() {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/exam/sessions`)
      .then((r) => r.json())
      .then((data) => { setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const select = async (sessionId) => {
    const res = await fetch(`${API}/api/exam/session/${sessionId}`);
    const data = await res.json();
    setSelected(data);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>ExamGuard</span>
        <span style={styles.role}>Judge Dashboard</span>
      </header>

      <div style={styles.body}>
        {/* Session list */}
        <aside style={styles.sidebar}>
          <p style={styles.sideLabel}>Sessions ({sessions.length})</p>
          {loading && <p style={{ color: "#475569" }}>Loading…</p>}
          {sessions.map((s) => (
            <div
              key={s.sessionId}
              onClick={() => select(s.sessionId)}
              style={{
                ...styles.sessionRow,
                background:
                  selected?.sessionId === s.sessionId ? "#1e3a5f" : "transparent",
              }}
            >
              <span style={styles.name}>{s.candidateName}</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span
                  style={{
                    color: VERDICT_COLOR[s.finalVerdict],
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {s.finalVerdict}
                </span>
                {s.faceViolationCount > 0 && (
                  <span style={{ fontSize: 10, color: "#f59e0b" }}>
                    👁 {s.faceViolationCount}
                  </span>
                )}
              </div>
            </div>
          ))}
        </aside>

        {/* Detail panel */}
        <main style={styles.detail}>
          {!selected && (
            <p style={{ color: "#475569" }}>Select a session to inspect.</p>
          )}
          {selected && (
            <>
              <h2 style={styles.detailName}>{selected.candidateName}</h2>
              <p style={styles.sub}>
                Session: <code>{selected.sessionId}</code> · Exam:{" "}
                {selected.examId}
              </p>

              <div style={styles.verdictBadge(selected.finalVerdict)}>
                {selected.finalVerdict}
              </div>

              {/* Core integrity metrics */}
              <SectionLabel>Integrity</SectionLabel>
              <div style={styles.grid}>
                <Stat
                  label="Merkle Valid"
                  value={selected.merkleValid ? "✓ YES" : "✗ NO"}
                  warn={!selected.merkleValid}
                />
                <Stat
                  label="Tab Exits"
                  value={selected.tabExits}
                  warn={selected.tabExits > 2}
                />
                <Stat
                  label="Paste Events"
                  value={selected.pasteCount}
                  warn={selected.pasteCount > 0}
                />
                <Stat
                  label="Keystrokes"
                  value={selected.keystrokes?.length ?? "—"}
                />
              </div>

              {/* ── Face proctoring section ── */}
              <SectionLabel>Face Proctoring</SectionLabel>
              <div style={styles.grid}>
                <Stat
                  label="Total Violations"
                  value={selected.faceViolationCount ?? 0}
                  warn={(selected.faceViolationCount ?? 0) > 0}
                />
                <Stat
                  label="No Face"
                  value={selected.faceNoFaceCount ?? 0}
                  warn={(selected.faceNoFaceCount ?? 0) >= 3}
                />
                <Stat
                  label="Multiple Faces"
                  value={selected.faceMultiFaceCount ?? 0}
                  warn={(selected.faceMultiFaceCount ?? 0) >= 1}
                />
                <Stat
                  label="Look Away"
                  value={selected.faceLookAwayCount ?? 0}
                  warn={(selected.faceLookAwayCount ?? 0) >= 5}
                />
              </div>

              {/* Face violation timeline */}
              {selected.faceViolations?.length > 0 && (
                <div style={styles.section}>
                  <p style={styles.sectionLabel}>Face Violation Timeline</p>
                  <div style={styles.timeline}>
                    {selected.faceViolations.map((v, i) => (
                      <div key={i} style={styles.timelineRow}>
                        <span
                          style={{
                            ...styles.violationTag,
                            background:
                              v.type === "NO_FACE"
                                ? "#ef444433"
                                : v.type === "MULTI_FACE"
                                ? "#f59e0b33"
                                : "#fb923c33",
                            color:
                              v.type === "NO_FACE"
                                ? "#ef4444"
                                : v.type === "MULTI_FACE"
                                ? "#f59e0b"
                                : "#fb923c",
                          }}
                        >
                          {v.type === "NO_FACE" && "No Face"}
                          {v.type === "MULTI_FACE" && "Multi Face"}
                          {v.type === "LOOK_AWAY" && "Look Away"}
                        </span>
                        <span style={styles.timelineTime}>
                          {new Date(v.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analyzer metrics */}
              {selected.analyzerResult && (
                <div style={styles.section}>
                  <SectionLabel>Analyzer Metrics</SectionLabel>
                  <div style={styles.grid}>
                    <Stat
                      label="Anomaly Score"
                      value={selected.analyzerResult.anomalyScore?.toFixed(3)}
                      warn={selected.analyzerResult.anomalyScore > 0.45}
                    />
                    <Stat
                      label="Hold Time Mean"
                      value={`${selected.analyzerResult.holdTimeMean} ms`}
                    />
                    <Stat
                      label="Hold Time Std"
                      value={`${selected.analyzerResult.holdTimeStd} ms`}
                    />
                    <Stat
                      label="IKG Mean"
                      value={`${selected.analyzerResult.ikgMean} ms`}
                    />
                    <Stat
                      label="IKG Std"
                      value={`${selected.analyzerResult.ikgStd} ms`}
                    />
                    <Stat
                      label="AST Similarity"
                      value={selected.analyzerResult.astSimilarity?.toFixed(3)}
                      warn={selected.analyzerResult.astSimilarity > 0.6}
                    />
                  </div>
                </div>
              )}

              {/* Merkle roots */}
              <div style={styles.section}>
                <SectionLabel>Merkle Roots</SectionLabel>
                <p style={styles.mono}>Client: {selected.merkleRoot || "—"}</p>
                <p style={styles.mono}>
                  Server: {selected.serverMerkleRoot || "—"}
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <p style={styles.sectionLabel}>{children}</p>;
}

function Stat({ label, value, warn }) {
  return (
    <div style={styles.statBox}>
      <p style={styles.statLabel}>{label}</p>
      <p style={{ ...styles.statVal, color: warn ? "#ef4444" : "#e2e8f0" }}>
        {value ?? "—"}
      </p>
    </div>
  );
}

const styles = {
  page: {
    background: "#0f172a",
    minHeight: "100vh",
    color: "#e2e8f0",
    fontFamily: "monospace",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 24px",
    borderBottom: "1px solid #1e293b",
  },
  logo: { fontWeight: 700, fontSize: 18, color: "#38bdf8" },
  role: { color: "#64748b", fontSize: 13 },
  body: { display: "flex", height: "calc(100vh - 49px)" },
  sidebar: {
    width: 260,
    borderRight: "1px solid #1e293b",
    padding: 16,
    overflowY: "auto",
  },
  sideLabel: {
    fontSize: 11,
    color: "#475569",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  sessionRow: {
    padding: "10px 8px",
    borderRadius: 6,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  name: { fontSize: 13 },
  detail: { flex: 1, padding: 32, overflowY: "auto" },
  detailName: { marginTop: 0, fontSize: 22, color: "#38bdf8" },
  sub: { color: "#64748b", fontSize: 12, marginBottom: 20 },
  verdictBadge: (v) => ({
    display: "inline-block",
    padding: "4px 16px",
    borderRadius: 20,
    fontWeight: 700,
    fontSize: 13,
    color: "#0f172a",
    background:
      { CLEAN: "#22c55e", SUSPICIOUS: "#f59e0b", FLAGGED: "#ef4444", PENDING: "#94a3b8" }[v] ||
      "#94a3b8",
    marginBottom: 24,
  }),
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 24,
  },
  statBox: { background: "#1e293b", borderRadius: 8, padding: 14 },
  statLabel: {
    fontSize: 10,
    color: "#475569",
    margin: "0 0 4px",
    textTransform: "uppercase",
  },
  statVal: { fontSize: 16, fontWeight: 700, margin: 0 },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 0,
    borderBottom: "1px solid #1e293b",
    paddingBottom: 4,
  },
  mono: { fontSize: 11, color: "#64748b", wordBreak: "break-all", margin: "2px 0" },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 200,
    overflowY: "auto",
    background: "#1e293b",
    borderRadius: 8,
    padding: 12,
  },
  timelineRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  violationTag: {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4,
  },
  timelineTime: { fontSize: 10, color: "#64748b" },
};