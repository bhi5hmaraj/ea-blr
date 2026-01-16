import type { StorageAdapter, StorageProvider, UploadPolicy } from './types';
import { VercelBlobStorage } from './vercelBlob';

let cachedStorage: StorageAdapter | null = null;

export function getStorage(policy?: UploadPolicy): StorageAdapter {
  if (cachedStorage) return cachedStorage;

  const provider = (process.env.STORAGE_PROVIDER as StorageProvider | undefined) ?? 'vercel-blob';

  switch (provider) {
    case 'vercel-blob':
    default:
      cachedStorage = new VercelBlobStorage(policy);
      break;
  }

  return cachedStorage;
}
