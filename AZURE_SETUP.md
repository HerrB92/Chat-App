# Azure Setup: Manual Steps & Deployment Guide

This document describes all steps that must be performed **manually** before Terraform automation
takes over.

> **Convention:** Blocks marked `# REQUIRED` must be filled in individually.
> All `az` commands can be run in Azure Cloud Shell or locally (WSL/Linux terminal).

---

## Prerequisites (install locally)

```bash
# Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash   # Linux/WSL
# or: https://docs.microsoft.com/cli/azure/install-azure-cli

# Terraform
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
terraform --version   # should show >= 1.9.x

# Log in
az login
az account show   # note Subscription + Tenant ID

# Register required Azure resource providers (once per subscription)
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.CognitiveServices --wait
az provider register --namespace Microsoft.KeyVault --wait
az provider register --namespace Microsoft.DocumentDB --wait
az provider register --namespace Microsoft.Storage --wait
az provider register --namespace Microsoft.ContainerRegistry --wait
az provider register --namespace Microsoft.Insights --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.ManagedIdentity --wait
```

---

## Step 1: Note Subscription Values

```bash
# These values are needed in multiple steps
az account show --query '{subscriptionId:id, tenantId:tenantId}' -o json
```

Note for later use:
- `SUBSCRIPTION_ID` = `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- `TENANT_ID`       = `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Step 2: Run Bootstrap (TF State + ACR + Log Analytics)

This step creates shared resources. Run **once only**.

```bash
cd infra/bootstrap

# Fill in terraform.tfvars (enter subscription_id from Step 1)
cp terraform.tfvars.example terraform.tfvars
# Open in editor and fill in your subscription_id
code terraform.tfvars

# Local state for bootstrap (not needed afterwards)
terraform init
terraform plan
terraform apply   # confirm with "yes"

# Note the outputs — needed in Step 6
terraform output
```

**Result after bootstrap:**
- Resource group `rg-chat-app-shared` with ACR (`chatappacr`) + Log Analytics (`law-chat-app-shared`)
- Storage account `stchatappterraform` for Terraform state

---

## Step 3: Entra ID App Registrations (MANUAL — per environment)

> Terraform can create App Registrations but requires `Application.ReadWrite.All` in the Entra
> directory — a permission that must be manually approved in most tenants. It is simpler to
> create these once in the portal.

**Per environment (dev / test / prod):** create **2 App Registrations** each.

---

### 3a: Backend App Registration (chat-api)

Azure Portal → **Entra ID → App Registrations → New Registration**

| Field | Value |
|---|---|
| Name | `chat-app-api-dev` (or `-test`, `-prod`) |
| Supported account types | Accounts in this organizational directory only |
| Redirect URI | — (no redirect for backend) |

After creation:
1. `Expose an API` → `Add a scope`
   1. Application ID URI is auto-generated as `api://<API_APP_CLIENT_ID>` → click `Save`
   2. `Add a scope`:
      - Scope name: `Chat.Access`
      - Who can consent? `Admins only`
      - Admin consent display name: `Chat App: Access`
      - Admin consent description: `Allows to access the chat app backend`
      - State: Enabled
2. `App roles` → `Create App Role` — create both:
   - **Teams.Edit**: Allowed for Users/Groups & Applications · Value: `Teams.Edit` · Description: `Create, edit & delete own teams`
   - **Teams.Edit.All**: Allowed for Users/Groups & Applications · Value: `Teams.Edit.All` · Description: `Create, edit & delete any team`
3. `Owners` → Add your account as owner

Note:
- `ENTRA_AUDIENCE` = Application (client) ID of the backend app
- `ENTRA_TENANT_ID` = Directory (tenant) ID

---

### 3b: Frontend App Registration (chat-web)

Azure Portal → **Entra ID → App Registrations → New Registration**

| Field | Value |
|---|---|
| Name | `chat-app-web-dev` (or `-test`, `-prod`) |
| Supported account types | Accounts in this organizational directory only |
| Redirect URI (SPA) | `https://ca-trainbb-chat-web-dev.{region}.azurecontainerapps.io` |

After creation:
1. **Authentication**:
   1. Add Redirect URL → **Single-page application**: `http://localhost:3000`
   2. Enable **Access tokens** and **ID tokens**
2. **API Permissions** → Add permission → **My APIs** → `chat-app-api-dev`
   - Permission type: `Delegated permissions`
   - Scope: `Chat.Access` → **Add**
   - Click **Grant admin consent**

Note:
- `NEXT_PUBLIC_ENTRA_CLIENT_ID` = Application (client) ID of the frontend app
- `NEXT_PUBLIC_ENTRA_AUTHORITY` = `https://login.microsoftonline.com/{TENANT_ID}`
- `NEXT_PUBLIC_CHAT_API_SCOPE` = `api://chat-app-api-dev/Chat.Access`

---

### 3c: Enter values in terraform.tfvars

Open each file in VS Code and fill in the GUIDs from the steps above.
The `.tfvars` file is a plain text file — do **not** execute it as a shell command.

```bash
# Run in WSL terminal — once per environment
cp infra/environments/dev/terraform.tfvars.example  infra/environments/dev/terraform.tfvars
cp infra/environments/test/terraform.tfvars.example infra/environments/test/terraform.tfvars
cp infra/environments/prod/terraform.tfvars.example infra/environments/prod/terraform.tfvars

code infra/environments/dev/terraform.tfvars
```

The file content looks like this — fill in the actual GUIDs:

```hcl
entra_tenant_id     = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # Directory (tenant) ID
entra_audience      = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # Backend App client ID
web_entra_client_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # Frontend App client ID
web_entra_scope     = "api://chat-app-api-dev/Chat.Access"
```

> All GUIDs can be copied from the Azure Portal under
> **Entra ID → App Registrations → (your app) → Overview**.

> `entra_issuer`, `entra_jwks_uri`, and `web_entra_authority` are **automatically derived**
> from `entra_tenant_id` by Terraform — do not set them manually.

---

## Step 4: Set Up GitHub OIDC (MANUAL — no rotating client secret)

### 4a: App Registration for GitHub Actions

Azure Portal → **Entra ID → App Registrations → New Registration**

| Field | Value |
|---|---|
| Name | `sp-chat-app-github-actions` |
| Supported account types | Accounts in this organizational directory only |

After creation → **Certificates & secrets → Federated credentials → Add**

**One federated credential for each:**

| Name | Scenario | Org | Repo | Entity | Branch/Env |
|---|---|---|---|---|---|
| `github-develop` | GitHub Actions | `{YOUR_ORG}` | `Chat-App` | Branch | `develop` |
| `github-main` | GitHub Actions | `{YOUR_ORG}` | `Chat-App` | Branch | `main` |
| `github-env-prod` | GitHub Actions | `{YOUR_ORG}` | `Chat-App` | Environment | `prod` |

```bash
# Retrieve App Registration Object ID (needed for permissions)
az ad app list --display-name "sp-chat-app-github-actions" --query "[].{appId:appId,objectId:id}" -o table
```

### 4b: Create Service Principal and Assign Permissions

Run in your **local WSL/Linux terminal**. All values are fetched automatically — nothing to replace manually.

```bash
# Fetch IDs from Azure — no manual placeholder replacement needed
APP_ID=$(az ad app list --display-name "sp-chat-app-github-actions" --query "[0].appId" -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id -o tsv)

echo "APP_ID:          $APP_ID"
echo "SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
echo "SP_OBJECT_ID:    $SP_OBJECT_ID"
# Verify the output looks correct before continuing

# Contributor rights on the subscription (for resource creation)
az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"

# AcrPush on the container registry
ACR_ID=$(az acr show --name chatappacr --resource-group rg-chat-app-shared --query id -o tsv)
az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role "AcrPush" \
  --scope "$ACR_ID"

# User Access Administrator (for RBAC assignments in Terraform)
az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role "User Access Administrator" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"

# Note the SP_OBJECT_ID — needed for terraform.tfvars (github_sp_object_id)
echo "github_sp_object_id = \"$SP_OBJECT_ID\""
```

> **Security note:** `User Access Administrator` is broad. For production this should be
> restricted to specific resource groups.

### 4c: Create GitHub Secrets

GitHub Repository → **Settings → Secrets and variables → Actions → New repository secret**

Set these secrets **now** (all values are known at this point):

| Secret Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | Application (client) ID of `sp-chat-app-github-actions` |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |
| `ENTRA_TENANT_ID_DEV` | Directory (tenant) ID (same value as `AZURE_TENANT_ID`) |
| `WEB_ENTRA_CLIENT_ID_DEV` | Application (client) ID of `chat-app-web-dev` (from Step 3b) |
| `WEB_ENTRA_AUTHORITY_DEV` | `https://login.microsoftonline.com/<TENANT_ID>` |
| `WEB_ENTRA_SCOPE_DEV` | `api://chat-app-api-dev/Chat.Access` (from Step 3a) |

> ⚠️ The following two secrets depend on the Container App URLs and can only be set **after Step 6**.
> They are required before the first `deploy-web` GitHub Actions run succeeds.
>
> | Secret Name | Value |
> |---|---|
> | `CHAT_API_URL_DEV` | `https://ca-trainbb-chat-api-dev.{region}.azurecontainerapps.io` |
> | `CHAT_WEB_URL_DEV` | `https://ca-trainbb-chat-web-dev.{region}.azurecontainerapps.io` |

### 4d: Create GitHub Environments

GitHub Repository → **Settings → Environments**

| Environment | Configuration |
|---|---|
| `dev` | No restrictions (auto-deploy) |
| `test` | No restrictions (auto-deploy) |
| `prod` | ✓ Required reviewers: add at least 1 person |

---

## Step 5: Push Placeholder Images to ACR

Azure Container Apps require an image to exist in ACR **at creation time** — even with
`min_replicas = 0`. Use `az acr import` to copy a public placeholder image within Azure
(no Docker daemon required):

```bash
az acr import \
  --name chatappacr \
  --source mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --image chat-api:latest \
  --force

az acr import \
  --name chatappacr \
  --source mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --image chat-web:latest \
  --force
```

---

## Step 6: Deploy the Dev Environment

```bash
cd infra/environments/dev

# Fill in terraform.tfvars (all REQUIRED fields)
cp terraform.tfvars.example terraform.tfvars
code terraform.tfvars

# Initialize state (reads backend config from backend.tf)
terraform init

# Review plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan
```

> **Key Vault 403 error?** The Key Vault uses RBAC authorization. Your local account needs
> "Key Vault Secrets Officer" to write secrets — `Contributor` on the subscription is not enough.
> Run the following **before** re-applying:

```bash
KV_ID=$(az keyvault show \
  --name kv-trainbb-chat-app-dev \
  --resource-group rg-trainbb-chat-app-dev \
  --query id -o tsv)
USER_OID=$(az ad signed-in-user show --query id -o tsv)
az role assignment create \
  --assignee-object-id "$USER_OID" \
  --assignee-principal-type User \
  --role "Key Vault Secrets Officer" \
  --scope "$KV_ID"
# Wait ~60 s for RBAC propagation, then re-run plan + apply
sleep 60
terraform plan -out=tfplan && terraform apply tfplan
```

### After Apply: Note the URLs

```bash
terraform output
# → chat_api_url: https://ca-trainbb-chat-api-dev.xxx.swedencentral.azurecontainerapps.io
# → chat_web_url: https://ca-trainbb-chat-web-dev.xxx.swedencentral.azurecontainerapps.io
```

### After Apply: Set the remaining GitHub Secrets (FQDN-dependent)

Now that the Container App URLs are known, add the two secrets that were skipped in Step 4c:

```bash
API_URL=$(terraform output -raw chat_api_url)
WEB_URL=$(terraform output -raw chat_web_url)

echo "Set these in GitHub → Settings → Secrets and variables → Actions:"
echo "  CHAT_API_URL_DEV = $API_URL"
echo "  CHAT_WEB_URL_DEV = $WEB_URL"
```

> If you use the GitHub CLI (`gh`), you can set them directly:
> ```bash
> gh secret set CHAT_API_URL_DEV --body "$API_URL"
> gh secret set CHAT_WEB_URL_DEV --body "$WEB_URL"
> ```

---

## Step 7: Update Entra Redirect URIs

After Step 6 the real Container App URLs are known. They must be added to the App Registrations:

1. Azure Portal → Entra ID → App Registrations → `chat-app-web-dev`
2. **Authentication** → Redirect URIs → Add the actual URL from `terraform output`
3. **Save**

---

## Step 8: Build and Push Real Images

Replace the placeholder images with the actual application builds.
Use the URLs from `terraform output` (Step 6) and the tenant ID from Step 1.

```bash
# Log in to ACR
az acr login --name chatappacr

# Build and push API image
docker build -f Dockerfile.api -t chatappacr.azurecr.io/chat-api:latest .
docker push chatappacr.azurecr.io/chat-api:latest

# Build and push web image (fill in the actual URLs from Step 6 + tenant ID from Step 1)
docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_CHAT_API_URL="https://ca-trainbb-chat-api-dev.xxx.swedencentral.azurecontainerapps.io" \
  --build-arg NEXT_PUBLIC_ENTRA_CLIENT_ID="<WEB_CLIENT_ID>" \
  --build-arg NEXT_PUBLIC_ENTRA_TENANT_ID="<TENANT_ID>" \
  --build-arg NEXT_PUBLIC_ENTRA_AUTHORITY="https://login.microsoftonline.com/<TENANT_ID>" \
  --build-arg NEXT_PUBLIC_ENTRA_REDIRECT_URI="https://ca-trainbb-chat-web-dev.xxx.swedencentral.azurecontainerapps.io" \
  --build-arg NEXT_PUBLIC_CHAT_API_SCOPE="api://chat-app-api-dev/Chat.Access" \
  -t chatappacr.azurecr.io/chat-web:latest .
docker push chatappacr.azurecr.io/chat-web:latest
```

> The Container Apps already reference the `latest` tag — they pick up the new images on the next
> revision. To trigger a new revision immediately:
>
> ```bash
> az containerapp update --name ca-trainbb-chat-api-dev --resource-group rg-trainbb-chat-app-dev --image chatappacr.azurecr.io/chat-api:latest
> az containerapp update --name ca-trainbb-chat-web-dev --resource-group rg-trainbb-chat-app-dev --image chatappacr.azurecr.io/chat-web:latest
> ```

---

## Step 9: Test GitHub Actions Workflows

```bash
# Push develop branch → triggers deploy-api + deploy-web + terraform plan
git checkout -b develop
git push origin develop
```

Check in GitHub → **Actions**: all workflows should turn green.

---

## Step 10: Azure AI Services (Shared — no separate resource needed)

AI model deployments are shared from the existing resource group `train_rsrc_foundry_swe`:

- **Azure AI services account:** `train-bb-ai-services`
- **Chat deployment:** `gpt-5.3-chat`
- **Action deployment:** `gpt-5.4-nano`
- **Image deployment:** `gpt-image-2` ⚠️ **Rate limit: 2 requests/minute** — application must queue image generation requests

Terraform reads this account via a data source and assigns the `Cognitive Services OpenAI User` role
to the Managed Identity automatically. No manual steps are required.

To verify the deployments exist:

```bash
az cognitiveservices account deployment list \
  --name train-bb-ai-services \
  --resource-group train_rsrc_foundry_swe \
  --query "[].{name:name, model:properties.model.name, status:properties.provisioningState}" \
  -o table
```

---

## Step 11: Test and Prod Environments

Repeat Steps 5–6 for `test` and `prod`:

```bash
# Test
cd infra/environments/test
cp terraform.tfvars.example terraform.tfvars
code terraform.tfvars   # Enter App Registrations for test
terraform init && terraform apply

# Prod (after test succeeds)
cd infra/environments/prod
cp terraform.tfvars.example terraform.tfvars
code terraform.tfvars
terraform init && terraform apply   # Requires GitHub Environment "prod" approval
```

---

## Optional Step: AI Foundry Agents (Agentic Setup)

Perform this step after a successful base deployment.

1. Azure Portal → **Azure AI Foundry** → Open project `train-bb-foundry-prj-swe` in `train_rsrc_foundry_swe`
2. **Agents** → **New Agent**:
   - Model: `gpt-5.3-chat` (deployment in `train-bb-ai-services`)
   - Name: `chat-gtm-agent`
   - Instructions: GTM-specific system prompt
3. Copy the **Connection String** (format: `endpoint;subscription;rg;project`)
4. Store it in Key Vault:

```bash
az keyvault secret set \
  --vault-name kv-trainbb-chat-app-dev \
  --name "ai-foundry-connection-string" \
  --value "<CONNECTION_STRING>"
```

---

## Troubleshooting

### Partial apply failed — clean up and retry

If `terraform apply` fails partway through (e.g. quota errors, missing namespace registration):

```bash
# Option A — clean up via Terraform (recommended if state is consistent)
cd infra/environments/dev
terraform destroy -auto-approve

# Option B — delete resource group directly (if TF state is inconsistent)
az group delete --name rg-trainbb-chat-app-dev --yes --no-wait
```

Register missing providers first, then re-apply:

```bash
az provider register --namespace Microsoft.App --wait
terraform plan -out=tfplan
terraform apply tfplan
```

### Container App does not start

```bash
# Show logs for the latest revision
az containerapp logs show \
  --name ca-trainbb-chat-api-dev \
  --resource-group rg-trainbb-chat-app-dev \
  --type console \
  --follow
```

### Key Vault access fails

```bash
# Check RBAC assignments of the managed identity
MI_PRINCIPAL=$(az identity show \
  --name id-trainbb-chat-app-dev \
  --resource-group rg-trainbb-chat-app-dev \
  --query principalId -o tsv)
az role assignment list --assignee $MI_PRINCIPAL --all --output table
# Note: --all is required to include resource-scoped assignments (Key Vault, Storage, ACR, OpenAI).
# Without --all, only subscription-level assignments are shown — the list will appear empty
# even when all role assignments exist correctly.
```

### Terraform state lock

```bash
# Release state lock (only when certain no parallel apply is running)
cd infra/environments/dev
terraform force-unlock <LOCK_ID>
```

### Container App is sleeping (scale-to-zero) and cold start takes too long

```bash
# Temporarily set min_replicas to 1 (costs ~$0.05/h)
az containerapp update \
  --name ca-trainbb-chat-api-dev \
  --resource-group rg-trainbb-chat-app-dev \
  --min-replicas 1
# Reset afterwards:
az containerapp update \
  --name ca-trainbb-chat-api-dev \
  --resource-group rg-trainbb-chat-app-dev \
  --min-replicas 0
```

---

## Summary: Manual vs. Automated

| Task | Manual | Automated (Terraform / CI) |
|---|---|---|
| Create Azure subscription | ✓ | |
| Register Azure resource providers | ✓ (once) | |
| Run Terraform bootstrap | ✓ (once) | |
| Entra App Registrations (dev/test/prod) | ✓ (2× each) | |
| GitHub OIDC federated credential | ✓ | |
| Create GitHub secrets | ✓ | |
| GitHub Environments + approvers | ✓ | |
| All Azure resources (RG, KV, Cosmos, CA…) | | ✓ Terraform |
| RBAC assignments | | ✓ Terraform |
| Key Vault secrets | | ✓ Terraform |
| OpenAI RBAC on shared AI services | | ✓ Terraform |
| Build + push Docker images | | ✓ GitHub Actions |
| Deploy Container Apps | | ✓ GitHub Actions |
| Terraform plan / apply | | ✓ GitHub Actions |
| Create AI Foundry Agent | ✓ (portal) | |

---

*Last updated: 2026-05-13*
