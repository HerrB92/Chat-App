# Shared Resource Group
resource "azurerm_resource_group" "shared" {
  name     = "rg-chat-app-shared"
  location = var.location
  tags     = local.tags
}

# Terraform State Backend
resource "azurerm_storage_account" "tfstate" {
  name                            = "stchatappterraform"
  resource_group_name             = azurerm_resource_group.shared.name
  location                        = azurerm_resource_group.shared.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"   # GRS recommended for prod; LRS saves cost here
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true   # allows recovery of older state versions
  }

  tags = local.tags
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_name  = azurerm_storage_account.tfstate.name
  container_access_type = "private"
}

# Azure Container Registry (shared across all environments)
resource "azurerm_container_registry" "main" {
  name                = "chatappacr"   # must be globally unique — add a suffix if needed
  resource_group_name = azurerm_resource_group.shared.name
  location            = azurerm_resource_group.shared.location
  sku                 = "Basic"        # ~$5/month; Standard adds geo-replication (higher cost)
  admin_enabled       = false          # no username/password — Managed Identity + OIDC only

  tags = local.tags
}

# Log Analytics Workspace (shared)
resource "azurerm_log_analytics_workspace" "shared" {
  name                = "law-chat-app-shared"
  resource_group_name = azurerm_resource_group.shared.name
  location            = azurerm_resource_group.shared.location
  sku                 = "PerGB2018"
  retention_in_days   = 30    # minimum to save cost; 90 recommended for prod

  tags = local.tags
}

# Locals
locals {
  tags = {
    project     = "chat-app"
    managed_by  = "terraform"
    environment = "shared"
  }
}
