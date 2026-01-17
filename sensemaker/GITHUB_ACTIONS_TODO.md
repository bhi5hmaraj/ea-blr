# GitHub Actions Setup - Action Items

This file contains the manual steps you need to complete to finish setting up GitHub Actions CI/CD.

## ✅ What's Already Done

- [x] Created `staging` branch
- [x] Created GitHub Actions workflows:
  - `.github/workflows/pr-checks.yml` - Lint, type-check, build on PRs
  - `.github/workflows/deploy-staging.yml` - Deploy to staging on push to `staging`
  - `.github/workflows/deploy-production.yml` - Deploy to prod on push to `main`
- [x] Added `/api/health` endpoint for smoke tests
- [x] Updated documentation:
  - `docs/github-actions-setup.md` - Complete setup guide
  - `docs/infrastructure.md` - Updated with GitHub Actions info
  - `README.md` - Added branch-based workflow

## 🚧 What You Need to Do

### 1. Set Up Workload Identity Federation (30 minutes)

Run these commands to create secure authentication for GitHub Actions:

```bash
export PROJECT_ID="personal-457416"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export POOL_NAME="github-actions-pool"
export PROVIDER_NAME="github-provider"
export SERVICE_ACCOUNT="github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export REPO="bhi5hmaraj/ea-blr"

# Create Workload Identity Pool
gcloud iam workload-identity-pools create $POOL_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions Pool"

# Create Provider
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Create Service Account
gcloud iam service-accounts create github-actions-deployer \
  --project=$PROJECT_ID \
  --display-name="GitHub Actions Deployer"

# Grant Permissions
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

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Allow GitHub to impersonate service account
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${REPO}"

# Get the provider name (save this!)
gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=$POOL_NAME \
  --format='value(name)'
```

**Copy the output** of the last command - you'll need it for GitHub secrets!

### 2. Create Staging Infisical Environment (10 minutes)

In Infisical web UI:
1. Go to your sensemaker project
2. Create a new environment called `staging`
3. Add the same secrets as `prod`:
   - `DATABASE_URL` - Create a new staging database in Neon
   - `LITELLM_API_KEY` - Can reuse or create separate

Then create staging Infisical credentials:
1. Go to Infisical → Project Settings → Service Tokens
2. Create a new Machine Identity for staging
3. Copy the Client ID and Client Secret

### 3. Create GCP Secrets for Staging (5 minutes)

```bash
# Create secrets
gcloud secrets create SENSEMAKER_INFISICAL_CLIENT_ID_STAGING --replication-policy=automatic
gcloud secrets create SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING --replication-policy=automatic
gcloud secrets create SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING --replication-policy=automatic

# Add values (replace with your staging Infisical creds)
echo -n "YOUR_STAGING_CLIENT_ID" | gcloud secrets versions add SENSEMAKER_INFISICAL_CLIENT_ID_STAGING --data-file=-
echo -n "YOUR_STAGING_CLIENT_SECRET" | gcloud secrets versions add SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING --data-file=-
echo -n "staging" | gcloud secrets versions add SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING --data-file=-

# Grant access to service account
for SECRET in SENSEMAKER_INFISICAL_CLIENT_ID_STAGING SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:github-actions-deployer@personal-457416.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4. Configure GitHub Repository Secrets (5 minutes)

Go to: https://github.com/bhi5hmaraj/ea-blr/settings/secrets/actions

Click "New repository secret" and add:

| Name | Value | Where to get it |
|------|-------|-----------------|
| `GCP_PROJECT_ID` | `personal-457416` | - |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/XXX/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider` | Output from step 1 |
| `GCP_SERVICE_ACCOUNT` | `github-actions-deployer@personal-457416.iam.gserviceaccount.com` | - |
| `INFISICAL_PROJECT_ID` | Your Infisical project ID | Infisical UI |
| `INFISICAL_CLIENT_ID` | Production client ID | Existing prod creds |
| `INFISICAL_CLIENT_SECRET` | Production client secret | Existing prod creds |
| `INFISICAL_CLIENT_ID_STAGING` | Staging client ID | Step 2 |
| `INFISICAL_CLIENT_SECRET_STAGING` | Staging client secret | Step 2 |

### 5. Create Staging Cloud Run Service (5 minutes)

```bash
gcloud run deploy sensemaker-staging \
  --image=asia-south1-docker.pkg.dev/personal-457416/sensemaker/app:latest \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=staging" \
  --set-secrets="INFISICAL_CLIENT_ID=SENSEMAKER_INFISICAL_CLIENT_ID_STAGING:latest,INFISICAL_CLIENT_SECRET=SENSEMAKER_INFISICAL_CLIENT_SECRET_STAGING:latest,INFISICAL_PROJECT_ID=SENSEMAKER_INFISICAL_PROJECT_ID:latest,INFISICAL_ENVIRONMENT=SENSEMAKER_INFISICAL_ENVIRONMENT_STAGING:latest" \
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1
```

### 6. Enable Branch Protection (5 minutes)

Go to: https://github.com/bhi5hmaraj/ea-blr/settings/branches

For `main` branch:
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
  - Select: `lint-and-typecheck` and `build-test`
- ✅ Require linear history

For `staging` branch:
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
  - Select: `lint-and-typecheck` and `build-test`

## 🧪 Testing the Setup

### Test PR Checks
```bash
git checkout -b test/github-actions
# Make a small change
echo "# Test" >> test.md
git add test.md
git commit -m "test: GitHub Actions"
git push -u origin test/github-actions
```

Create a PR on GitHub targeting `staging` - checks should run!

### Test Staging Deployment
Merge the PR to `staging` - deployment should trigger automatically!

### Test Production Deployment
After testing in staging, create PR from `staging` to `main` and merge.

## 📚 References

- [Complete Setup Guide](docs/github-actions-setup.md)
- [Infrastructure Docs](docs/infrastructure.md)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

## ❓ Questions?

If something fails, check:
1. Workload Identity provider format is correct
2. All GitHub secrets are set
3. Service account has all permissions
4. GCP Secret Manager secrets exist

See troubleshooting section in `docs/github-actions-setup.md`.
