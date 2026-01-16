import { HttpError } from './errors';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function mergeHeaders(base?: HeadersInit, extra?: HeadersInit): Headers {
  const headers = new Headers(base ?? {});
  if (extra) {
    const incoming = new Headers(extra);
    incoming.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function jsonResponse(
  data: JsonValue | unknown,
  init?: ResponseInit & { headers?: HeadersInit }
): Response {
  const headers = mergeHeaders(init?.headers, { 'content-type': 'application/json' });
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      { error: error.message, code: error.code, details: error.details ?? null },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  return jsonResponse({ error: message, code: 'internal_error' }, { status: 500 });
}
