import { ApproveRevisionInput } from '@/lib/schema';
import { getActorId } from '@/server/auth';
import { getDeps } from '@/server/deps';
import { readJson } from '@/server/http/body';
import { errorResponse, jsonResponse } from '@/server/http/response';
import { approveRevisionService } from '@/server/services/revisionService';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = ApproveRevisionInput.parse(await readJson(request));
    const actorId = getActorId(request);
    const revision = await approveRevisionService(getDeps(), id, payload, actorId);
    return jsonResponse(revision);
  } catch (error) {
    return errorResponse(error);
  }
}
