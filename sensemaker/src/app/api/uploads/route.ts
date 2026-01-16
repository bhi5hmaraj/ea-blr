import { errorResponse } from '@/server/http/response';
import { getStorage } from '@/server/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const storage = getStorage();
    return await storage.handleUpload(request);
  } catch (error) {
    return errorResponse(error);
  }
}
