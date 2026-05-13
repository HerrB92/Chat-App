resource "azurerm_application_insights" "main" {
  name                = "appi-trainbb-chat-app-${var.env}"
  resource_group_name = var.resource_group_name
  location            = var.location
  workspace_id        = var.log_analytics_workspace_id
  application_type    = "Node.JS"
  tags                = var.tags
}
