# Deployment Blueprint: Chat-App als agentische GTM-Lösung auf Azure

## Rahmenbedingungen

| Parameter | Wert |
|---|---|
| Plattform | Microsoft Azure |
| Region | Sweden Central (EU, DSGVO-konform, AI Foundry verfügbar) |
| Umgebungen | Dev, Test, Prod |
| Subscription-Struktur | 1 Subscription, 3 Resource Groups |
| IaC | Terraform 1.9+, azurerm Provider 4.x |
| CI/CD | GitHub Actions mit OIDC (kein statischer Client Secret) |
| Agentik | Azure AI Foundry Agents (Thread/Run-Modell) |
| Kosten-Modus | Scale-to-Zero (Container Apps), Serverless (Cosmos DB) |

---

## 1. Azure-Ressourcen-Übersicht

```
Subscription: chat-app
│
├── rg-chat-app-shared              (einmalig, umgebungsübergreifend)
│   ├── Azure Container Registry    chatappacr.azurecr.io  (Basic, ~$5/Monat)
│   ├── Log Analytics Workspace     law-chat-app-shared
│   └── Storage Account             stchatappterraform     (TF State Backend)
│
├── rg-chat-app-dev
│   ├── Container Apps Environment  cae-chat-app-dev       (Consumption, kein VNet)
│   │   ├── Container App           ca-chat-api-dev        (min=0 Replicas → schläft)
│   │   └── Container App           ca-chat-web-dev        (min=0 Replicas → schläft)
│   ├── Cosmos DB Account           cosmos-chat-app-dev    (Serverless, ~$0 im Leerlauf)
│   ├── Key Vault                   kv-chat-app-dev        (Standard)
│   ├── Storage Account             stchatappdev           (Blob, LRS)
│   ├── Azure OpenAI                oai-chat-app-dev       (Pay-per-Token)
│   ├── Application Insights        appi-chat-app-dev
│   └── User-Assigned MI            id-chat-app-dev
│
├── rg-chat-app-test                (identisch zu dev, leicht höhere Limits)
│
└── rg-chat-app-prod                (identisch, höhere Replika-Limits)
```

### Kosten-Schätzung (Dev, größtenteils idle)

| Ressource | Kosten/Monat |
|---|---|
| ACR Basic (shared) | ~$5 |
| Container Apps (Scale-to-Zero) | $0 im Leerlauf, ~$0.05/vCPU-h aktiv |
| Cosmos DB Serverless | ~$0 im Leerlauf, $0.25/Mio. RU aktiv |
| Azure OpenAI | Pay-per-Token, $0 ohne Nutzung |
| Key Vault Standard | ~$0.03/10k Operationen |
| Storage LRS | ~$0.02/GB/Monat |
| Application Insights | Erste 5 GB/Monat kostenlos |
| **Gesamt Dev (idle)** | **~$5–10/Monat** |

---

## 2. Terraform-Verzeichnisstruktur

```
infra/
├── bootstrap/                       # Einmalig ausführen: TF-State + ACR + Monitoring
│   ├── providers.tf
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
│
├── modules/
│   ├── monitoring/                  # Application Insights
│   ├── managed-identity/            # User-Assigned MI + RBAC-Zuweisungen
│   ├── key-vault/                   # Key Vault + Secrets
│   ├── cosmos-db/                   # Cosmos DB (Serverless) + Container
│   ├── storage/                     # Storage Account + Blob Container
│   ├── azure-openai/                # Azure OpenAI + Modell-Deployments
│   ├── container-apps-env/          # Container Apps Environment
│   └── container-app/               # Container App (wiederverwendbar für api + web)
│
└── environments/
    ├── dev/
    │   ├── providers.tf
    │   ├── backend.tf               # State Key: dev.terraform.tfstate
    │   ├── variables.tf
    │   ├── terraform.tfvars         # Auszufüllen: subscription_id, tenant_id, ...
    │   ├── main.tf                  # Ruft alle Module auf
    │   └── outputs.tf
    ├── test/                        # Analog dev
    └── prod/                        # Analog dev, höhere Limits
```

---

## 3. CI/CD Pipeline-Architektur

### Branch-Strategie

```
feature/*  ──PR──► develop ──merge──► main
                      │                  │
              auto: terraform plan    auto: terraform plan
              auto: deploy → dev      auto: deploy → test
                                      (manuell) deploy → prod
```

### Workflows (GitHub Actions)

| Datei | Trigger | Aufgabe |
|---|---|---|
| `.github/workflows/terraform.yml` | Push/PR auf `infra/**` | plan (PR), apply dev (develop), apply test+prod (main) |
| `.github/workflows/deploy-api.yml` | Push auf `apps/chat-api/**` | Build API-Image → ACR → Container App deployen |
| `.github/workflows/deploy-web.yml` | Push auf `apps/web/**` | Build Web-Image → ACR → Container App deployen |

### GitHub Environments (Approval-Gates)

| Environment | Branch | Required Reviewer |
|---|---|---|
| `dev` | develop | – (auto) |
| `test` | main | – (auto) |
| `prod` | main | ✓ Manuell |

### OIDC-Authentifizierung (kein Client Secret)

GitHub Actions authentifiziert sich via OIDC-Federated Credential gegen eine Azure App Registration. Kein rotierender Client Secret notwendig.

```
GitHub Actions Job
      │  OIDC Token (JWT)
      ▼
Azure Entra ID (Federated Credential prüft issuer + subject)
      │  Azure Access Token
      ▼
Azure APIs (ARM, ACR, Container Apps)
```

---

## 4. Security-Modell

### Managed Identity (kein API-Key im Code)

Alle Container Apps erhalten eine **User-Assigned Managed Identity** mit diesen RBAC-Rollen:

| Ressource | Rolle |
|---|---|
| Key Vault | Key Vault Secrets User |
| Cosmos DB | Cosmos DB Built-in Data Contributor |
| Storage | Storage Blob Data Contributor |
| ACR | AcrPull |
| Azure OpenAI | Cognitive Services OpenAI User |

Der Code nutzt `DefaultAzureCredential` aus `@azure/identity`, das lokal `az login` und in Azure die MI verwendet — kein Code-Unterschied zwischen Umgebungen.

### Key Vault

- Enthält: Entra-Konfiguration, AI-Endpunkte, Storage-Name
- Wird beim API-Start geladen (`loadRuntimeConfig()` — bereits implementiert)
- Soft Delete + Purge Protection aktiviert (verhindert versehentliches Löschen)
- RBAC-Modell (keine Access Policies)

### Networking (Dev vereinfacht, Prod gehärtet)

**Dev/Test:** Kein VNet (Container Apps Consumption Plan, Public Endpoints mit Entra-Auth gesichert)

**Prod:** VNet-Integration empfohlen:
- Container Apps Env im dedizierten Subnet
- Private Endpoints für Cosmos DB, Key Vault, Storage (~$7/Monat pro Endpoint)
- NSG-Regeln für Egress-Kontrolle

---

## 5. Agentisches Setup (Azure AI Foundry Agents)

### Architektur

```
chat-api (Container App)
│
├── /api/ai/chat         Bestehend: direkter LLM-Call (Azure OpenAI)
├── /api/ai/action       Bestehend: Intent Detection
├── /api/ai/image        Bestehend: Image Generation
│
└── /api/agents/         NEU: Persistent AI Agents (Thread-Modell)
    ├── POST /thread                → neuen Conversation-Thread erstellen
    ├── POST /thread/:id/message    → Nachricht an Agent schicken + Run starten
    └── GET  /thread/:id/messages   → Antwort abrufen (SSE oder Polling)
```

### Thread-Persistenz

Agent Thread-IDs werden in Cosmos DB gespeichert (userId → threadId Mapping), so dass Konversationen über Browser-Sessions hinweg erhalten bleiben.

### AI Foundry Agent-Konfiguration (manuell im Azure Portal)

1. AI Foundry Hub erstellen (Linked zu Azure OpenAI)
2. AI Foundry Projekt erstellen
3. Agent definieren:
   - Model: GPT-4o
   - System Prompt: GTM-spezifische Anweisungen
   - Tools: Function Calling (CRM, Kalender), Code Interpreter, File Search
4. Connection String in Key Vault speichern: `ai-foundry-connection-string`

### SDK-Integration (Backend)

```typescript
// apps/chat-api/src/services/agentService.ts
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";

const client = AIProjectClient.fromConnectionString(
  process.env.AI_FOUNDRY_CONNECTION_STRING!,
  new DefaultAzureCredential()  // MI in Azure, az login lokal
);
```

---

## 6. Monitoring & Observability

| Signal | Tool | Konfiguration |
|---|---|---|
| Logs | Application Insights + Log Analytics | Container Apps → Diagnostics Settings |
| Metriken | Azure Monitor | CPU, Memory, Request Rate, Error Rate |
| Alerts | Azure Monitor Alerts | 5xx > 1%, Container Restart > 3/h, Cosmos RU > 80% |
| Distributed Tracing | Application Insights | `applicationinsights` npm package in chat-api |

---

## 7. Scale-to-Zero Konfiguration

Container Apps skalieren automatisch auf 0 Instanzen, wenn kein Traffic vorhanden ist.

| Parameter | Dev | Test | Prod |
|---|---|---|---|
| min_replicas | 0 | 0 | 1 |
| max_replicas | 3 | 5 | 10 |
| concurrent_requests (HTTP Scale Rule) | 10 | 10 | 20 |
| Kaltstart-Latenz | ~10–30s | ~10–30s | n/a (min=1) |

Cosmos DB Serverless: keine Mindestkosten, zahlt nur für tatsächliche Requests.

---

## 8. Empfehlungen (nach Go-Live)

| Thema | Empfehlung | Prio |
|---|---|---|
| Custom Domain + TLS | Azure Front Door (WAF, HTTPS, CDN) | Hoch (Prod) |
| Cosmos DB Backup | Continuous Mode in Prod | Hoch |
| VNet + Private Endpoints | Für Prod (Sicherheit) | Mittel |
| Secret-Rotation | Key Vault Rotation Policy | Mittel |
| Azure Policy | Pflicht-Tags, erlaubte Regionen | Mittel |
| Budget-Alerts | Per Resource Group | Hoch |
| Entra App Reg. | Je eine pro Umgebung | Hoch |
| WebSocket Sticky Sessions | Session Affinity in Container Apps Ingress prüfen | Hoch |

---

## 9. Implementierungs-Reihenfolge

```
Schritt 1: Bootstrap ausführen       → TF State, ACR, Log Analytics
Schritt 2: Entra App Registrations   → MANUELL im Azure Portal (je env)
Schritt 3: GitHub OIDC einrichten    → MANUELL (Federated Credential)
Schritt 4: Dev-Umgebung deployen     → terraform apply dev
Schritt 5: GitHub Actions konfigurieren → Secrets + Environments anlegen
Schritt 6: CI/CD testen              → Push auf develop
Schritt 7: Test-Umgebung             → terraform apply test
Schritt 8: Prod-Umgebung             → terraform apply prod (mit Approval)
Schritt 9: AI Foundry Agents         → Manuell + AgentService im Backend
```

---

*Erstellt: 2026-05-07 | Stack: TypeScript Monorepo (Next.js + Express) | Plattform: Azure*
