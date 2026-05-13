resource "azurerm_container_app_environment" "main" {
  name                       = "cae-trainbb-chat-app-${var.env}"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  log_analytics_workspace_id = var.log_analytics_workspace_id

  # Consumption plan without VNet integration (cost-optimised for dev/test).
  # For prod: set infrastructure_subnet_id and add a VNet module.
  infrastructure_subnet_id = var.infrastructure_subnet_id != "" ? var.infrastructure_subnet_id : null

  tags = var.tags
}
