import mongoose, { Schema } from 'mongoose';

// ── Token ──────────────────────────────────────────────
const TokenSchema = new Schema({
  name:           { type: String, required: true, unique: true },
  encryptedToken: { type: String, required: true },
  iv:             { type: String, required: true },
  authTag:        { type: String, required: true },
  createdAt:      { type: Date,   default: Date.now },
});

export const Token = mongoose.models.Token || mongoose.model('Token', TokenSchema);

// ── History ────────────────────────────────────────────
const HistorySchema = new Schema({
  prUrl:       { type: String, required: true },
  prTitle:     { type: String, required: true },
  repo:        { type: String, required: true },
  pull_number: { type: Number, required: true },
  approver:    { type: String, required: true },
  status:      { type: String, enum: ['approved', 'failed'], required: true },
  error:       { type: String },
  timestamp:   { type: Date,   default: Date.now },
});

export const History = mongoose.models.History || mongoose.model('History', HistorySchema);
