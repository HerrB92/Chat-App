terraform {
  backend "azurerm" {
    resource_group_name  = "rg-chat-app-shared"
    storage_account_name = "stchatappterraform"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}
