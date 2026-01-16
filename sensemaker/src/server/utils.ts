export function cleanUndefined<T extends Record<string, unknown>>(input: T): T {
  const output = { ...input };
  for (const key of Object.keys(output)) {
    if (output[key] === undefined) {
      delete output[key];
    }
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeJson(base: Record<string, unknown>, overlay?: Record<string, unknown>): Record<string, unknown> {
  if (!overlay) return base;
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = mergeJson(existing, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
