resource "azurerm_cognitive_account" "main" {
  name                  = "oai-chat-app-${var.env}"
  resource_group_name   = var.resource_group_name
  location              = var.location
  kind                  = "OpenAI"
  sku_name              = "S0"   # only available SKU for Azure OpenAI
  custom_subdomain_name = "oai-chat-app-${var.env}"

  # Public access disabled in prod; open in dev for easier testing
  public_network_access_enabled = var.env != "prod"

  tags = var.tags
}

# Only deploy models that are actually used (unused deployments consume PTU quota)
resource "azurerm_cognitive_deployment" "chat" {
  name                 = var.chat_deployment_name
  cognitive_account_id = azurerm_cognitive_account.main.id

  model {
    format  = "OpenAI"
    name    = var.chat_model_name
    version = var.chat_model_version
  }

  sku {
    name     = "Standard"   # pay-per-token, no minimum cost
    capacity = 10           # tokens per minute in thousands (10k TPM sufficient for dev)
  }
}

resource "azurerm_cognitive_deployment" "action" {
  name                 = var.action_deployment_name
  cognitive_account_id = azurerm_cognitive_account.main.id

  model {
    format  = "OpenAI"
    name    = var.action_model_name
    version = var.action_model_version
  }

  sku {
    name     = "Standard"
    capacity = 10
  }
}

resource "azurerm_cognitive_deployment" "image" {
  count                = var.image_deployment_name != "" ? 1 : 0
  name                 = var.image_deployment_name
  cognitive_account_id = azurerm_cognitive_account.main.id

  model {
    format  = "OpenAI"
    name    = var.image_model_name
    version = var.image_model_version
  }

  sku {
    name     = "Standard"
    capacity = 1
  }
}
