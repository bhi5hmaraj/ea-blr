import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { StorageAdapter, StoredObject, UploadPolicy } from './types';

const DEFAULT_POLICY: UploadPolicy = {
  allowedContentTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/markdown'],
  maximumSizeBytes: 10 * 1024 * 1024,
};

// Base directory for local storage
const BASE_DIR = process.env.LOCAL_STORAGE_DIR || '/tmp/sensemaker';

// Generate a date-based subdirectory
function getDateDir(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export class LocalFileStorage implements StorageAdapter {
  constructor(private readonly policy: UploadPolicy = DEFAULT_POLICY) {}

  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  private getStorageDir(): string {
    return path.join(BASE_DIR, getDateDir());
  }

  async handleUpload(request: Request): Promise<Response> {
    try {
      const body = await request.json() as {
        type: 'blob.generate-client-token';
        payload: {
          pathname: string;
          callbackUrl: string;
          clientPayload?: string;
        };
      };

      if (body.type === 'blob.generate-client-token') {
        // For local storage, we'll return a simple upload URL
        // The client will POST the file to this URL
        const uploadId = randomBytes(8).toString('hex');
        const uploadUrl = `/api/uploads/local/${uploadId}`;

        return new Response(JSON.stringify({
          type: 'blob.generate-client-token',
          clientToken: JSON.stringify({
            uploadId,
            pathname: body.payload.pathname,
          }),
          uploadUrl,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown upload type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Upload failed'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  async putText(params: {
    content: string;
    pathnamePrefix: string;
    contentType: string;
  }): Promise<StoredObject> {
    const storageDir = this.getStorageDir();
    await this.ensureDir(storageDir);

    const suffix = randomBytes(6).toString('hex');
    const filename = `${Date.now()}-${suffix}.md`;
    const pathname = `${params.pathnamePrefix}/${filename}`;
    const fullPath = path.join(storageDir, params.pathnamePrefix);

    await this.ensureDir(fullPath);

    const filePath = path.join(fullPath, filename);
    await writeFile(filePath, params.content, 'utf8');

    const size = Buffer.byteLength(params.content, 'utf8');
    const dateDir = getDateDir();

    // Return a URL that can be served by Express
    const url = `/storage/${dateDir}/${pathname}`;

    console.log(`[LocalFileStorage] Stored: ${filePath} -> ${url}`);

    return {
      url,
      pathname,
      size,
      contentType: params.contentType,
    };
  }

  // Store a file from buffer (for direct uploads)
  async putFile(params: {
    content: Buffer;
    pathname: string;
    contentType: string;
  }): Promise<StoredObject> {
    const storageDir = this.getStorageDir();
    const fullDir = path.join(storageDir, path.dirname(params.pathname));
    await this.ensureDir(fullDir);

    const filePath = path.join(storageDir, params.pathname);
    await writeFile(filePath, params.content);

    const dateDir = getDateDir();
    const url = `/storage/${dateDir}/${params.pathname}`;

    console.log(`[LocalFileStorage] Stored file: ${filePath} -> ${url}`);

    return {
      url,
      pathname: params.pathname,
      size: params.content.length,
      contentType: params.contentType,
    };
  }

  // Read a file by its storage path
  async getFile(storagePath: string): Promise<Buffer | null> {
    // storagePath format: /storage/YYYY-MM-DD/prefix/filename
    const match = storagePath.match(/^\/storage\/(\d{4}-\d{2}-\d{2})\/(.+)$/);
    if (!match) return null;

    const [, dateDir, relativePath] = match;
    const filePath = path.join(BASE_DIR, dateDir, relativePath);

    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  // Get the base directory for serving static files
  static getBaseDir(): string {
    return BASE_DIR;
  }
}
