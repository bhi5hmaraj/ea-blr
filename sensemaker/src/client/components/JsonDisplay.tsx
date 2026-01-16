/**
 * Dynamic JSON display component - renders any JSON structure intelligently.
 * Supports both card view and table view.
 */
import { useState } from 'react';
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import TableRowsIcon from '@mui/icons-material/TableRows';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface JsonDisplayProps {
  data: unknown;
  maxDepth?: number;
  defaultView?: 'cards' | 'table';
}

// Status color mapping
const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'default' | 'info'> = {
  // Success states
  approved: 'success',
  accepted: 'success',
  done: 'success',
  completed: 'success',
  active: 'success',
  published: 'success',
  // Error states
  failed: 'error',
  rejected: 'error',
  error: 'error',
  cancelled: 'error',
  // Warning/Pending states
  pending: 'warning',
  processing: 'warning',
  draft: 'warning',
  review: 'warning',
};

function getStatusColor(value: string): 'success' | 'error' | 'warning' | 'default' | 'info' {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  return STATUS_COLORS[normalized] || 'default';
}

/**
 * Format a camelCase or snake_case key to human-readable
 */
function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .toLowerCase()
    .replace(/^./, s => s.toUpperCase());
}

/**
 * Check if a string is likely a status value
 */
function isStatusValue(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  return normalized in STATUS_COLORS;
}

/**
 * Check if array items are short (suitable for chips) or long (need list)
 */
function areItemsShort(items: string[]): boolean {
  const avgLength = items.reduce((sum, item) => sum + item.length, 0) / items.length;
  const maxLength = Math.max(...items.map(item => item.length));
  return avgLength < 30 && maxLength < 60;
}

/**
 * Render a primitive value
 */
function PrimitiveValue({ value, fieldKey }: { value: JsonValue; fieldKey?: string }) {
  if (value === null || value === undefined) {
    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }

  if (typeof value === 'boolean') {
    return <Chip label={value ? 'Yes' : 'No'} size="small" color={value ? 'success' : 'default'} />;
  }

  if (typeof value === 'number') {
    return <Typography variant="body2">{value.toLocaleString()}</Typography>;
  }

  if (typeof value === 'string') {
    // Status values get colored chips
    if (isStatusValue(value)) {
      return <Chip label={value} size="small" color={getStatusColor(value)} />;
    }

    // URL
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return (
        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
          <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>
        </Typography>
      );
    }

    // Date string
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return <Typography variant="body2">{date.toLocaleDateString()}</Typography>;
        }
      } catch {
        // Not a valid date
      }
    }

    // Long text
    if (value.length > 300) {
      return (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {value}
        </Typography>
      );
    }

    return <Typography variant="body2">{value}</Typography>;
  }

  return <Typography variant="body2">{String(value)}</Typography>;
}

/**
 * Render an array as chips (for short items like tags)
 */
function ChipArray({ items }: { items: string[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {items.map((item, i) => (
        <Chip
          key={i}
          label={item}
          size="small"
          variant="outlined"
          sx={{ height: 'auto', '& .MuiChip-label': { py: 0.5 } }}
        />
      ))}
    </Box>
  );
}

/**
 * Render an array as a bulleted list (for long items like responsibilities)
 */
function BulletList({ items }: { items: string[] }) {
  return (
    <List dense disablePadding sx={{ '& .MuiListItem-root': { py: 0.25, px: 0 } }}>
      {items.map((item, i) => (
        <ListItem key={i} disableGutters>
          <Box
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'text.secondary',
              mr: 1.5,
              mt: 0.75,
              flexShrink: 0,
            }}
          />
          <ListItemText
            primary={item}
            primaryTypographyProps={{ variant: 'body2' }}
          />
        </ListItem>
      ))}
    </List>
  );
}

/**
 * Render an array value - chooses between chips and list based on content
 */
function ArrayValue({ value }: { value: JsonValue[] }) {
  if (value.length === 0) {
    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }

  // Only handle arrays of strings/numbers
  if (!value.every(v => typeof v === 'string' || typeof v === 'number')) {
    return <Typography variant="body2" color="text.secondary">{value.length} items</Typography>;
  }

  const stringItems = value.map(v => String(v));

  // Use chips for short items (tags, etc.), list for long items (responsibilities, etc.)
  if (areItemsShort(stringItems)) {
    return <ChipArray items={stringItems} />;
  }

  return <BulletList items={stringItems} />;
}

/**
 * Table View - renders data as key-value table
 */
function TableView({ data }: { data: Record<string, JsonValue> }) {
  const entries = Object.entries(data);

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key} sx={{ '&:last-child td': { borderBottom: 0 } }}>
              <TableCell
                component="th"
                scope="row"
                sx={{
                  width: 180,
                  fontWeight: 500,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  verticalAlign: 'top',
                  py: 1.5,
                }}
              >
                {formatFieldName(key)}
              </TableCell>
              <TableCell sx={{ py: 1.5 }}>
                {Array.isArray(value) ? (
                  <ArrayValue value={value} />
                ) : typeof value === 'object' && value !== null ? (
                  <Typography variant="body2" color="text.secondary">
                    {Object.keys(value).length} fields
                  </Typography>
                ) : (
                  <PrimitiveValue value={value} fieldKey={key} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Card View - renders data as cards in a grid
 */
function CardView({ data }: { data: Record<string, JsonValue> }) {
  const entries = Object.entries(data);

  // Separate simple fields from array/object fields
  const simpleFields = entries.filter(([, v]) => {
    if (v === null || typeof v !== 'object') return true;
    if (Array.isArray(v)) {
      const stringItems = v.filter(x => typeof x === 'string').map(x => String(x));
      return v.length <= 5 && areItemsShort(stringItems);
    }
    return false;
  });

  const complexFields = entries.filter(([, v]) => {
    if (v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) {
      const stringItems = v.filter(x => typeof x === 'string').map(x => String(x));
      return v.length > 5 || !areItemsShort(stringItems);
    }
    return true;
  });

  return (
    <Stack spacing={2}>
      {/* Simple fields in responsive grid */}
      {simpleFields.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 1.5,
          }}
        >
          {simpleFields.map(([key, value]) => (
            <Paper
              key={key}
              variant="outlined"
              sx={{
                p: 1.5,
                minHeight: 60,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: 'uppercase', fontSize: '0.65rem', mb: 0.5 }}
              >
                {formatFieldName(key)}
              </Typography>
              <Box sx={{ flex: 1 }}>
                {Array.isArray(value) ? (
                  <ArrayValue value={value} />
                ) : (
                  <PrimitiveValue value={value} fieldKey={key} />
                )}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Complex fields (large arrays, nested objects) */}
      {complexFields.map(([key, value]) => (
        <Paper key={key} variant="outlined" sx={{ p: 1.5 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{ textTransform: 'uppercase', fontSize: '0.75rem' }}
          >
            {formatFieldName(key)} {Array.isArray(value) && `(${value.length})`}
          </Typography>
          {Array.isArray(value) ? (
            <ArrayValue value={value} />
          ) : (
            <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(value, null, 2)}
            </pre>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

/**
 * Raw JSON display
 */
export function JsonRawDisplay({ data, label }: { data: unknown; label?: string }) {
  if (!data) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {label && (
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
      )}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', overflow: 'auto', maxHeight: 400 }}>
        <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </Paper>
    </Box>
  );
}

/**
 * Main component with view toggle
 */
export function JsonDisplay({ data, defaultView = 'table' }: JsonDisplayProps) {
  const [view, setView] = useState<'cards' | 'table'>(defaultView);

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return <Typography color="text.secondary">No data</Typography>;
  }

  const dataRecord = data as Record<string, JsonValue>;

  return (
    <Box>
      {/* View toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, newView) => newView && setView(newView)}
          size="small"
        >
          <ToggleButton value="table" aria-label="table view">
            <Tooltip title="Table view">
              <TableRowsIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="cards" aria-label="card view">
            <Tooltip title="Card view">
              <ViewModuleIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Content */}
      {view === 'table' ? (
        <TableView data={dataRecord} />
      ) : (
        <CardView data={dataRecord} />
      )}
    </Box>
  );
}

// For backwards compatibility
export { JsonDisplay as JsonFieldsDisplay };

// Export status color utility for use elsewhere
export { getStatusColor, STATUS_COLORS };
