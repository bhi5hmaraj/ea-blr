import { CreateObservationInput, ObservationListQuery } from '@/lib/schema';
import { getActorId } from '@/server/auth';
import { getDeps } from '@/server/deps';
import { readJson } from '@/server/http/body';
import { errorResponse, jsonResponse } from '@/server/http/response';
import { buildContentRange, computeRange, parseListParams } from '@/server/http/list';
import { createObservationService, listObservationsService } from '@/server/services/observationService';

export const runtime = 'nodejs';

const ObservationFilters = ObservationListQuery.omit({
  page: true,
  pageSize: true,
  sort: true,
  order: true,
});

export async function POST(request: Request) {
  try {
    const payload = CreateObservationInput.parse(await readJson(request));
    const actorId = getActorId(request);
    const observation = await createObservationService(getDeps(), payload, actorId);
    return jsonResponse(observation, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const params = parseListParams(request, ObservationFilters, {
      defaultSort: 'createdAt',
      allowedSort: ['createdAt', 'capturedAt', 'processingStatus'],
      filterKeys: ['status', 'sourceType', 'createdBy'],
    });

    const { items, total } = await listObservationsService(getDeps(), {
      filters: {
        status: params.filters.status,
        sourceType: params.filters.sourceType,
        createdBy: params.filters.createdBy,
      },
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      skip: params.skip,
      take: params.take,
    });

    const range = computeRange(params.skip, items.length);
    const headers = new Headers({
      'Content-Range': buildContentRange('observations', range.start, range.end, total),
      'Access-Control-Expose-Headers': 'Content-Range',
    });

    return jsonResponse(items, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
