# Here Chat App Monorepo

Next.js frontend + Socket.IO/Express backend + Cosmos DB + Azure Entra ID auth.  
Fully written in **TypeScript**.

## Project structure

```
apps/
  web/          Next.js UI (TypeScript/TSX, React 18)
  chat-api/     Express REST + Socket.IO realtime server (TypeScript, ts-node)
packages/
  shared/       Shared type-safe helpers
```

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript |
| Backend | Express 4, Socket.IO 4, TypeScript via ts-node |
| Auth | Azure Entra ID (MSAL for SPA, JWT validation for API) |
| Database | Azure Cosmos DB |
| Secrets | Azure Key Vault (production) |

## Prerequisites

- Node.js 20+
- Azure Entra tenant
- Azure Cosmos DB account

## 1) Install dependencies

From repo root:

```bash
npm install
```

## 2) Create env files

**Linux / macOS / WSL:**

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/chat-api/.env.example apps/chat-api/.env
```

**Windows (cmd):**

```cmd
copy apps\web\.env.example apps\web\.env.local
copy apps\chat-api\.env.example apps\chat-api\.env
```

## 3) Azure Entra setup (required)

Create **two** app registrations.

### A. SPA app registration (frontend)

- Supported account types: ???
- Redirect URI:
  - Platform: `Single-page application`
  - Redirect URI: `http://localhost:3000`
- Copy `Application (client) ID` → `NEXT_PUBLIC_ENTRA_CLIENT_ID`
- Owners -> Add your account as owner (to see the app registration by default & for the next step)

### B. API app registration (backend resource)

Creation:
- Supported account types: ???
- Redirect URI: Leave empty

Configuration:
1. `App registration` -> Click on backend app
2. `Expose an API`
    1. `Add` (Gets you the `Application ID URI` (example: `api://<API_APP_CLIENT_ID>`) api://2acccc44-b27c-4f53-b181-359331eb6c0f)
    2. `Save`
    3. `Add a scope`:
        1. Scope name: `Chat.Access` (full scope value example: `api://<API_APP_CLIENT_ID>/Chat.Access`)
        2. Who can consent? `Admins only`
        3. Admin consent display name: `Chat App: Access`
        4. Admin consent description: `Allows to access the chat app backend`
        5. State: Enabled
    4. `Add a client application`:
        1. Client ID: Application (client) ID from above
        2. Authorized scopes: Enable access for ...Chat.Access
3. Finish the registration
4. Add app roles:
    1. `App roles` -> `Create App Role`
    2. Teams.Edit
        1. Display name: Teams.Edit
        2. Allowed member types: Users/Groups & Applications
        3. Value: Teams.Edit
        4. Description: Create, edit & delete own teams
        5. Enable
    3. Teams.Edit.All:
        1. Display name: Te<ams.Edit.All
        2. Allowed member types: Users/Groups & Applications
        3. Value: Teams.Edit.All
        4. Description: Create, edit & delete any team
        5. Enable
5. Owners -> Add your account as owner (to see the app registration by default & for the next step)

Now or later: Assign relevant roles to the user accounts:
1. Open Entra ID
2. `Enterprise Applications`
3. Click on the *backend* app
4. `Manage` -> `Users and Groups`
5. `Add user/group`: If you have an Entra ID license, you can also assign by using groups. Otherwise you can only assign to users:
    1. Users: Select a user
    2. Select a role: Select an App role (e.g. Teams.Edit or Teams.Edit.All)
    
### C. Grant SPA permission to API scope
1. `App registration` -> Click on frontend app
2. `API permissions`:
    1. `Add a permission` → `My APIs`
    2. Click on backend app
    3. `Delegated permissions`
    4. Check `Chat.Access`
    5. `Add permissions`
3. Click on `Grant admin consent for Default Directory`

## 4) Cosmos DB

1. If not yet created: Create a resource group
2. In the resource group: `Create` -> Azure Cosmos DB
    1. Basics:
        1. Workload Type: `Learning`, `Development/Testing` or `Production`
        2. Check subscription & resource group settings
        3. Account Name: Define a *globally* unique account name (database id, e.g. chat-app, lower case, numbers or -)
        4. Location: Choose a location near you/cheap
        5. Capacity mode: `Provisioned throughput`
        6. Check `Apply Free Tier Discount`
        7. Check `Limit total account throughput`
    2. Global distribution: Disable
    3. Networking: Connectivity method: `All networks` (change, if access can be limited, e.g. to internal IPs)
    4. Backup policy: Default (Pertiodic)
    5. Security: Key-based Authentication: Enabled (default)

## 4) Configure environment variables

### `apps/web/.env.local`

```env
NEXT_PUBLIC_CHAT_API_URL=http://localhost:3001
NEXT_PUBLIC_ENTRA_CLIENT_ID=<FRONTEND_APP_CLIENT_ID>
NEXT_PUBLIC_ENTRA_TENANT_ID=<DIRECTORY_TENANT_ID>
NEXT_PUBLIC_ENTRA_AUTHORITY=https://login.microsoftonline.com/<DIRECTORY_TENANT_ID>
NEXT_PUBLIC_ENTRA_REDIRECT_URI=http://localhost:3000
NEXT_PUBLIC_CHAT_API_SCOPE=api://<API_APP_CLIENT_ID>/Chat.Access
NEXT_PUBLIC_ENABLE_VIDEO_CALL=true
```

### `apps/chat-api/.env`

```env
CHAT_API_PORT=3001
WEB_ORIGIN=http://localhost:3000
AUTH_MODE=entra

ENTRA_TENANT_ID=<DIRECTORY_TENANT_ID>
ENTRA_AUDIENCE=api://<API_APP_CLIENT_ID>

# Optional overrides:
# ENTRA_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
# ENTRA_JWKS_URI=https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys

# Key Vault (recommended for production)
KEY_VAULT_ENABLED=false
KEY_VAULT_URI=https://<vault-name>.vault.azure.net/
KEY_VAULT_ALLOW_LOCAL_FALLBACK=true
KEY_VAULT_SECRET_COSMOS_CONNECTION_STRING=chatapi--prod--cosmos-connstr
# Optional if using endpoint+key instead of connection string:
# KEY_VAULT_SECRET_COSMOS_ENDPOINT=chatapi--prod--cosmos-endpoint
# KEY_VAULT_SECRET_COSMOS_KEY=chatapi--prod--cosmos-key

# Database
COSMOS_CONNECTION_STRING=AccountEndpoint=...;AccountKey=...;
COSMOS_DATABASE_ID=<COSMOS ACCOUNT NAME, e.g. chat-app>
COSMOS_MESSAGES_CONTAINER_ID=messages
COSMOS_USERS_CONTAINER_ID=users
COSMOS_MEMBERSHIPS_CONTAINER_ID=room_memberships

# AI service settings for Foundry AI
# Complete endpoints as found in MS Foundry model details
FOUNDRY_AI_ACTION_ENDPOINT=https://<your-foundry-endpoint>.openai.azure.com/openai/responses?api-version=2025-04-01-preview
FOUNDRY_AI_ACTION_DEPLOYMENT=gpt-5.4-nano
FOUNDRY_AI_CHAT_ENDPOINT=https://<your-foundry-endpoint>.openai.azure.com/openai/responses?api-version=2025-04-01-preview
FOUNDRY_AI_CHAT_DEPLOYMENT=gpt-5.3-chat
FOUNDRY_AI_IMAGE_ENDPOINT=https://<your-foundry-endpoint>.openai.azure.com/openai/deployments/<your-deployment>/images/generations?api-version=2025-04
FOUNDRY_AI_IMAGE_DEPLOYMENT=FLUX-1.1-pro
FOUNDRY_AI_KEY=<your-foundry-api-key>

# Storage account & container name
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_CONTAINER_NAME=chat-files

# Others
VIDEO_CALL_ENABLED=true
CHAT_LOG_LEVEL=info
```

Notes:
- Backend validator accepts both Entra v2 issuer (`login.microsoftonline.com/.../v2.0`) and Entra v1 issuer (`sts.windows.net/.../`).
- If Entra auth is not ready yet, set `AUTH_MODE=legacy` for local non-auth mode.
- Keep secrets out of `apps/web/.env.local` — all `NEXT_PUBLIC_*` variables are bundled into the client.

## 5) Production: Managed Identity, App Service, Azure Key Vault

1. Create a Managed Identity:
    1. Azure: `Managed Identities` -> Create, specify Resource Group, Name & Region
2. Create Key Vault:
    1. Azure: `Key Vaults` -> Create, specify Resource Group, Key vault name, Region & Pricing Tier and choose soft delete-, retain period- and purge protection options
    2. `Access Configuration`:
        1. Permission Model: `Azure role-based access control`
        2. Enable `Azure Virtual Machones for deplyoment`
    3. `Networking`: Choose defaults (but consider more secure settings, e.g. private access, only)
    4. Review + Create
    5. `Access control (IAM)`:
        1. Managed Identity: `Add` -> `Add role assignment`:
            1. Role: `Key Vault Secrets User`
            2. Members: `Managed Identity` -> Select managed identity
        2. Developers: `Add` -> `Add role assignment`:
            1. Role: `Key Vault Contributor` (or Key Vault Secrets User, if they shall get read-only access)
            2. Members: `User, group, or service principal` -> Select developer group (preferred) or individual accounts
3. Create App Services or Container App
    1. TO DO: Where/how?
    2. Enable `System assigned` managed identity on your API host (App Service, Container Apps, or AKS workload identity).
    3. Assign Managed Identity:
        1. `App Service` → `Settings` → `Identity`
        2. `User assigned`
        3. `Add` → select the Managed Identity
4. Adjust environment variables
    1. TO DO: Where/how?
    2. Set `KEY_VAULT_ENABLED=true`, `KEY_VAULT_URI`, and secret-name env vars on the API runtime.
    3. TO DO: Store secret values in Key Vault (for example `chatapi--prod--cosmos-connstr`).
    4. Keep `COSMOS_*` env vars for local development fallback only.
    5. For strict production behavior, set `KEY_VAULT_ALLOW_LOCAL_FALLBACK=false`.

    Operational reference: `docs/security/key-vault-runbook.md`.

## 6) Run

From repo root:

```bash
npm run dev
```

Or separately:

```bash
npm run dev:web
npm run dev:api
```

URLs:
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

> The API runs via `ts-node` — no compilation step required for development.

## 7) Type checking

Run the TypeScript compiler in check-only mode (no output, no ts-node needed):

```bash
# API
npm run typecheck -w apps/chat-api

# Web (Next.js validates types during build automatically)
npm run build -w apps/web
```

## 8) Run with Docker

Build and run both services:

```bash
docker compose up --build
```

Run in detached mode:

```bash
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Publish images:

```bash
docker build -f Dockerfile.api -t <registry>/chat-app-api:<tag> .
docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_CHAT_API_SCOPE=api://<API_APP_CLIENT_ID>/Chat.Access \
  -t <registry>/chat-app-web:<tag> .
docker push <registry>/chat-app-api:<tag>
docker push <registry>/chat-app-web:<tag>
```

Notes:
- `web` uses `NEXT_PUBLIC_*` build args from your shell environment (or defaults in `docker-compose.yml`).
- `chat-api` reads runtime env values (including Key Vault settings) from `docker-compose.yml`.
- Both Dockerfiles run `npm ci` (including devDependencies) so TypeScript is available during build.

### Production compose (prebuilt images, no local build)

Set required environment variables in your shell or deployment system:

```bash
CHAT_API_IMAGE=<registry>/chat-app-api:<tag>
WEB_IMAGE=<registry>/chat-app-web:<tag>
WEB_ORIGIN=https://<your-web-domain>
```

Start:

```bash
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
```

Inspect:

```bash
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs -f
```

Stop:

```bash
docker compose -f compose.prod.yml down
```

Rebuild only the web image (to apply changed `NEXT_PUBLIC_*` values):

```bash
docker compose -f compose.prod.yml --profile build-web build web
docker compose -f compose.prod.yml up -d
```

## Expected login/data flow

1. User signs in via Microsoft on web app.
2. Web acquires access token for `NEXT_PUBLIC_CHAT_API_SCOPE`.
3. Web calls `POST /auth/sync-user` with Bearer token.
4. API validates token (JWT/JWKS) and upserts user into Cosmos `users` container.
5. Web opens Socket.IO connection with token in handshake auth.
6. API validates socket token and registers the user session.

## API routes

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/` | public |
| `GET` | `/health` | public |
| `POST` | `/auth/sync-user` | required |
| `GET` | `/users/:userId` | required |
| `GET` | `/rooms/:roomId/messages` | required |
| `GET` | `/rooms/:roomId/members` | required |
| `POST` | `/rooms/:roomId/members` | required |

## Troubleshooting

- **`401 Unauthorized` on `/auth/sync-user`:**
  - Check `ENTRA_AUDIENCE` exactly matches token `aud`
  - Check `NEXT_PUBLIC_CHAT_API_SCOPE` exactly matches exposed scope
  - Confirm SPA app has delegated permission + consent for `Chat.Access`
- **`GET /Redirect 404`:**
  - Use `NEXT_PUBLIC_ENTRA_REDIRECT_URI=http://localhost:3000` (or create a real `/Redirect` page)
- **User not added to Cosmos:**
  - Verify `/auth/sync-user` returns `200`
  - Verify Cosmos DB/containers and credentials in `apps/chat-api/.env`
- **TypeScript errors in IDE:**
  - Run `npm install` to ensure `@types/*` packages are installed
  - Restart the TypeScript language server in your IDE
- **Port in use:**
  - Kill process on `3000`/`3001` before restart

## Security note

Never commit real secrets (`COSMOS_KEY`, connection strings, tokens). If leaked, rotate keys immediately.
