import { createHash } from 'crypto';

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

export function deriveSourceRef(input: {
  sourceRef?: string | null;
  rawBlobRef?: string | null;
  rawText?: string | null;
}): string | null {
  if (input.sourceRef) return input.sourceRef;
  if (input.rawBlobRef) return input.rawBlobRef;
  if (input.rawText) {
    const url = extractFirstUrl(input.rawText);
    if (url) return url;
  }
  return null;
}

export function computeContentHash(input: {
  rawText?: string | null;
  rawBlobRef?: string | null;
  sourceRef?: string | null;
}): string | null {
  const rawText = input.rawText ?? '';
  const rawBlobRef = input.rawBlobRef ?? '';
  const sourceRef = input.sourceRef ?? '';
  if (!rawText && !rawBlobRef && !sourceRef) return null;
  const payload = `${rawText}
---
${rawBlobRef}
---
${sourceRef}`;
  return createHash('sha256').update(payload).digest('hex');
}
