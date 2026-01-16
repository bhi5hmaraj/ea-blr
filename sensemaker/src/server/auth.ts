export function getActorId(request: Request): string | null {
  return (
    request.headers.get('x-clerk-user-id') ||
    request.headers.get('x-user-id') ||
    request.headers.get('x-actor-id') ||
    null
  );
}
