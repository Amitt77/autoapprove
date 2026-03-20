import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../_db';
import { Token, History } from '../_models';
import { decrypt } from '../_crypto';
import { parsePRUrl, approvePR } from '../_github';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, tokenId, prTitle } = req.body;
  if (!url || !tokenId) return res.status(400).json({ error: 'URL and Token ID are required' });

  const parsed = parsePRUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub PR URL' });

  const repo = `${parsed.owner}/${parsed.repo}`;

  await connectDB();

  try {
    const tokenDoc = await Token.findById(tokenId);
    if (!tokenDoc) return res.status(404).json({ error: 'Token not found' });

    const token = decrypt(tokenDoc.encryptedToken, tokenDoc.iv, tokenDoc.authTag);
    await approvePR(token, parsed.owner, parsed.repo, parsed.pull_number);

    await History.create({
      prUrl: url,
      prTitle: prTitle || `PR #${parsed.pull_number}`,
      repo,
      pull_number: parsed.pull_number,
      approver: tokenDoc.name,
      status: 'approved',
      timestamp: new Date(),
    });

    return res.json({ message: 'PR approved successfully' });
  } catch (err: any) {
    const errMsg = 'Failed to approve PR: ' + err.message;
    try {
      const tokenDoc = await Token.findById(tokenId);
      await History.create({
        prUrl: url,
        prTitle: prTitle || `PR #${parsed.pull_number}`,
        repo,
        pull_number: parsed.pull_number,
        approver: tokenDoc ? tokenDoc.name : 'Unknown',
        status: 'failed',
        error: errMsg,
        timestamp: new Date(),
      });
    } catch (_) { /* ignore */ }
    return res.status(500).json({ error: errMsg });
  }
}
