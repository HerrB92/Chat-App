output "chat_api_url" {
  value       = module.chat_api.url
  description = "chat-api container app URL — add as redirect URI in Entra App Registration"
}

output "chat_web_url" {
  value       = module.chat_web.url
  description = "chat-web container app URL — add to Entra redirect URIs and chat-api WEB_ORIGIN"
}

output "key_vault_uri" {
  value       = module.key_vault.uri
  description = "Key Vault URI"
}

output "cosmos_endpoint" {
  value       = module.cosmos_db.endpoint
  description = "Cosmos DB endpoint"
}

output "openai_endpoint" {
  value       = data.azurerm_cognitive_account.openai.endpoint
  description = "Azure OpenAI endpoint (shared train-bb-ai-services)"
}

output "managed_identity_client_id" {
  value       = module.identity.client_id
  description = "Managed Identity client ID (set as AZURE_CLIENT_ID env var)"
}

output "acr_login_server" {
  value       = var.acr_login_server
  description = "ACR login server for Docker push"
}
