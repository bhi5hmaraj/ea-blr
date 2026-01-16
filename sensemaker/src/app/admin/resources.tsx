'use client';

import {
  Datagrid,
  DateField,
  FunctionField,
  List,
  NumberField,
  SelectInput,
  TextField,
  TextInput,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { upload } from '@vercel/blob/client';
import {
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import {
  CreateObservationInput,
  ListingKind,
  ObservationSource,
  ProcessingStatus,
  RevisionStatus,
} from '@/lib/schema';

type IntakeKind = 'text' | 'url' | 'file';

type Choice = { id: string; name: string };
const makeChoices = (options: readonly string[]): Choice[] =>
  options.map((value) => ({ id: value, name: value }));

const sourceChoices = makeChoices(ObservationSource.options);
const statusChoices = makeChoices(ProcessingStatus.options);
const revisionStatusChoices = makeChoices(RevisionStatus.options);
const listingKindChoices = makeChoices(ListingKind.options);

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
      {loading ? 'Processing…' : 'Process'}
    </Button>
  );
}

export function ObservationList() {
  return (
    <List sort={{ field: 'createdAt', order: 'DESC' }} filters={observationFilters}>
      <Datagrid bulkActionButtons={false}>
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
      payload = { ...base, kind: 'text', text: textValue };
    } else if (kind === 'url') {
      payload = { ...base, kind: 'url', url: urlValue };
    } else {
      if (!fileInfo) {
        notify('Upload a file first', { type: 'warning' });
        return;
      }
      payload = { ...base, kind: 'file', ...fileInfo };
    }

    CreateObservationInput.parse(payload);
    await createObservation(payload);

    notify('Observation created', { type: 'info' });
    refresh();

    setTextValue('');
    setUrlValue('');
    setFileInfo(null);
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

        {kind === 'text' ? (
          <MuiTextField
            label="Paste text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            multiline
            minRows={8}
            fullWidth
          />
        ) : null}

        {kind === 'url' ? (
          <MuiTextField
            label="URL"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            fullWidth
            placeholder="https://…"
            helperText="On Process, we fetch the page and store it as markdown."
          />
        ) : null}

        {kind === 'file' ? (
          <Box>
            <Button component="label" variant="outlined" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Choose file'}
              <input type="file" accept="application/pdf,image/*" hidden onChange={handleUpload} />
            </Button>
            {fileInfo ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">{fileInfo.filename}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {fileInfo.contentType} • {fileInfo.sizeBytes} bytes
                </Typography>
              </Box>
            ) : null}
          </Box>
        ) : null}

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              submit().catch((error) =>
                notify(error instanceof Error ? error.message : 'Failed', { type: 'warning' })
              );
            }}
          >
            Create observation
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export function RevisionList() {
  return (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filterDefaultValues={{ status: 'PENDING' }}
      filters={revisionFilters}
    >
      <Datagrid bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="status" />
        <TextField source="listingId" />
        <TextField source="observationId" />
        <DateField source="createdAt" showTime />
        <FunctionField
          label="Title"
          render={(record: any) =>
            record?.resolved?.title || record?.edited?.title || record?.extracted?.title
          }
        />
      </Datagrid>
    </List>
  );
}

export function ListingList() {
  return (
    <List sort={{ field: 'updatedAt', order: 'DESC' }} filters={listingFilters}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="kind" />
        <TextField source="title" />
        <TextField source="orgName" />
        <TextField source="selectedRevisionId" />
        <DateField source="updatedAt" showTime />
      </Datagrid>
    </List>
  );
}

export const observationFilters = [
  <SelectInput key="status" source="status" choices={statusChoices} alwaysOn />,
  <SelectInput key="sourceType" source="sourceType" choices={sourceChoices} />,
];

export const revisionFilters = [
  <SelectInput key="status" source="status" choices={revisionStatusChoices} alwaysOn />,
  <TextInput key="listingId" source="listingId" />,
  <TextInput key="observationId" source="observationId" />,
];

export const listingFilters = [
  <TextInput key="orgName" source="orgName" alwaysOn />,
  <SelectInput key="kind" source="kind" choices={listingKindChoices} />,
];
