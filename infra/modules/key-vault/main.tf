data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                       = "kv-trainbb-chat-app-${var.env}"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true # RBAC instead of access policies
  soft_delete_retention_days = 7    # minimum to save cost; use 90 in prod
  purge_protection_enabled   = true # prevents accidental permanent deletion
  tags                       = var.tags
}

# GitHub Actions service principal: allowed to write secrets during terraform apply
resource "azurerm_role_assignment" "github_sp_secrets_officer" {
  count                = var.github_sp_object_id != "" ? 1 : 0
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.github_sp_object_id
}

# Secrets — all values come from terraform.tfvars (marked sensitive)
resource "azurerm_key_vault_secret" "secrets" {
  # Secret names are not sensitive; wrapping keys in nonsensitive() keeps them out of resource
  # instance keys while the values themselves remain sensitive through var.secrets[each.key].
  for_each     = nonsensitive(toset(keys(var.secrets)))
  name         = each.key
  value        = var.secrets[each.key]
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.github_sp_secrets_officer]
}
