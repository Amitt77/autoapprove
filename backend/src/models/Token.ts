import mongoose, { Schema, Document } from 'mongoose';

export interface IToken extends Document {
  name: string;
  encryptedToken: string;
  iv: string; // Initialization vector for AES-GCM
  authTag: string; // Auth tag for AES-GCM
  createdAt: Date;
}

const TokenSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  encryptedToken: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IToken>('Token', TokenSchema);
