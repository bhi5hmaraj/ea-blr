import simpleRestProvider from 'ra-data-simple-rest';
import { fetchUtils } from 'react-admin';

function getApiUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}

export function createDataProvider() {
  const httpClient = (url: string, options: fetchUtils.Options = {}) => {
    const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers ?? {});
    headers.set('Accept', 'application/json');

    return fetchUtils.fetchJson(url, { ...options, headers });
  };

  return simpleRestProvider(getApiUrl(), httpClient);
}
