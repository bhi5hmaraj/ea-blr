import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { CreateObservationInput, ApproveRevisionInput, ObservationListQuery, RevisionListQuery, ListingListQuery } from './lib/schema';
import { getDeps } from './server/deps';
import { getStorage } from './server/storage';
import { createObservationService, getObservationService, listObservationsService, processObservationService } from './server/services/observationService';
import { listRevisionsService, getRevisionService, approveRevisionService, rejectRevisionService } from './server/services/revisionService';
import { listListingsService, getListingService } from './server/services/listingService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ?? 3001;

// Middleware
app.use(cors({
  exposedHeaders: ['Content-Range'],
}));
app.use(express.json());

// Helper to get actor ID from request
function getActorId(req: express.Request): string | null {
  return (
    req.headers['x-clerk-user-id'] as string ||
    req.headers['x-user-id'] as string ||
    req.headers['x-actor-id'] as string ||
    null
  );
}

// Helper to parse list params from Express request
function parseListParamsExpress(req: express.Request, options: {
  defaultSort: string;
  allowedSort: readonly string[];
  filterKeys: readonly string[];
}) {
  const query = req.query;

  // Parse sort (react-admin sends ["field", "order"])
  let sortField = options.defaultSort;
  let sortOrder: 'asc' | 'desc' = 'desc';

  if (query.sort) {
    try {
      const sortParam = JSON.parse(query.sort as string);
      if (Array.isArray(sortParam) && sortParam.length >= 2) {
        sortField = sortParam[0];
        sortOrder = sortParam[1]?.toLowerCase() === 'asc' ? 'asc' : 'desc';
      }
    } catch {
      sortField = query.sort as string;
      sortOrder = (query.order as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    }
  }

  if (!options.allowedSort.includes(sortField)) {
    sortField = options.defaultSort;
  }

  // Parse range (react-admin sends [start, end])
  let skip = 0;
  let take = 20;

  if (query.range) {
    try {
      const rangeParam = JSON.parse(query.range as string);
      if (Array.isArray(rangeParam) && rangeParam.length >= 2) {
        skip = Math.max(0, Number(rangeParam[0]));
        const end = Math.max(skip, Number(rangeParam[1]));
        take = end - skip + 1;
      }
    } catch {
      // ignore
    }
  }

  // Parse filters (react-admin sends {...filters})
  const filters: Record<string, unknown> = {};
  if (query.filter) {
    try {
      const filterParam = JSON.parse(query.filter as string);
      for (const key of options.filterKeys) {
        if (filterParam[key] !== undefined) {
          filters[key] = filterParam[key];
        }
      }
    } catch {
      // ignore
    }
  }

  // Also check direct query params
  for (const key of options.filterKeys) {
    if (query[key] !== undefined && filters[key] === undefined) {
      filters[key] = query[key];
    }
  }

  return { sortField, sortOrder, skip, take, filters };
}

// Helper for Content-Range header
function buildContentRange(resource: string, start: number, count: number, total: number): string {
  if (count === 0) return `${resource} 0-0/${total}`;
  return `${resource} ${start}-${start + count - 1}/${total}`;
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/api/health', async (req, res) => {
  try {
    const deps = getDeps();
    // Quick DB health check
    await deps.prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'sensemaker',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// OBSERVATIONS
// =============================================================================

app.get('/api/observations', async (req, res) => {
  try {
    const params = parseListParamsExpress(req, {
      defaultSort: 'createdAt',
      allowedSort: ['createdAt', 'capturedAt', 'processingStatus'],
      filterKeys: ['status', 'sourceType', 'createdBy'],
    });

    const { items, total } = await listObservationsService(getDeps(), {
      filters: {
        status: params.filters.status as any,
        sourceType: params.filters.sourceType as any,
        createdBy: params.filters.createdBy as any,
      },
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      skip: params.skip,
      take: params.take,
    });

    res.set('Content-Range', buildContentRange('observations', params.skip, items.length, total));
    res.json(items);
  } catch (error) {
    console.error('GET /api/observations error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

app.post('/api/observations', async (req, res) => {
  try {
    const payload = CreateObservationInput.parse(req.body);
    const actorId = getActorId(req);
    const observation = await createObservationService(getDeps(), payload, actorId);
    res.status(201).json(observation);
  } catch (error) {
    console.error('POST /api/observations error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Bad request' });
  }
});

app.get('/api/observations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const observation = await getObservationService(getDeps(), id);
    res.json(observation);
  } catch (error) {
    console.error('GET /api/observations/:id error:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Observation not found' });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
    }
  }
});

app.post('/api/observations/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const actorId = getActorId(req);
    const result = await processObservationService(getDeps(), id, actorId);
    res.json(result);
  } catch (error) {
    console.error('POST /api/observations/:id/process error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

// =============================================================================
// REVISIONS
// =============================================================================

app.get('/api/revisions', async (req, res) => {
  try {
    const params = parseListParamsExpress(req, {
      defaultSort: 'createdAt',
      allowedSort: ['createdAt', 'status'],
      filterKeys: ['status', 'listingId', 'observationId'],
    });

    const { items, total } = await listRevisionsService(getDeps(), {
      filters: {
        status: params.filters.status as any,
        listingId: params.filters.listingId as any,
        observationId: params.filters.observationId as any,
      },
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      skip: params.skip,
      take: params.take,
    });

    res.set('Content-Range', buildContentRange('revisions', params.skip, items.length, total));
    res.json(items);
  } catch (error) {
    console.error('GET /api/revisions error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

app.get('/api/revisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const revision = await getRevisionService(getDeps(), id);
    res.json(revision);
  } catch (error) {
    console.error('GET /api/revisions/:id error:', error);
    res.status(404).json({ error: error instanceof Error ? error.message : 'Not found' });
  }
});

app.post('/api/revisions/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = ApproveRevisionInput.parse(req.body);
    const actorId = getActorId(req);
    const revision = await approveRevisionService(getDeps(), id, payload, actorId);
    res.json(revision);
  } catch (error) {
    console.error('POST /api/revisions/:id/approve error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Bad request' });
  }
});

app.post('/api/revisions/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body as { notes?: string };
    const actorId = getActorId(req);
    const revision = await rejectRevisionService(getDeps(), id, notes, actorId);
    res.json(revision);
  } catch (error) {
    console.error('POST /api/revisions/:id/reject error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Bad request' });
  }
});

// =============================================================================
// LISTINGS
// =============================================================================

app.get('/api/listings', async (req, res) => {
  try {
    const params = parseListParamsExpress(req, {
      defaultSort: 'createdAt',
      allowedSort: ['createdAt', 'updatedAt', 'orgName', 'title'],
      filterKeys: ['kind', 'orgName'],
    });

    const { items, total } = await listListingsService(getDeps(), {
      filters: {
        kind: params.filters.kind as any,
        orgName: params.filters.orgName as any,
      },
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      skip: params.skip,
      take: params.take,
    });

    res.set('Content-Range', buildContentRange('listings', params.skip, items.length, total));
    res.json(items);
  } catch (error) {
    console.error('GET /api/listings error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

app.get('/api/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await getListingService(getDeps(), id);
    res.json(listing);
  } catch (error) {
    console.error('GET /api/listings/:id error:', error);
    res.status(404).json({ error: error instanceof Error ? error.message : 'Not found' });
  }
});

// =============================================================================
// UPLOADS (Vercel Blob / Local)
// =============================================================================

app.post('/api/uploads', async (req, res) => {
  try {
    const storage = getStorage();
    // Convert Express request to Web Request for the storage adapter
    const webRequest = new Request(`http://localhost${req.url}`, {
      method: 'POST',
      headers: req.headers as HeadersInit,
      body: JSON.stringify(req.body),
    });
    const response = await storage.handleUpload(webRequest);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('POST /api/uploads error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
});

// =============================================================================
// LOCAL STORAGE FILE SERVING
// =============================================================================

const localStorageDir = process.env.LOCAL_STORAGE_DIR || '/tmp/sensemaker';
app.use('/storage', express.static(localStorageDir, {
  setHeaders: (res, filePath) => {
    // Set appropriate content-type based on extension
    if (filePath.endsWith('.md')) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    } else if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
  },
}));

// =============================================================================
// STATIC FILES (Production - Non-Vercel)
// =============================================================================

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // In Docker/Cloud Run, public/ is at the same level as dist/
  const clientPath = path.resolve(__dirname, '../public');
  app.use(express.static(clientPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/storage')) {
      res.sendFile(path.join(clientPath, 'index.html'));
    }
  });
}

// =============================================================================
// START SERVER (Local/Standalone only)
// =============================================================================

function startServer(port: number, maxAttempts = 10): void {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`API available at http://localhost:${port}/api`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Frontend dev server should run on http://localhost:5173`);
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && maxAttempts > 1) {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1, maxAttempts - 1);
    } else {
      console.error(`Failed to start server:`, err.message);
      process.exit(1);
    }
  });
}

// Start the server
startServer(Number(PORT));

// Export for testing
export default app;
