variable "subscription_id" {
  type = string
}

variable "location" {
  type    = string
  default = "swedencentral"
}

variable "acr_login_server" {
  type = string
}

variable "acr_id" {
  type = string
}

variable "log_analytics_workspace_id" {
  type = string
}

variable "github_sp_object_id" {
  type    = string
  default = ""
}

# entra_issuer, entra_jwks_uri, and web_entra_authority are derived automatically in locals.
variable "entra_tenant_id" {
  type      = string
  sensitive = true
}

variable "entra_audience" {
  type      = string
  sensitive = true
}

variable "web_entra_client_id" {
  type      = string
  sensitive = true
}

variable "web_entra_scope" {
  type = string
}

variable "web_redirect_uri" {
  type    = string
  default = ""
}

variable "chat_api_image_tag" {
  type    = string
  default = "latest"
}

variable "chat_web_image_tag" {
  type    = string
  default = "latest"
}

# Shared Azure AI services (train_rsrc_foundry_swe)
variable "openai_account_name" {
  type    = string
  default = "train-bb-ai-services"
}

variable "openai_resource_group" {
  type    = string
  default = "train_rsrc_foundry_swe"
}

variable "openai_chat_deployment" {
  type    = string
  default = "gpt-5.3-chat"
}

variable "openai_action_deployment" {
  type    = string
  default = "gpt-5.4-nano"
}

# gpt-image-2 replaces dall-e-3 (deprecated since 2026-03-04); rate-limited to 2 req/min
variable "openai_image_deployment" {
  type    = string
  default = "gpt-image-2"
}
