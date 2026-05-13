output "id" { value = azurerm_cognitive_account.main.id }
output "name" { value = azurerm_cognitive_account.main.name }
output "endpoint" { value = azurerm_cognitive_account.main.endpoint }

output "chat_deployment_name" { value = azurerm_cognitive_deployment.chat.name }
output "action_deployment_name" { value = azurerm_cognitive_deployment.action.name }
output "image_deployment_name" {
  value = length(azurerm_cognitive_deployment.image) > 0 ? azurerm_cognitive_deployment.image[0].name : ""
}
