import { ListingListQuery } from '@/lib/schema';
import { getDeps } from '@/server/deps';
import { buildContentRange, computeRange, parseListParams } from '@/server/http/list';
import { errorResponse, jsonResponse } from '@/server/http/response';
import { listListingsService } from '@/server/services/listingService';

export const runtime = 'nodejs';

const ListingFilters = ListingListQuery.omit({
  page: true,
  pageSize: true,
  sort: true,
  order: true,
});

export async function GET(request: Request) {
  try {
    const params = parseListParams(request, ListingFilters, {
      defaultSort: 'createdAt',
      allowedSort: ['createdAt', 'updatedAt', 'orgName', 'title'],
      filterKeys: ['kind', 'orgName'],
    });

    const { items, total } = await listListingsService(getDeps(), {
      filters: {
        kind: params.filters.kind,
        orgName: params.filters.orgName,
      },
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      skip: params.skip,
      take: params.take,
    });

    const range = computeRange(params.skip, items.length);
    const headers = new Headers({
      'Content-Range': buildContentRange('listings', range.start, range.end, total),
      'Access-Control-Expose-Headers': 'Content-Range',
    });

    return jsonResponse(items, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
