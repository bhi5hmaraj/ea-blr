import { getActorId } from '@/server/auth';
import { getDeps } from '@/server/deps';
import { errorResponse, jsonResponse } from '@/server/http/response';
import { processObservationService } from '@/server/services/observationService';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actorId = getActorId(request);
    const result = await processObservationService(getDeps(), id, actorId);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
