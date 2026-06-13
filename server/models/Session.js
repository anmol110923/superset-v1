const mongoose = require("mongoose");

const KeystrokeEventSchema = new mongoose.Schema({
  key: String,
  type: { type: String, enum: ["keydown", "keyup"] },
  timestamp: Number,
}, { _id: false });

// Each face violation event logged by the client
const FaceViolationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["NO_FACE", "MULTI_FACE", "LOOK_AWAY"],
  },
  timestamp: Number,
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  candidateName: { type: String, required: true },
  examId: { type: String, required: true },
  startTime: { type: Date, default: Date.now },
  endTime: Date,

  keystrokes: [KeystrokeEventSchema],

  merkleRoot: String,
  serverMerkleRoot: String,
  merkleValid: Boolean,

  tabExits: { type: Number, default: 0 },
  pasteCount: { type: Number, default: 0 },

  // ── Face proctoring ──────────────────────────────────────
  faceViolations: [FaceViolationSchema],     // full event log
  faceViolationCount: { type: Number, default: 0 },
  // Breakdown by type
  faceNoFaceCount: { type: Number, default: 0 },
  faceMultiFaceCount: { type: Number, default: 0 },
  faceLookAwayCount: { type: Number, default: 0 },
  // ─────────────────────────────────────────────────────────

  analyzerResult: {
    anomalyScore: Number,
    holdTimeMean: Number,
    holdTimeStd: Number,
    ikgMean: Number,
    ikgStd: Number,
    astSimilarity: Number,
    verdict: { type: String, enum: ["CLEAN", "SUSPICIOUS", "FLAGGED"] },
  },

  finalVerdict: {
    type: String,
    enum: ["CLEAN", "SUSPICIOUS", "FLAGGED", "PENDING"],
    default: "PENDING",
  },
}, { timestamps: true });

module.exports = mongoose.model("Session", SessionSchema);