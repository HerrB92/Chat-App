variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "log_analytics_workspace_id" {
  type = string
}

variable "infrastructure_subnet_id" {
  type        = string
  description = "Subnet ID for VNet integration (leave empty for Consumption plan without VNet)"
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
