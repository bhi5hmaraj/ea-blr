import { useState } from 'react';
import {
  Datagrid,
  DateField,
  FunctionField,
  List,
  SelectInput,
  Show,
  TextField,
  TextInput,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { RevisionStatus } from '@/lib/schema';
import { JsonDisplay, JsonRawDisplay } from './JsonDisplay';

const makeChoices = (options: readonly string[]) =>
  options.map((value) => ({ id: value, name: value }));

const revisionStatusChoices = makeChoices(RevisionStatus.options);

export const revisionFilters = [
  <SelectInput key="status" source="status" choices={revisionStatusChoices} alwaysOn />,
  <TextInput key="listingId" source="listingId" />,
  <TextInput key="observationId" source="observationId" />,
];

export function RevisionList() {
  return (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filterDefaultValues={{ status: 'PENDING' }}
      filters={revisionFilters}
    >
      <Datagrid bulkActionButtons={false} rowClick="show">
        <TextField source="id" />
        <TextField source="status" />
        <TextField source="listingId" />
        <FunctionField
          source="observationId"
          label="Observation"
          render={(record: any) => (
            <MuiLink
              component={Link}
              to={`/observations/${record.observationId}/show`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              {record.observationId}
            </MuiLink>
          )}
        />
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

function RevisionActions() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  if (!record?.id) return null;
  if (record.status !== 'PENDING') {
    return (
      <Chip
        label={record.status}
        color={record.status === 'APPROVED' ? 'success' : 'error'}
        size="small"
      />
    );
  }

  const handleApprove = async () => {
    setLoading('approve');
    try {
      const response = await fetch(`/api/revisions/${record.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Failed to approve');
      }
      notify('Revision approved', { type: 'success' });
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed', { type: 'warning' });
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading('reject');
    try {
      const response = await fetch(`/api/revisions/${record.id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Failed to reject');
      }
      notify('Revision rejected', { type: 'info' });
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed', { type: 'warning' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Stack direction="row" spacing={1}>
      <Button
        variant="contained"
        color="success"
        startIcon={loading === 'approve' ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
        disabled={loading !== null}
        onClick={handleApprove}
      >
        Approve
      </Button>
      <Button
        variant="outlined"
        color="error"
        startIcon={loading === 'reject' ? <CircularProgress size={16} color="inherit" /> : <CloseIcon />}
        disabled={loading !== null}
        onClick={handleReject}
      >
        Reject
      </Button>
    </Stack>
  );
}

function RevisionShowContent() {
  const record = useRecordContext();
  if (!record) return null;

  // Get the best available data (resolved > edited > extracted)
  const displayData = record.resolved || record.edited || record.extracted;
  const title = displayData?.title || 'Untitled';

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={3}>
        {/* Header with actions */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5">{title}</Typography>
            <Typography variant="body2" color="text.secondary">
              Revision {record.id} • Listing {record.listingId}
            </Typography>
          </Box>
          <RevisionActions />
        </Box>

        <Divider />

        {/* Metadata */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label={`Status: ${record.status}`} size="small" />
          <Chip label={`Schema v${record.schemaVersion}`} size="small" variant="outlined" />
          <Chip
            component={Link}
            to={`/observations/${record.observationId}/show`}
            label={`Observation: ${record.observationId}`}
            size="small"
            variant="outlined"
            clickable
            icon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{ cursor: 'pointer' }}
          />
        </Box>

        {/* Dynamic extracted data display */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Extracted Data
          </Typography>
          <JsonDisplay data={displayData} />
        </Box>

        {/* Raw JSON sections */}
        <Divider />
        <Box>
          <Typography variant="h6" gutterBottom>
            Raw JSON
          </Typography>
          <Stack spacing={2}>
            <JsonRawDisplay label="Extracted (from LLM)" data={record.extracted} />
            {record.edited && <JsonRawDisplay label="Edited (human overrides)" data={record.edited} />}
            {record.resolved && <JsonRawDisplay label="Resolved (final merged)" data={record.resolved} />}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export function RevisionShow() {
  return (
    <Show>
      <RevisionShowContent />
    </Show>
  );
}
