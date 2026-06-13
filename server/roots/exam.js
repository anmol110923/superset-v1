const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const Session = require("../models/Session");

const ANALYZER_URL = process.env.ANALYZER_URL || "http://localhost:8000";

// --- Merkle Tree (mirrors client logic) ---
function hashLeaf(event) {
  const str = `${event.key}:${event.type}:${event.timestamp}`;
  return crypto.createHash("sha256").update(str).digest("hex");
}

function buildMerkleRoot(events) {
  if (!events || events.length === 0) return null;
  let layer = events.map(hashLeaf);
  while (layer.length > 1) {
    if (layer.length % 2 !== 0) layer.push(layer[layer.length - 1]);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(
        crypto
          .createHash("sha256")
          .update(layer[i] + layer[i + 1])
          .digest("hex")
      );
    }
    layer = next;
  }
  return layer[0];
}

// --- Face violation analysis helper ---
function analyzeFaceViolations(violations = []) {
  const counts = { NO_FACE: 0, MULTI_FACE: 0, LOOK_AWAY: 0 };
  for (const v of violations) {
    if (counts[v.type] !== undefined) counts[v.type]++;
  }
  return counts;
}

// POST /api/exam/submit
router.post("/submit", async (req, res) => {
  const {
    sessionId,
    candidateName,
    examId,
    keystrokes,
    merkleRoot,
    tabExits,
    pasteCount,
    code,
    faceViolations = [],       // ← new
    faceViolationCount = 0,    // ← new
  } = req.body;

  if (!sessionId || !keystrokes || !merkleRoot) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // 1. Recompute Merkle root server-side
  const serverMerkleRoot = buildMerkleRoot(keystrokes);
  const merkleValid = serverMerkleRoot === merkleRoot;

  if (!merkleValid) {
    console.warn(`[INTEGRITY] Merkle mismatch for session ${sessionId}`);
  }

  // 2. Analyse face violations
  const faceCounts = analyzeFaceViolations(faceViolations);
  console.log(
    `[FACE] session=${sessionId} noFace=${faceCounts.NO_FACE} multiFace=${faceCounts.MULTI_FACE} lookAway=${faceCounts.LOOK_AWAY}`
  );

  // 3. Call Python analyzer
  let analyzerResult = null;
  try {
    const analyzerRes = await axios.post(`${ANALYZER_URL}/analyze`, {
      keystrokes,
      code: code || "",
    });
    analyzerResult = analyzerRes.data;
  } catch (err) {
    console.error("[ANALYZER] Failed to reach analyzer service:", err.message);
  }

  // 4. Determine final verdict
  //    Face violations escalate severity:
  //      - Any MULTI_FACE → at least SUSPICIOUS (possible cheating accomplice)
  //      - NO_FACE ≥ 3   → SUSPICIOUS
  //      - NO_FACE ≥ 6   → FLAGGED (left the desk repeatedly)
  let finalVerdict = "PENDING";

  if (!merkleValid) {
    finalVerdict = "FLAGGED";
  } else if (analyzerResult) {
    finalVerdict = analyzerResult.verdict;
  }

  // Apply face violation overrides (only escalate, never downgrade)
  const escalate = (current, next) => {
    const rank = { PENDING: 0, CLEAN: 1, SUSPICIOUS: 2, FLAGGED: 3 };
    return rank[next] > rank[current] ? next : current;
  };

  if (faceCounts.MULTI_FACE >= 1) {
    finalVerdict = escalate(finalVerdict, "SUSPICIOUS");
  }
  if (faceCounts.NO_FACE >= 3 || faceCounts.MULTI_FACE >= 3) {
    finalVerdict = escalate(finalVerdict, "SUSPICIOUS");
  }
  if (faceCounts.NO_FACE >= 6 || faceCounts.MULTI_FACE >= 5) {
    finalVerdict = escalate(finalVerdict, "FLAGGED");
  }

  // 5. Upsert session in MongoDB
  try {
    const session = await Session.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        candidateName: candidateName || "Unknown",
        examId: examId || "default",
        keystrokes,
        merkleRoot,
        serverMerkleRoot,
        merkleValid,
        tabExits: tabExits || 0,
        pasteCount: pasteCount || 0,
        faceViolations,
        faceViolationCount: faceViolations.length,
        faceNoFaceCount: faceCounts.NO_FACE,
        faceMultiFaceCount: faceCounts.MULTI_FACE,
        faceLookAwayCount: faceCounts.LOOK_AWAY,
        analyzerResult,
        finalVerdict,
        endTime: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      merkleValid,
      finalVerdict,
      faceViolationCount: faceViolations.length,
      sessionId: session.sessionId,
    });
  } catch (err) {
    console.error("[DB] Save failed:", err.message);
    return res.status(500).json({ error: "Database error" });
  }
});

// GET /api/exam/sessions
router.get("/sessions", async (req, res) => {
  try {
    const sessions = await Session.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-keystrokes -faceViolations"); // omit heavy arrays in list view
    return res.json(sessions);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// GET /api/exam/session/:id
router.get("/session/:sessionId", async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: "Not found" });
    return res.json(session);
  } catch (err) {
    return res.status(500).json({ error: "Fetch failed" });
  }
});

module.exports = router;