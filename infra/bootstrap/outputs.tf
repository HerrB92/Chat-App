output "acr_login_server" {
  value       = azurerm_container_registry.main.login_server
  description = "ACR login server — copy into terraform.tfvars of all environments"
}

output "acr_id" {
  value       = azurerm_container_registry.main.id
  description = "ACR resource ID — used for RBAC assignments"
}

output "log_analytics_workspace_id" {
  value       = azurerm_log_analytics_workspace.shared.id
  description = "Log Analytics workspace ID — copy into terraform.tfvars of all environments"
}

output "tfstate_storage_account_name" {
  value       = azurerm_storage_account.tfstate.name
  description = "Storage account name for Terraform state"
}

output "tfstate_container_name" {
  value       = azurerm_storage_container.tfstate.name
  description = "Blob container name for Terraform state"
}
