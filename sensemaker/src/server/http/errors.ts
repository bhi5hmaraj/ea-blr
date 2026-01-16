export class HttpError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, 'bad_request', details);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message, 'not_found');
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message, 'conflict');
}

export function notImplemented(message: string): HttpError {
  return new HttpError(501, message, 'not_implemented');
}

export function internalError(message: string, details?: unknown): HttpError {
  return new HttpError(500, message, 'internal_error', details);
}
