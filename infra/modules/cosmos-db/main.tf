resource "azurerm_cosmosdb_account" "main" {
  name                = "cosmos-trainbb-chat-app-${var.env}"
  resource_group_name = var.resource_group_name
  location            = var.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  # Serverless: no minimum cost, pay only for actual RU usage (~$0.25/million RU)
  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.location
    failover_priority = 0
  }

  # Disable master keys — use Managed Identity + RBAC exclusively
  local_authentication_disabled = true

  # Free Tier: first 1000 RU/s + 25 GB free (max. 1 account per subscription)
  free_tier_enabled = var.enable_free_tier

  tags = var.tags
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = var.database_id
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.main.name
  # No throughput block for Serverless accounts
}

resource "azurerm_cosmosdb_sql_container" "messages" {
  name                = var.messages_container_id
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/conversationId"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "users" {
  name                = var.users_container_id
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/userId"]
}

resource "azurerm_cosmosdb_sql_container" "rooms" {
  name                = var.rooms_container_id
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/roomId"]
}

resource "azurerm_cosmosdb_sql_container" "memberships" {
  name                = var.memberships_container_id
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/roomId"]
}
