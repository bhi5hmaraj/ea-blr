import { getDeps } from '@/server/deps';
import { errorResponse, jsonResponse } from '@/server/http/response';
import { getListingService } from '@/server/services/listingService';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listing = await getListingService(getDeps(), id);
    return jsonResponse(listing);
  } catch (error) {
    return errorResponse(error);
  }
}
