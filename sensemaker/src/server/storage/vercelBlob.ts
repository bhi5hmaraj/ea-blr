import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { StorageAdapter, StoredObject, UploadPolicy } from './types';
import { randomBytes } from 'crypto';

const DEFAULT_POLICY: UploadPolicy = {
  allowedContentTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/markdown'],
  maximumSizeBytes: 10 * 1024 * 1024,
};

export class VercelBlobStorage implements StorageAdapter {
  constructor(private readonly policy: UploadPolicy = DEFAULT_POLICY) {}

  async handleUpload(request: Request): Promise<Response> {
    const body = (await request.json()) as HandleUploadBody;

    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: this.policy.allowedContentTypes,
          maximumSize: this.policy.maximumSizeBytes,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        return;
      },
    });

    return NextResponse.json(response);
  }

  async putText(params: {
    content: string;
    pathnamePrefix: string;
    contentType: string;
  }): Promise<StoredObject> {
    const suffix = randomBytes(6).toString('hex');
    const pathname = `${params.pathnamePrefix}/${Date.now()}-${suffix}.md`;
    const blob = await put(pathname, params.content, {
      access: 'public',
      contentType: params.contentType,
    });

    // Calculate size from content since PutBlobResult doesn't include it
    const size = Buffer.byteLength(params.content, 'utf8');

    return {
      url: blob.url,
      pathname: blob.pathname,
      size,
      contentType: blob.contentType,
    };
  }
}
