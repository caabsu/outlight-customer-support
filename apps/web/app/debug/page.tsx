export default function DebugPage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Debug Info</h1>
      <p>App is running!</p>
      <p>Environment: {process.env.NODE_ENV}</p>
      <p>Time: {new Date().toISOString()}</p>
    </div>
  );
}
