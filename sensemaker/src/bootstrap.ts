/**
 * Bootstrap - loads secrets before importing the main server.
 * This is necessary because Prisma validates DATABASE_URL at import time.
 */

import { loadSecretsFromInfisical } from './server/secrets.js';

async function bootstrap() {
  // Load secrets from Infisical first
  await loadSecretsFromInfisical();

  // Now dynamically import the server (after secrets are in process.env)
  await import('./server.js');
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
