import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './_db';
import { Token } from './_models';
import { encrypt } from './_crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  if (req.method === 'GET') {
    try {
      const tokens = await Token.find().select('name');
      return res.json(tokens);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { name, token } = req.body;
    if (!name || !token) return res.status(400).json({ error: 'Name and token are required' });
    try {
      const { encryptedToken, iv, authTag } = encrypt(token);
      const newToken = new Token({ name, encryptedToken, iv, authTag });
      await newToken.save();
      return res.json({ message: 'Token saved successfully', name });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
