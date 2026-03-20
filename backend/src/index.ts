import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './db';
import Token from './models/Token';
import History from './models/History';
import { encrypt, decrypt } from './utils/crypto';
import { parsePRUrl, getPRDetails, approvePR } from './github';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

// --- TOKEN ROUTES ---

app.post('/api/tokens', async (req: Request, res: Response) => {
  const { name, token } = req.body;
  if (!name || !token) {
    return res.status(400).json({ error: 'Name and token are required' });
  }
  try {
    const { encryptedToken, iv, authTag } = encrypt(token);
    const newToken = new Token({ name, encryptedToken, iv, authTag });
    await newToken.save();
    res.json({ message: 'Token saved successfully', name });
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.get('/api/tokens', async (req: Request, res: Response) => {
  try {
    const tokens = await Token.find().select('name');
    res.json(tokens);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- PR ROUTES ---

app.post('/api/pr/details', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const parsed = parsePRUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub PR URL' });

  try {
    const tokenDoc = await Token.findOne();
    if (!tokenDoc) {
      return res.status(404).json({ error: 'No tokens available. Please add a token first.' });
    }
    const token = decrypt(tokenDoc.encryptedToken, tokenDoc.iv, tokenDoc.authTag);
    const details = await getPRDetails(token, parsed.owner, parsed.repo, parsed.pull_number);
    res.json({
      title: details.title,
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: parsed.pull_number,
      author: details.user?.login,
      state: details.state,
    });
  } catch (err: any) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch PR details: ' + err.message });
  }
});

app.post('/api/pr/approve', async (req: Request, res: Response) => {
  const { url, tokenId, prTitle } = req.body;
  if (!url || !tokenId) return res.status(400).json({ error: 'URL and Token ID are required' });

  const parsed = parsePRUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub PR URL' });

  const repo = `${parsed.owner}/${parsed.repo}`;

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

    res.json({ message: 'PR approved successfully' });
  } catch (err: any) {
    console.error(err.message);
    const errMsg = 'Failed to approve PR: ' + err.message;

    // Attempt to save the failed entry (best-effort)
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
    } catch (_) { /* ignore secondary failure */ }

    res.status(500).json({ error: errMsg });
  }
});

// --- HISTORY ROUTES ---

app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const entries = await History.find().sort({ timestamp: -1 }).limit(200);
    res.json(entries);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.delete('/api/history', async (req: Request, res: Response) => {
  try {
    await History.deleteMany({});
    res.json({ message: 'History cleared' });
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
