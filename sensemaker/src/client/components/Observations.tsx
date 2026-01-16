import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Datagrid,
  DateField,
  List,
  NumberField,
  SelectInput,
  Show,
  TextField,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import { Link } from 'react-router-dom';
import { upload } from '@vercel/blob/client';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Link as MuiLink,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { CreateObservationInput, ObservationSource, ProcessingStatus } from '@/lib/schema';
import { JsonRawDisplay } from './JsonDisplay';

type IntakeKind = 'text' | 'url' | 'file';

const makeChoices = (options: readonly string[]) =>
  options.map((value) => ({ id: value, name: value }));

const sourceChoices = makeChoices(ObservationSource.options);
const statusChoices = makeChoices(ProcessingStatus.options);

function ProcessButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [loading, setLoading] = useState(false);

  if (!record?.id) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/observations/${record.id}/process`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Failed to process observation');
      }
      notify('Processing kicked off', { type: 'info' });
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to process', { type: 'warning' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="small" variant="outlined" disabled={loading} onClick={handleClick}>
      {loading ? 'Processing...' : 'Process'}
    </Button>
  );
}

export const observationFilters = [
  <SelectInput key="status" source="status" choices={statusChoices} alwaysOn />,
  <SelectInput key="sourceType" source="sourceType" choices={sourceChoices} />,
];

export function ObservationList() {
  return (
    <List sort={{ field: 'createdAt', order: 'DESC' }} filters={observationFilters}>
      <Datagrid bulkActionButtons={false} rowClick="show">
        <TextField source="id" />
        <TextField source="sourceType" />
        <TextField source="rawFormat" />
        <TextField source="processingStatus" />
        <NumberField source="processingAttempts" />
        <DateField source="createdAt" showTime />
        <ProcessButton />
      </Datagrid>
    </List>
  );
}

export function ObservationCreate() {
  const notify = useNotify();
  const refresh = useRefresh();

  const [kind, setKind] = useState<IntakeKind>('text');
  const [textValue, setTextValue] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    fileUrl: string;
    contentType: string;
    filename?: string;
    sizeBytes?: number;
  } | null>(null);

  const createObservation = async (payload: unknown) => {
    const response = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? 'Failed to create observation');
    }

    return response.json();
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      notify('Only PDFs and images are supported', { type: 'warning' });
      return;
    }

    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/uploads',
      });

      setFileInfo({
        fileUrl: blob.url,
        contentType: blob.contentType,
        filename: file.name,
        sizeBytes: file.size,
      });
      notify('Uploaded', { type: 'info' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Upload failed', { type: 'warning' });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const base = { sourceType: 'MANUAL' as const };

    let payload: unknown;
    if (kind === 'text') {
      if (!textValue.trim()) {
        notify('Please enter some text', { type: 'warning' });
        return;
      }
      payload = { ...base, kind: 'text', text: textValue };
    } else if (kind === 'url') {
      if (!urlValue.trim()) {
        notify('Please enter a URL', { type: 'warning' });
        return;
      }
      payload = { ...base, kind: 'url', url: urlValue };
    } else {
      if (!fileInfo) {
        notify('Upload a file first', { type: 'warning' });
        return;
      }
      payload = { ...base, kind: 'file', ...fileInfo };
    }

    setSubmitting(true);
    try {
      CreateObservationInput.parse(payload);
      await createObservation(payload);

      notify('Observation created successfully!', { type: 'success' });
      refresh();

      setTextValue('');
      setUrlValue('');
      setFileInfo(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2} sx={{ maxWidth: 860 }}>
        <Box>
          <Typography variant="h6">New observation</Typography>
          <Typography variant="body2" color="text.secondary">
            Choose one input type. Plaintext is stored to blob as markdown immediately. URLs are fetched on Process.
          </Typography>
        </Box>

        <RadioGroup row value={kind} onChange={(_e, v) => setKind(v as IntakeKind)}>
          <FormControlLabel value="text" control={<Radio />} label="Plaintext" />
          <FormControlLabel value="url" control={<Radio />} label="URL" />
          <FormControlLabel value="file" control={<Radio />} label="PDF / Image" />
        </RadioGroup>

        {kind === 'text' && (
          <MuiTextField
            label="Paste text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            multiline
            minRows={8}
            fullWidth
          />
        )}

        {kind === 'url' && (
          <MuiTextField
            label="URL"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            fullWidth
            placeholder="https://..."
            helperText="On Process, we fetch the page and store it as markdown."
          />
        )}

        {kind === 'file' && (
          <Box>
            <Button component="label" variant="outlined" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Choose file'}
              <input type="file" accept="application/pdf,image/*" hidden onChange={handleUpload} />
            </Button>
            {fileInfo && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">{fileInfo.filename}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {fileInfo.contentType} - {fileInfo.sizeBytes} bytes
                </Typography>
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="contained"
            disabled={submitting || uploading}
            onClick={() => {
              submit().catch((error) =>
                notify(error instanceof Error ? error.message : 'Failed', { type: 'warning' })
              );
            }}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitting ? 'Creating...' : 'Create observation'}
          </Button>
          {submitting && (
            <Typography variant="body2" color="text.secondary">
              Saving observation...
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  PENDING: 'warning',
  PROCESSING: 'warning',
  PROCESSED: 'success',
  FAILED: 'error',
};

function ObservationShowContent() {
  const record = useRecordContext();
  if (!record) return null;

  const statusColor = STATUS_COLORS[record.processingStatus] || 'default';

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5">Observation {record.id}</Typography>
            <Typography variant="body2" color="text.secondary">
              Created {new Date(record.createdAt).toLocaleString()}
            </Typography>
          </Box>
          <ProcessButton />
        </Box>

        <Divider />

        {/* Status & Metadata */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label={record.processingStatus} color={statusColor} size="small" />
          <Chip label={record.sourceType} size="small" variant="outlined" />
          <Chip label={record.rawFormat} size="small" variant="outlined" />
          {record.processingAttempts > 0 && (
            <Chip label={`${record.processingAttempts} attempts`} size="small" variant="outlined" />
          )}
        </Box>

        {/* Source Reference */}
        {record.sourceRef && (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Source Reference
            </Typography>
            {record.sourceRef.startsWith('http') ? (
              <MuiLink href={record.sourceRef} target="_blank" rel="noopener noreferrer">
                {record.sourceRef}
              </MuiLink>
            ) : (
              <Typography variant="body2">{record.sourceRef}</Typography>
            )}
          </Box>
        )}

        {/* Raw Text Preview */}
        {record.rawText && (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Raw Text
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
              <Typography
                variant="body2"
                component="pre"
                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0, fontFamily: 'monospace' }}
              >
                {record.rawText}
              </Typography>
            </Paper>
          </Box>
        )}

        {/* Blob Reference */}
        {record.rawBlobRef && (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Blob Reference
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {record.rawBlobRef}
            </Typography>
          </Box>
        )}

        {/* Last Error */}
        {record.lastError && (
          <Box>
            <Typography variant="subtitle2" color="error" gutterBottom>
              Last Error
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'error.50', borderColor: 'error.200' }}>
              <Typography variant="body2" color="error.main" sx={{ fontFamily: 'monospace' }}>
                {record.lastError}
              </Typography>
            </Paper>
          </Box>
        )}

        {/* Raw Metadata */}
        {record.rawMeta && (
          <JsonRawDisplay label="Raw Metadata" data={record.rawMeta} />
        )}

        {/* Revisions Link */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Derived Revisions
          </Typography>
          <Chip
            component={Link}
            to={`/revisions?filter=${encodeURIComponent(JSON.stringify({ observationId: record.id }))}`}
            label="View Revisions"
            size="small"
            clickable
            icon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{ cursor: 'pointer' }}
          />
        </Box>
      </Stack>
    </Box>
  );
}

export function ObservationShow() {
  return (
    <Show>
      <ObservationShowContent />
    </Show>
  );
}
