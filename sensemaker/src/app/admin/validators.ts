'use client';

import type { ZodType } from 'zod';

export type ValidationErrors = Record<string, string>;

function appendError(errors: ValidationErrors, key: string, message: string) {
  if (!errors[key]) {
    errors[key] = message;
  }
}

export function zodValidate<T>(
  schema: ZodType<T>,
  options?: { rootFields?: string[] }
) {
  return (values: unknown): ValidationErrors => {
    const result = schema.safeParse(values);
    if (result.success) {
      return {};
    }

    const errors: ValidationErrors = {};

    for (const issue of result.error.issues) {
      if (issue.path.length > 0) {
        const key = String(issue.path[0]);
        appendError(errors, key, issue.message);
      } else if (options?.rootFields?.length) {
        for (const field of options.rootFields) {
          appendError(errors, field, issue.message);
        }
      } else {
        appendError(errors, '_error', issue.message);
      }
    }

    return errors;
  };
}
