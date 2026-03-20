import mongoose, { Schema, Document } from 'mongoose';

export interface IHistory extends Document {
  prUrl: string;
  prTitle: string;
  repo: string;
  pull_number: number;
  approver: string;
  status: 'approved' | 'failed';
  error?: string;
  timestamp: Date;
}

const HistorySchema: Schema = new Schema({
  prUrl:       { type: String, required: true },
  prTitle:     { type: String, required: true },
  repo:        { type: String, required: true },
  pull_number: { type: Number, required: true },
  approver:    { type: String, required: true },
  status:      { type: String, enum: ['approved', 'failed'], required: true },
  error:       { type: String },
  timestamp:   { type: Date, default: Date.now },
});

export default mongoose.model<IHistory>('History', HistorySchema);
