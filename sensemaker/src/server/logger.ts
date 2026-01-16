import pino from 'pino';
import type { TransportTargetOptions } from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const grafanaToken = process.env.GRAFANA_CLOUD_TOKEN;

// Parse Grafana Cloud token if available
function parseGrafanaToken(token: string): { userId: string; apiKey: string; region: string } | null {
  try {
    // Token format: glc_<base64json>
    const base64 = token.replace(/^glc_/, '');
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
    return {
      userId: decoded.o,
      apiKey: decoded.k,
      region: decoded.m?.r || 'prod-us-central-0',
    };
  } catch {
    return null;
  }
}

// Build transport configuration
function buildTransport(): pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  const targets: TransportTargetOptions[] = [];

  // Always add console output
  if (isDev) {
    // Pretty print in development
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,service,env',
      },
      level: 'debug',
    });
  } else {
    // JSON to stdout in production (for Alloy file collection or Docker)
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
      level: 'info',
    });
  }

  // Add Loki transport if Grafana token is configured
  if (grafanaToken) {
    const grafana = parseGrafanaToken(grafanaToken);
    if (grafana) {
      const lokiHost = `https://logs-${grafana.region}.grafana.net`;
      targets.push({
        target: 'pino-loki',
        options: {
          host: lokiHost,
          basicAuth: {
            username: grafana.userId,
            password: grafana.apiKey,
          },
          labels: {
            service: 'sensemaker',
            env: process.env.NODE_ENV || 'development',
          },
          batching: true,
          interval: 5, // seconds
        },
        level: isDev ? 'debug' : 'info',
      });
      console.log(`[Logger] Loki transport enabled: ${lokiHost}`);
    } else {
      console.warn('[Logger] Invalid GRAFANA_CLOUD_TOKEN format');
    }
  }

  if (targets.length === 1) {
    return targets[0];
  }

  return { targets };
}

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: {
    service: 'sensemaker',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

export const logger = pino({
  ...baseConfig,
  transport: buildTransport(),
});

// Create child loggers for different modules
export function createLogger(module: string) {
  return logger.child({ module });
}

// Pre-built module loggers
export const serverLogger = createLogger('server');
export const kernelLogger = createLogger('kernel');
export const storageLogger = createLogger('storage');
export const apiLogger = createLogger('api');
