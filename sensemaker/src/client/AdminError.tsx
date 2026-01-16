import { Button } from '@mui/material';

type AdminErrorProps = {
  error?: unknown;
  errorInfo?: unknown;
  title?: string;
  resetErrorBoundary?: (args?: any) => void;
};

function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function AdminError(props: AdminErrorProps) {
  const message = getErrorMessage(props.error);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: 0 }}>Application error</h2>
      <p style={{ marginTop: 8, color: '#444' }}>{props.title ?? 'Sensemaker Admin'}</p>
      <pre
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(0,0,0,0.04)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message}
      </pre>
      {props.resetErrorBoundary ? (
        <div style={{ marginTop: 16 }}>
          <Button variant="contained" onClick={() => props.resetErrorBoundary?.()}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}
