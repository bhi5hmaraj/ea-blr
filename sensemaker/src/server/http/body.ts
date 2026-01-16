import { badRequest } from './errors';

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest('Invalid JSON payload');
  }
}
