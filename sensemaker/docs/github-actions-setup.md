# GitHub Actions CI/CD Setup

This guide explains how to set up GitHub Actions for automated deployments to staging and production environments.

## Architecture

```
Feature Branch → PR → Staging Branch → PR → Main Branch
                 ↓                      ↓            ↓
              PR Checks          Deploy Staging  Deploy Prod
           (lint, type, build)   (staging env)   (prod env)
```

## Workflows

### 1. PR Checks (`pr-checks.yml`)
Runs on every pull request to `main` or `staging`:
- Type checking
- Linting
- Build test

### 2. Deploy Staging (`deploy-staging.yml`)
Runs on push to `staging` branch:
- Builds Docker image with `staging-*` tags
- Runs migrations against staging DB
- Deploys to `sensemaker-staging` Cloud Run service
- Runs smoke tests
- Comments deployment URL on commit

### 3. Deploy Production (`deploy-production.yml`)
Runs on push to `main` branch:
- Builds Docker image with `prod-*` and `latest` tags
- Runs migrations against production DB
- Deploys to `sensemaker` Cloud Run service
- Runs smoke tests
- Creates GitHub release
- Comments deployment URL on commit

## One-Time Setup

### 1. Set Up Workload Identity Federation (Recommended)

This allows GitHub Actions to authenticate to GCP without storing service account keys.

```bash
# Set variables
export PROJECT_ID="personal-457416"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export POOL_NAME="github-actions-pool"
export PROVIDER_NAME="github-provider"
export SERVICE_ACCOUNT="github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export REPO="bhi5hmaraj/ea-blr"

# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create $POOL_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions Pool"

# 2. Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 3. Create Service Account
gcloud iam service-accounts create github-actions-deployer \
  --project=$PROJECT_ID \
  --display-name="GitHub Actions Deployer"

# 4. Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/artifactregistry.writer"

# 5. Allow GitHub Actions to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${REPO}"

# 6. Get the Workload Identity Provider resource name
gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=$POOL_NAME \
  --format='value(name)'
```

The output of the last command is what you'll use for `GCP_WORKLOAD_IDENTITY_PROVIDER`.

### 2. Create GCP Secrets for Staging Environment

```bash
# Create staging-specific Infisical secrets
gcloud secrets create SENSEMAKER_INFISICAL_CLIENT_ID_STAGING \
  --replication-policy=automatic

gcloud secrets create SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING \
  --replication-policy=automatic

gcloud secrets create SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING \
  --replication-policy=automatic

# Add secret values (replace with your staging Infisical credentials)
echo -n "your-staging-client-id" | gcloud secrets versions add SENSEMAKER_INFISICAL_CLIENT_ID_STAGING --data-file=-
echo -n "your-staging-client-secret" | gcloud secrets versions add SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING --data-file=-
echo -n "staging" | gcloud secrets versions add SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING --data-file=-

# Grant access to the service account
for SECRET in SENSEMAKER_INFISICAL_CLIENT_ID_STAGING SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 3. Configure GitHub Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following **Repository Secrets**:

#### Required for all workflows:
- `GCP_PROJECT_ID`: `personal-457416`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: Output from step 1 (format: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_NAME/providers/PROVIDER_NAME`)
- `GCP_SERVICE_ACCOUNT`: `github-actions-deployer@personal-457416.iam.gserviceaccount.com`
- `INFISICAL_PROJECT_ID`: Your Infisical project ID (shared across environments)

#### For staging deployments:
- `INFISICAL_CLIENT_ID_STAGING`: Staging Infisical client ID
- `INFISICAL_CLIENT_SECRET_STAGING`: Staging Infisical client secret

#### For production deployments:
- `INFISICAL_CLIENT_ID`: Production Infisical client ID
- `INFISICAL_CLIENT_SECRET`: Production Infisical client secret

### 4. Create Staging Cloud Run Service (First Time)

```bash
# Create staging service (will be updated by CI/CD afterward)
gcloud run deploy sensemaker-staging \
  --image=asia-south1-docker.pkg.dev/personal-457416/sensemaker/app:latest \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=staging" \
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1
```

## Development Workflow

### Creating a New Feature

```bash
# 1. Create feature branch from staging
git checkout staging
git pull origin staging
git checkout -b feature/my-feature

# 2. Make changes and commit
git add .
git commit -m "feat: add my feature"

# 3. Push and create PR to staging
git push -u origin feature/my-feature
# Create PR on GitHub targeting 'staging' branch
```

### Testing in Staging

```bash
# 1. Merge PR to staging (after PR checks pass)
# This automatically triggers deploy-staging.yml

# 2. Test on staging URL
# Check the commit comment for the staging URL

# 3. If tests pass, create PR from staging to main
```

### Promoting to Production

```bash
# 1. Create PR from staging to main on GitHub

# 2. After review and approval, merge to main
# This automatically triggers deploy-production.yml

# 3. Verify production deployment
# Check the commit comment for the production URL
# A GitHub release will be created automatically
```

## Environment Differences

| Aspect | Staging | Production |
|--------|---------|------------|
| **Branch** | `staging` | `main` |
| **Cloud Run Service** | `sensemaker-staging` | `sensemaker` |
| **Image Tags** | `staging-{sha}`, `staging-latest` | `prod-{sha}`, `latest` |
| **Infisical Env** | `staging` | `prod` |
| **Min Instances** | 0 (scales to zero) | 1 (always warm) |
| **Max Instances** | 3 | 10 |
| **Memory** | 1Gi | 2Gi |
| **CPU** | 1 | 2 |
| **Timeout** | 60s | 300s |

## Troubleshooting

### Workflow fails with "Workload Identity authentication failed"

Check:
1. Workload Identity Pool and Provider are created
2. Service account has correct IAM bindings
3. Repository secret `GCP_WORKLOAD_IDENTITY_PROVIDER` matches the provider resource name

### Deployment fails with "Permission denied"

Ensure service account has all required roles:
```bash
gcloud projects get-iam-policy personal-457416 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:github-actions-deployer@personal-457416.iam.gserviceaccount.com"
```

### Migration fails

Check:
1. Infisical secrets are set correctly in GCP Secret Manager
2. Service account can access the secrets
3. DATABASE_URL exists in Infisical for the environment

### Smoke test fails

Check:
1. Health endpoint exists: `/api/health`
2. Service is fully deployed and healthy
3. Check Cloud Run logs for errors

## Monitoring Deployments

### GitHub Actions UI
- Go to repository → Actions tab
- See all workflow runs, logs, and artifacts

### Cloud Run Console
- [Production Service](https://console.cloud.google.com/run/detail/asia-south1/sensemaker)
- [Staging Service](https://console.cloud.google.com/run/detail/asia-south1/sensemaker-staging)

### Logs
```bash
# Production logs
gcloud run services logs read sensemaker --region=asia-south1 --limit=50

# Staging logs
gcloud run services logs read sensemaker-staging --region=asia-south1 --limit=50
```

## Rollback

### Rollback Production
```bash
# List recent revisions
gcloud run revisions list --service=sensemaker --region=asia-south1

# Rollback to specific revision
gcloud run services update-traffic sensemaker \
  --region=asia-south1 \
  --to-revisions=REVISION_NAME=100
```

### Rollback Staging
```bash
gcloud run revisions list --service=sensemaker-staging --region=asia-south1

gcloud run services update-traffic sensemaker-staging \
  --region=asia-south1 \
  --to-revisions=REVISION_NAME=100
```

## Security Considerations

1. **No Service Account Keys**: Using Workload Identity Federation means no JSON keys stored in GitHub
2. **Least Privilege**: Service account only has permissions needed for deployment
3. **Secret Management**: All secrets in GCP Secret Manager, accessed via Infisical
4. **Branch Protection**: Enable branch protection rules on `main` and `staging`:
   - Require PR reviews
   - Require status checks to pass
   - Require linear history

## Future Improvements

- [ ] Add automated tests to PR checks
- [ ] Add database backup before production migrations
- [ ] Add Slack/Discord notifications for deployments
- [ ] Add deployment approval gates for production
- [ ] Add performance/load testing in staging
- [ ] Add automated rollback on smoke test failure
