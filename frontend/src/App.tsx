import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './styles/App.css';

interface Token {
  _id: string;
  name: string;
}

interface PRDetails {
  title: string;
  owner: string;
  repo: string;
  pull_number: number;
  author: string;
  state: string;
}

interface HistoryEntry {
  id: string;
  prUrl: string;
  prTitle: string;
  repo: string;
  pull_number: number;
  approver: string;
  status: 'approved' | 'failed';
  error?: string;
  timestamp: Date;
}

const GitHubLogo = () => (
  <svg className="github-logo" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg" aria-label="GitHub">
    <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="currentColor" />
  </svg>
);

const App: React.FC = () => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenValue, setNewTokenValue] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [prDetails, setPrDetails] = useState<PRDetails | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    fetchTokens();
    fetchHistory();
    const saved = localStorage.getItem('pr-tool-theme');
    if (saved === 'light') {
      setIsDark(false);
      document.body.classList.add('light');
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.body.classList.toggle('light', !next);
    localStorage.setItem('pr-tool-theme', next ? 'dark' : 'light');
  };

  const clearMessages = () => { setError(null); setSuccess(null); };

  const fetchHistory = async () => {
    try {
      const res = await axios.get('/api/history');
      setHistory(res.data.map((e: any) => ({ ...e, id: e._id, timestamp: new Date(e.timestamp) })));
    } catch (err: any) {
      console.error('Error fetching history:', err);
    }
  };

  const clearHistory = async () => {
    try {
      await axios.delete('/api/history');
      setHistory([]);
    } catch (err: any) {
      console.error('Error clearing history:', err);
    }
  };

  const fetchTokens = async () => {
    try {
      const res = await axios.get('/api/tokens');
      setTokens(res.data);
    } catch (err: any) {
      console.error('Error fetching tokens:', err);
    }
  };

  const handleAddToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName || !newTokenValue) return;
    clearMessages();
    try {
      setLoading(true);
      await axios.post('/api/tokens', { name: newTokenName, token: newTokenValue });
      setNewTokenName('');
      setNewTokenValue('');
      setSuccess('Token saved successfully.');
      fetchTokens();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add token');
    } finally { setLoading(false); }
  };

  const handleFetchPRDetails = async () => {
    if (!prUrl) return;
    clearMessages();
    try {
      setLoading(true);
      setPrDetails(null);
      const res = await axios.post('/api/pr/details', { url: prUrl });
      setPrDetails(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch PR details');
    } finally { setLoading(false); }
  };

  const handleApprovePR = async () => {
    if (!prUrl || !selectedTokenId || !prDetails) return;
    clearMessages();
    try {
      setLoading(true);
      await axios.post('/api/pr/approve', {
        url: prUrl,
        tokenId: selectedTokenId,
        prTitle: prDetails.title,
      });
      setSuccess('PR approved successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to approve PR');
    } finally {
      setLoading(false);
      fetchHistory();
    }
  };

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const fmtDate = (d: Date) =>
    d.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="app-wrapper">

      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-left">
          <GitHubLogo />
          <div>
            <h1>PR Approval Tool</h1>
            <p>Emergency GitHub pull request approvals</p>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-theme" onClick={toggleTheme}>
            <span className="theme-icon">{isDark ? '☀' : '◐'}</span>
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <div className="main-layout">

        {/* LEFT — workflow panels */}
        <div className="left-col">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {/* Panel 1 — Tokens */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-number">1</div>
                <h2>Token Management</h2>
              </div>
              <form onSubmit={handleAddToken} className="token-header-form">
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="Approver name"
                />
                <input
                  type="password"
                  value={newTokenValue}
                  onChange={(e) => setNewTokenValue(e.target.value)}
                  placeholder="ghp_..."
                />
                <button type="submit" className="btn-add-token" disabled={loading}>
                  + Add
                </button>
              </form>
            </div>
            <div className="panel-body">
              <div className="token-grid">
                {tokens.length === 0 ? (
                  <div className="token-empty">No approvers registered yet</div>
                ) : (
                  tokens.map((token) => (
                    <div key={token._id} className="token-row">
                      <div className="token-dot" />
                      <span className="token-name">{token.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Panel 2 — Fetch PR */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-number">2</div>
                <h2>Fetch Pull Request</h2>
              </div>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>GitHub PR URL</label>
                <input
                  type="text"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/pull/123"
                />
              </div>
              <button
                className="btn btn-secondary"
                onClick={handleFetchPRDetails}
                disabled={loading || !prUrl}
              >
                {loading && !prDetails ? 'Loading...' : 'Fetch PR Details'}
              </button>
            </div>
          </div>

          {/* Panel 3 — Approve */}
          {prDetails && (
            <div className="panel">
              <div className="panel-header">
                <div className="panel-header-left">
                  <div className="panel-number">3</div>
                  <h2>Approve Pull Request</h2>
                </div>
              </div>
              <div className="panel-body">
                <div className="pr-card">
                  <div className="pr-card-title">PR #{prDetails.pull_number}</div>
                  <div className="pr-title-row">
                    <div className="pr-meta-label">Title</div>
                    <div className="pr-meta-value" style={{ marginTop: 6, fontSize: 15 }}>
                      {prDetails.title}
                    </div>
                  </div>
                  <div className="pr-meta">
                    <div className="pr-meta-item">
                      <span className="pr-meta-label">Repository</span>
                      <span className="pr-meta-value">{prDetails.owner}/{prDetails.repo}</span>
                    </div>
                    <div className="pr-meta-item">
                      <span className="pr-meta-label">Author</span>
                      <span className="pr-meta-value">@{prDetails.author}</span>
                    </div>
                    <div className="pr-meta-item">
                      <span className="pr-meta-label">Status</span>
                      <span className={`pr-state-badge ${prDetails.state !== 'open' ? 'closed' : ''}`}>
                        {prDetails.state}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label>Select Approver</label>
                  <select value={selectedTokenId} onChange={(e) => setSelectedTokenId(e.target.value)}>
                    <option value="">-- Choose an approver --</option>
                    {tokens.map((token) => (
                      <option key={token._id} value={token._id}>{token.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn btn-danger"
                  onClick={handleApprovePR}
                  disabled={loading || !selectedTokenId}
                >
                  {loading ? 'Approving...' : 'Approve PR Now'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Timeline history */}
        <div className="right-col">
          <div className="timeline-panel">
            <div className="timeline-header">
              <div className="timeline-header-left">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                  <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
                </svg>
                <span>TIMELINE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="timeline-count">{history.length}</span>
                {history.length > 0 && (
                  <button className="btn-clear-history" onClick={clearHistory} title="Clear history">
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="timeline-body">
              {history.length === 0 ? (
                <div className="timeline-empty">
                  <div className="timeline-empty-icon">
                    <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                      <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
                    </svg>
                  </div>
                  <p>No approvals yet</p>
                  <span>Actions will appear here</span>
                </div>
              ) : (
                <div className="timeline-tree">
                  {history.map((entry, idx) => (
                    <div key={entry.id} className="tl-item">
                      {/* vertical branch line */}
                      <div className="tl-branch">
                        <div className={`tl-dot ${entry.status}`}>
                          {entry.status === 'approved' ? (
                            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                            </svg>
                          ) : (
                            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                            </svg>
                          )}
                        </div>
                        {idx < history.length - 1 && <div className="tl-line" />}
                      </div>

                      {/* content */}
                      <div className="tl-content">
                        <div className="tl-meta">
                          <span className="tl-time">{fmt(entry.timestamp)}</span>
                          <span className="tl-date">{fmtDate(entry.timestamp)}</span>
                          <span className={`tl-badge ${entry.status}`}>{entry.status}</span>
                        </div>
                        <a
                          href={entry.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="tl-pr-title"
                        >
                          #{entry.pull_number} — {entry.prTitle}
                        </a>
                        <div className="tl-details">
                          <div className="tl-detail-row">
                            <span className="tl-detail-label">Repo</span>
                            <span className="tl-detail-value">{entry.repo}</span>
                          </div>
                          <div className="tl-detail-row">
                            <span className="tl-detail-label">By</span>
                            <span className="tl-detail-value">{entry.approver}</span>
                          </div>
                          {entry.error && (
                            <div className="tl-error-msg">{entry.error}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>{/* end main-layout */}
    </div>
  );
};

export default App;
