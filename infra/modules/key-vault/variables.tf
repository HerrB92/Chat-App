variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "github_sp_object_id" {
  type        = string
  description = "Object ID of the GitHub Actions service principal (for Secrets Officer role)"
  default     = ""
}

variable "secrets" {
  type        = map(string)
  description = "Key-value pairs of Key Vault secrets"
  sensitive   = true
  default     = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
