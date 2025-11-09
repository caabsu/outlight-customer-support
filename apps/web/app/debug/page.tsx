'use client';

import { useState } from 'react';

export default function DebugPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const handleResync = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch('/api/gmail/resync-all', {
        method: 'POST',
      });

      const data = await response.json();
      setSyncResult(data);
    } catch (error: any) {
      setSyncResult({ error: error.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui', maxWidth: '800px' }}>
      <h1 style={{ marginBottom: '30px' }}>Debug & Admin Tools</h1>

      <div style={{ marginBottom: '30px' }}>
        <p style={{ color: '#666', marginBottom: '5px' }}>App is running!</p>
        <p style={{ color: '#666', marginBottom: '5px' }}>Environment: {process.env.NODE_ENV}</p>
        <p style={{ color: '#666' }}>Time: {new Date().toISOString()}</p>
      </div>

      <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #ddd' }} />

      <div>
        <h2 style={{ marginBottom: '15px' }}>Email Re-sync</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Re-sync all emails from Gmail for all workspaces. This will fetch the latest emails
          and correctly apply tags (excluding drafts).
        </p>

        <button
          onClick={handleResync}
          disabled={syncing}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            backgroundColor: syncing ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: syncing ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!syncing) {
              e.currentTarget.style.backgroundColor = '#0051cc';
            }
          }}
          onMouseLeave={(e) => {
            if (!syncing) {
              e.currentTarget.style.backgroundColor = '#0070f3';
            }
          }}
        >
          {syncing ? 'Re-syncing all workspaces...' : 'Re-sync All Emails'}
        </button>

        {syncResult && (
          <div
            style={{
              marginTop: '20px',
              padding: '20px',
              backgroundColor: syncResult.error ? '#fee' : '#efe',
              border: `1px solid ${syncResult.error ? '#fcc' : '#cfc'}`,
              borderRadius: '6px',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '10px' }}>
              {syncResult.error ? 'Error' : 'Re-sync Complete'}
            </h3>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                fontSize: '14px',
                margin: 0,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(syncResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
