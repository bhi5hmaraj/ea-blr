/**
 * Infisical SDK integration for loading secrets at runtime.
 *
 * Required environment variables:
 * - INFISICAL_CLIENT_ID: Machine identity client ID
 * - INFISICAL_CLIENT_SECRET: Machine identity client secret
 * - INFISICAL_PROJECT_ID: Project ID
 * - INFISICAL_ENVIRONMENT: Environment (default: "dev")
 */

import { InfisicalSDK } from '@infisical/sdk';

interface SecretConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: string;
}

function getConfig(): SecretConfig | null {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectId = process.env.INFISICAL_PROJECT_ID;
  const environment = process.env.INFISICAL_ENVIRONMENT || 'dev';

  if (!clientId || !clientSecret || !projectId) {
    return null;
  }

  return { clientId, clientSecret, projectId, environment };
}

export async function loadSecretsFromInfisical(): Promise<boolean> {
  const config = getConfig();

  if (!config) {
    console.log('[Secrets] Infisical not configured, using environment variables');
    return false;
  }

  try {
    console.log('[Secrets] Loading secrets from Infisical...');

    const client = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
    });

    // Authenticate with machine identity
    await client.auth().universalAuth.login({
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });

    // Fetch all secrets
    const secrets = await client.secrets().listSecrets({
      environment: config.environment,
      projectId: config.projectId
    });

    // Inject secrets into process.env
    let count = 0;
    for (const secret of secrets.secrets) {
      if (secret.secretKey && secret.secretValue) {
        process.env[secret.secretKey] = secret.secretValue;
        count++;
      }
    }

    console.log(`[Secrets] Loaded ${count} secrets from Infisical (env: ${config.environment})`);
    return true;
  } catch (error) {
    console.error('[Secrets] Failed to load from Infisical:', error instanceof Error ? error.message : error);
    return false;
  }
}
