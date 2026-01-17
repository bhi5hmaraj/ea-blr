/**
 * Migration script - loads DATABASE_URL from Infisical then runs prisma migrate deploy
 */

import { execSync } from 'child_process';
import { InfisicalSDK } from '@infisical/sdk';

async function loadDatabaseUrl(): Promise<string> {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectId = process.env.INFISICAL_PROJECT_ID;
  const environment = process.env.INFISICAL_ENVIRONMENT || 'prod';

  if (!clientId || !clientSecret || !projectId) {
    // Fall back to environment variable
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not found and Infisical not configured');
    }
    return dbUrl;
  }

  console.log(`[Migrate] Loading DATABASE_URL from Infisical (env: ${environment})...`);

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
  });

  await client.auth().universalAuth.login({
    clientId,
    clientSecret
  });

  const secrets = await client.secrets().listSecrets({
    environment,
    projectId
  });

  const dbSecret = secrets.secrets.find(s => s.secretKey === 'DATABASE_URL');
  if (!dbSecret?.secretValue) {
    throw new Error('DATABASE_URL not found in Infisical');
  }

  return dbSecret.secretValue;
}

async function migrate() {
  try {
    const databaseUrl = await loadDatabaseUrl();

    console.log('[Migrate] Running prisma migrate deploy...');

    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      }
    });

    console.log('[Migrate] Migration completed successfully');
  } catch (error) {
    console.error('[Migrate] Migration failed:', error);
    process.exit(1);
  }
}

migrate();
