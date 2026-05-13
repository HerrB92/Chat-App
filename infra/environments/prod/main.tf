locals {
  env      = "prod"
  location = var.location
  tags = {
    project     = "chat-app"
    environment = local.env
    managed_by  = "terraform"
  }

  # Derived from entra_tenant_id — no need to set these manually in tfvars
  entra_issuer    = "https://login.microsoftonline.com/${var.entra_tenant_id}/v2.0"
  entra_jwks_uri  = "https://login.microsoftonline.com/${var.entra_tenant_id}/discovery/v2.0/keys"
  entra_authority = "https://login.microsoftonline.com/${var.entra_tenant_id}"
}

resource "azurerm_resource_group" "main" {
  name     = "rg-trainbb-chat-app-${local.env}"
  location = local.location
  tags     = local.tags
}

module "monitoring" {
  source                     = "../../modules/monitoring"
  env                        = local.env
  location                   = local.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = var.log_analytics_workspace_id
  tags                       = local.tags
}

module "key_vault" {
  source              = "../../modules/key-vault"
  env                 = local.env
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  github_sp_object_id = var.github_sp_object_id
  tags                = local.tags
  secrets = {
    "entra-tenant-id"              = var.entra_tenant_id
    "entra-audience"               = var.entra_audience
    "entra-issuer"                 = local.entra_issuer
    "entra-jwks-uri"               = local.entra_jwks_uri
    "cosmos-endpoint"              = module.cosmos_db.endpoint
    "cosmos-database"              = module.cosmos_db.database_id
    "storage-account-name"         = module.storage.name
    "storage-container-name"       = "chat-files"
    "foundry-ai-chat-endpoint"     = "${data.azurerm_cognitive_account.openai.endpoint}openai/responses?api-version=2025-04-01-preview"
    "foundry-ai-chat-deployment"   = var.openai_chat_deployment
    "foundry-ai-action-endpoint"   = "${data.azurerm_cognitive_account.openai.endpoint}openai/responses?api-version=2025-04-01-preview"
    "foundry-ai-action-deployment" = var.openai_action_deployment
    "foundry-ai-image-endpoint"    = "${data.azurerm_cognitive_account.openai.endpoint}openai/deployments/${var.openai_image_deployment}/images/generations?api-version=2025-04-01-preview"
    "foundry-ai-image-deployment"  = var.openai_image_deployment
  }
}

module "cosmos_db" {
  source              = "../../modules/cosmos-db"
  env                 = local.env
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  enable_free_tier    = false # Free Tier only for dev
  tags                = local.tags
}

module "storage" {
  source              = "../../modules/storage"
  env                 = local.env
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

# Shared Azure AI services (train_rsrc_foundry_swe) — referenced, not created here
data "azurerm_cognitive_account" "openai" {
  name                = var.openai_account_name
  resource_group_name = var.openai_resource_group
}

module "identity" {
  source              = "../../modules/managed-identity"
  env                 = local.env
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  key_vault_id        = module.key_vault.id
  cosmos_account_id   = module.cosmos_db.id
  cosmos_account_name = module.cosmos_db.name
  storage_account_id  = module.storage.id
  acr_id              = var.acr_id
  openai_account_id   = data.azurerm_cognitive_account.openai.id
  tags                = local.tags
  depends_on          = [module.key_vault, module.cosmos_db, module.storage]
}

module "container_apps_env" {
  source                     = "../../modules/container-apps-env"
  env                        = local.env
  location                   = local.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = var.log_analytics_workspace_id
  tags                       = local.tags
}

module "chat_api" {
  source              = "../../modules/container-app"
  app_name            = "chat-api"
  env                 = local.env
  resource_group_name = azurerm_resource_group.main.name
  environment_id      = module.container_apps_env.id
  managed_identity_id = module.identity.id
  acr_login_server    = var.acr_login_server
  image_name          = "chat-api"
  image_tag           = var.chat_api_image_tag
  port                = 3001
  cpu                 = 1.0
  memory              = "2Gi"
  min_replicas        = 1 # Prod: always at least 1 instance to avoid cold starts
  max_replicas        = 10
  concurrent_requests = "20"
  environment_variables = [
    { name = "NODE_ENV", value = "production" },
    { name = "CHAT_API_PORT", value = "3001" },
    { name = "WEB_ORIGIN", value = "https://${module.chat_web.fqdn}" },
    { name = "AUTH_MODE", value = "entra" },
    { name = "KEY_VAULT_ENABLED", value = "true" },
    { name = "KEY_VAULT_URI", value = module.key_vault.uri },
    { name = "KEY_VAULT_ALLOW_LOCAL_FALLBACK", value = "false" },
    { name = "KEY_VAULT_CACHE_TTL_SECONDS", value = "300" },
    { name = "KEY_VAULT_SECRET_ENTRA_TENANT_ID", value = "entra-tenant-id" },
    { name = "KEY_VAULT_SECRET_ENTRA_ISSUER", value = "entra-issuer" },
    { name = "KEY_VAULT_SECRET_ENTRA_AUDIENCE", value = "entra-audience" },
    { name = "KEY_VAULT_SECRET_ENTRA_JWKS_URI", value = "entra-jwks-uri" },
    { name = "KEY_VAULT_SECRET_COSMOS_ENDPOINT", value = "cosmos-endpoint" },
    { name = "COSMOS_DATABASE_ID", value = "chat-app" },
    { name = "COSMOS_MESSAGES_CONTAINER_ID", value = "messages" },
    { name = "COSMOS_USERS_CONTAINER_ID", value = "users" },
    { name = "COSMOS_ROOMS_CONTAINER_ID", value = "rooms" },
    { name = "COSMOS_MEMBERSHIPS_CONTAINER_ID", value = "room_memberships" },
    { name = "AZURE_CLIENT_ID", value = module.identity.client_id },
    { name = "AZURE_STORAGE_ACCOUNT_NAME", value = module.storage.name },
    { name = "AZURE_STORAGE_CONTAINER_NAME", value = "chat-files" },
    { name = "FOUNDRY_AI_CHAT_ENDPOINT", value = "${data.azurerm_cognitive_account.openai.endpoint}openai/responses?api-version=2025-04-01-preview" },
    { name = "FOUNDRY_AI_CHAT_DEPLOYMENT", value = var.openai_chat_deployment },
    { name = "FOUNDRY_AI_ACTION_ENDPOINT", value = "${data.azurerm_cognitive_account.openai.endpoint}openai/responses?api-version=2025-04-01-preview" },
    { name = "FOUNDRY_AI_ACTION_DEPLOYMENT", value = var.openai_action_deployment },
    # gpt-image-2 is rate-limited to 2 req/min — application must queue image generation requests
    { name = "FOUNDRY_AI_IMAGE_ENDPOINT", value = "${data.azurerm_cognitive_account.openai.endpoint}openai/deployments/${var.openai_image_deployment}/images/generations?api-version=2025-04-01-preview" },
    { name = "FOUNDRY_AI_IMAGE_DEPLOYMENT", value = var.openai_image_deployment },
    { name = "VIDEO_CALL_ENABLED", value = "true" },
    { name = "CHAT_LOG_LEVEL", value = "warn" },
    { name = "APPLICATIONINSIGHTS_CONNECTION_STRING", value = module.monitoring.connection_string },
  ]
  tags       = local.tags
  depends_on = [module.identity, module.key_vault]
}

module "chat_web" {
  source                = "../../modules/container-app"
  app_name              = "chat-web"
  env                   = local.env
  resource_group_name   = azurerm_resource_group.main.name
  environment_id        = module.container_apps_env.id
  managed_identity_id   = module.identity.id
  acr_login_server      = var.acr_login_server
  image_name            = "chat-web"
  image_tag             = var.chat_web_image_tag
  port                  = 3000
  cpu                   = 0.5
  memory                = "1Gi"
  min_replicas          = 1
  max_replicas          = 10
  environment_variables = [{ name = "NODE_ENV", value = "production" }]
  tags                  = local.tags
  depends_on            = [module.identity]
}
