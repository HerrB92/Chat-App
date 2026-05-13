# AGENTS.md — Project Conventions for AI Coding Agents

This file defines conventions for AI coding agents (Claude Code, OpenAI Codex, Aider, etc.)
working in this repository. Follow these rules in all generated or modified code.

---

## Language

- **All code comments must be written in English.** No exceptions.
- **All Markdown files must be written in English.** No exceptions.
- Variable names, function names, and identifiers follow the language's standard conventions
  (camelCase for TypeScript, snake_case for Terraform).

---

## Project Overview

TypeScript monorepo with two applications and one shared package:

```
apps/chat-api/    Express + Socket.io backend (Node.js, port 3001)
apps/web/         Next.js frontend (React 19, port 3000)
packages/shared/  Shared types consumed by both apps
```

The application is deployed on **Microsoft Azure** in **Sweden Central**.
See [DEPLOY_BLUEPRINT.md](DEPLOY_BLUEPRINT.md) for the full infrastructure architecture.

---

## TypeScript / Node.js Conventions

- **No comments by default.** Add one only when the *why* is non-obvious — a hidden constraint,
  a workaround, or a subtle invariant. Never explain what the code does.
- Prefer `type` over `interface` for plain data shapes; use `interface` only when extension
  or declaration merging is needed.
- No `any`. Use `unknown` and narrow explicitly.
- Async functions return `Promise<T>` explicitly in public APIs.
- Error handling: catch at system boundaries (HTTP handlers, Socket.io events) only.
  Internal helpers throw; callers decide how to handle.
- No feature flags, backwards-compatibility shims, or dead code. Delete unused code.
- Do not add error handling or validation for scenarios that cannot happen.
  Trust framework guarantees (Express, Socket.io, Cosmos SDK).

### Imports

- Use absolute paths from the monorepo root for cross-package imports.
- Import order: Node built-ins → third-party → internal packages → relative.
- No default exports in shared library code (`packages/`).

### Environment Variables

- All runtime configuration is loaded via `loadRuntimeConfig()` in `apps/chat-api/src/config/runtimeConfig.ts`.
- New config values must be added there, not read directly via `process.env` in business logic.
- Secrets are stored in **Azure Key Vault** and hydrated at startup.
  Do not add secrets directly to `.env` files or Dockerfiles.

---

## React / Next.js Conventions

- Use functional components and hooks only. No class components.
- `NEXT_PUBLIC_*` variables are baked in at build time — one Docker image per environment.
  Do not treat them as runtime configuration.
- Keep page components thin; extract logic into custom hooks or service modules.
- No inline styles. Use the existing CSS in `apps/web/styles/`.

---

## Terraform Conventions

All infrastructure lives in `infra/`. The structure is:

```
infra/bootstrap/          One-time shared resources (ACR, Log Analytics, TF state backend)
infra/modules/<name>/     Reusable modules: main.tf + variables.tf + outputs.tf
infra/environments/<env>/ Per-environment root: providers.tf + backend.tf + variables.tf
                          + terraform.tfvars.example + main.tf + outputs.tf
```

### Rules

- **Never** write `terraform.tfvars` files — they are gitignored. Only `.tfvars.example` files
  are committed. See `.gitignore`.
- Every module exposes all created resource IDs and names via `outputs.tf`.
- Use `sensitive = true` on variables that hold secrets (Entra IDs, API keys).
- Use `dynamic` blocks instead of duplicating `env {}` or similar blocks.
- Prefer `azurerm` data sources over hard-coded resource IDs.
- Resource names follow the pattern: `<type-abbreviation>-chat-app-<env>`
  (e.g. `kv-chat-app-dev`, `ca-chat-api-prod`).
- Always set `tags = var.tags` on every top-level resource.
- **No** manual resource creation in the Azure portal for things managed by Terraform.

### Cost Optimization (Learning Environment)

- Cosmos DB: Serverless capability (`EnableServerless`) — no minimum throughput cost.
- Container Apps: `min_replicas = 0` in dev/test — scale to zero when idle.
- ACR: Basic tier, shared across all environments.
- Storage: LRS replication in dev/test, GRS in prod.
- Log Analytics: 30-day retention in dev/test.

---

## Azure / Security Conventions

- **Managed Identity over API keys.** All Azure SDK clients use `DefaultAzureCredential`.
  No static API keys or connection strings in application code or environment variables.
- RBAC over Access Policies for Key Vault (`enable_rbac_authorization = true`).
- Cosmos DB master keys disabled (`local_authentication_disabled = true`).
- ACR admin account disabled (`admin_enabled = false`).
- GitHub Actions authenticates to Azure via **OIDC federated credentials** — no rotating client secrets.
- `KEY_VAULT_ALLOW_LOCAL_FALLBACK = false` in all non-dev environments (fail fast).

---

## Git / CI-CD Conventions

- Branch `develop` → auto-deploy to **dev** environment.
- Branch `main` → auto-deploy to **test**, then manual approval → **prod**.
- Terraform plan is posted as a PR comment when `infra/**` changes.
- Docker images are tagged with the short commit SHA (8 characters).
- The web image is built **per environment** because `NEXT_PUBLIC_*` variables are
  baked in at build time.

---

## What Not To Do

- Do not create `*.md` documentation files unless explicitly requested.
- Do not add trailing summaries at the end of responses ("I have now completed…").
- Do not mock Azure SDK clients in tests — integration tests must hit real services or
  use the Azure SDK's built-in test doubles.
- Do not commit `terraform.tfvars`, `.env`, `.env.local`, or any file containing real secrets.
- Do not use `az containerapp up` — deployments go through GitHub Actions only.
