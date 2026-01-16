import type { StorageAdapter, StorageProvider, UploadPolicy } from './types';
import { VercelBlobStorage } from './vercelBlob';
import { LocalFileStorage } from './localFileStorage';

let cachedStorage: StorageAdapter | null = null;

export function getStorage(policy?: UploadPolicy): StorageAdapter {
  if (cachedStorage) return cachedStorage;

  const isDev = process.env.NODE_ENV !== 'production';
  const defaultProvider: StorageProvider = isDev ? 'local' : 'vercel-blob';
  const provider = (process.env.STORAGE_PROVIDER as StorageProvider | undefined) ?? defaultProvider;

  switch (provider) {
    case 'local':
      console.log('[Storage] Using LocalFileStorage');
      cachedStorage = new LocalFileStorage(policy);
      break;
    case 'vercel-blob':
    default:
      console.log('[Storage] Using VercelBlobStorage');
      cachedStorage = new VercelBlobStorage(policy);
      break;
  }

  return cachedStorage;
}

export { LocalFileStorage } from './localFileStorage';
