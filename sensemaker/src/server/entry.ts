/**
 * Server entry point - loads environment variables before anything else.
 *
 * ES modules hoist imports, so we use dynamic import to ensure dotenv
 * runs before any other modules are loaded.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory of this file to resolve .env paths correctly
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

// Load env files FIRST (order matters: .env.local overrides .env)
config({ path: path.join(rootDir, '.env') });
config({ path: path.join(rootDir, '.env.local'), override: true });

// Now import logger (after env vars are loaded)
import { serverLogger } from './logger.js';

const hasLLM = process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY;
const hasGrafana = !!process.env.GRAFANA_CLOUD_TOKEN;

serverLogger.info({
  llm: hasLLM ? 'configured' : 'not configured (will use mock)',
  grafana: hasGrafana ? 'enabled' : 'disabled',
  nodeEnv: process.env.NODE_ENV || 'development',
}, 'Environment loaded');

// Now dynamically import the server (after env vars are loaded)
import('../index.js');
