variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "key_vault_id" {
  type = string
}

variable "cosmos_account_id" {
  type = string
}

variable "cosmos_account_name" {
  type = string
}

variable "storage_account_id" {
  type = string
}

variable "acr_id" {
  type = string
}

variable "openai_account_id" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
