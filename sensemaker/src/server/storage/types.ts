export interface UploadPolicy {
  allowedContentTypes: string[];
  maximumSizeBytes: number;
}

export interface StoredObject {
  url: string;
  pathname: string;
  size: number;
  contentType?: string | null;
}

export interface StorageAdapter {
  handleUpload(request: Request): Promise<Response>;
  putText(params: { content: string; pathnamePrefix: string; contentType: string }): Promise<StoredObject>;
}

export type StorageProvider = 'vercel-blob' | 'local';
