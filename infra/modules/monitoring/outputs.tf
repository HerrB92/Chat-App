output "instrumentation_key" {
  value     = azurerm_application_insights.main.instrumentation_key
  sensitive = true
}
output "connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}
output "id" { value = azurerm_application_insights.main.id }
