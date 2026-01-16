import { RevisionListQuery } from '@/lib/schema';
import { getDeps } from '@/server/deps';
import { buildContentRange, computeRange, parseListParams } from '@/server/http/list';
import { errorResponse, jsonResponse } from '@/server/http/response';
import { listRevisionsService } from '@/server/services/revisionService';

export const runtime = 'nodejs';

const RevisionFilters = RevisionListQuery.omit({
  page: true,
  pageSize: true,
  sort: true,
  order: true,
});

export async function GET(request: Request) {
  try {
    const params = parseListParams(request, RevisionFilters, {
      defaultSort: 'createdAt',
      allowedSort: ['createdAt', 'status'],
      filterKeys: ['status', 'listingId', 'observationId'],
    });

    const { items, total } = await listRevisionsService(getDeps(), {
      filters: {
        status: params.filters.status,
        listingId: params.filters.listingId,
        observationId: params.filters.observationId,
      },
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      skip: params.skip,
      take: params.take,
    });

    const range = computeRange(params.skip, items.length);
    const headers = new Headers({
      'Content-Range': buildContentRange('revisions', range.start, range.end, total),
      'Access-Control-Expose-Headers': 'Content-Range',
    });

    return jsonResponse(items, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
