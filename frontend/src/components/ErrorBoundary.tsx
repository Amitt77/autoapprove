import React from 'react';

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#0d0d0d',
          color: '#e8e8e8', fontFamily: 'monospace', gap: 16, padding: 32,
        }}>
          <div style={{ fontSize: 48 }}>⚠</div>
          <h2 style={{ color: '#f14c4c', letterSpacing: 3, textTransform: 'uppercase' }}>
            Something went wrong
          </h2>
          <pre style={{
            background: '#141414', border: '1px solid #2a2a2a', padding: 16,
            borderRadius: 0, fontSize: 12, color: '#f14c4c', maxWidth: 600,
            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px', background: '#6965DB', color: '#fff',
              border: 'none', cursor: 'pointer', fontFamily: 'monospace',
              fontSize: 12, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
