resource "azurerm_storage_account" "main" {
  # lowercase, max 24 chars, globally unique
  name                            = "sttrainbbchatapp${var.env}"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = var.env == "prod" ? "GRS" : "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  tags = var.tags
}

resource "azurerm_storage_container" "chat_files" {
  name               = var.chat_files_container_name
  storage_account_id = azurerm_storage_account.main.id
  # container_access_type defaults to "private"; no need to set explicitly in v4+
}
