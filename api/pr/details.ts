import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../_db';
import { Token } from '../_models';
import { decrypt } from '../_crypto';
import { parsePRUrl, getPRDetails } from '../_github';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const parsed = parsePRUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub PR URL' });

  await connectDB();

  try {
    const tokenDoc = await Token.findOne();
    if (!tokenDoc) return res.status(404).json({ error: 'No tokens available. Please add a token first.' });
    const token = decrypt(tokenDoc.encryptedToken, tokenDoc.iv, tokenDoc.authTag);
    const details = await getPRDetails(token, parsed.owner, parsed.repo, parsed.pull_number);
    return res.json({
      title: details.title,
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: parsed.pull_number,
      author: details.user?.login,
      state: details.state,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch PR details: ' + err.message });
  }
}
