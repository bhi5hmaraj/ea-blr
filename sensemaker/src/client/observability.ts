/**
 * Frontend observability with Grafana Faro
 *
 * Sends directly to Grafana Cloud - no local Alloy needed.
 *
 * Collects:
 * - Console logs (info, warn, error)
 * - Uncaught errors and promise rejections
 * - Web Vitals (LCP, FID, CLS, TTFB)
 * - User sessions and page views
 */
import {
  initializeFaro,
  getWebInstrumentations,
  type Faro,
  LogLevel,
} from '@grafana/faro-web-sdk';
import { ReactIntegration } from '@grafana/faro-react';

let faro: Faro | null = null;

export function initFaro(): Faro | null {
  // Skip if already initialized or SSR
  if (faro || typeof window === 'undefined') {
    return faro;
  }

  // Get config from environment
  // For Grafana Cloud direct: https://faro-collector-prod-ap-south-1.grafana.net/collect/<app-key>
  const collectorUrl = import.meta.env.VITE_FARO_COLLECTOR_URL;
  const appName = import.meta.env.VITE_FARO_APP_NAME || 'sensemaker-admin';
  const appVersion = import.meta.env.VITE_FARO_APP_VERSION || '0.1.0';
  const environment = import.meta.env.MODE || 'development';

  // Skip if no collector configured
  if (!collectorUrl) {
    if (import.meta.env.DEV) {
      console.log('[Faro] No collector URL configured (set VITE_FARO_COLLECTOR_URL)');
    }
    return null;
  }

  try {
    faro = initializeFaro({
      url: collectorUrl,
      app: {
        name: appName,
        version: appVersion,
        environment,
      },

      // Collect console logs, errors, and performance
      instrumentations: [
        ...getWebInstrumentations({
          captureConsole: true,
          captureConsoleDisabledLevels: [LogLevel.DEBUG, LogLevel.TRACE],
        }),
        new ReactIntegration(),
      ],

      // Session tracking
      sessionTracking: {
        enabled: true,
        persistent: true,
      },

      // Batching for efficiency
      batching: {
        enabled: true,
        sendTimeout: 1000,
        itemLimit: 50,
      },
    });

    console.log(`[Faro] Initialized - sending to Grafana Cloud`);
    return faro;
  } catch (error) {
    console.error('[Faro] Failed to initialize:', error);
    return null;
  }
}

export function getFaro(): Faro | null {
  return faro;
}

// Re-export useful types and components
export { FaroErrorBoundary, FaroRoutes } from '@grafana/faro-react';
export { faro };
