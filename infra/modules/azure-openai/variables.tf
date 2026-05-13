variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "chat_deployment_name" {
  type    = string
  default = "gpt-5.3-chat"
}

variable "chat_model_name" {
  type    = string
  default = "gpt-5.3-chat"
}

variable "chat_model_version" {
  type    = string
  default = "2026-03-03"
}

variable "action_deployment_name" {
  type    = string
  default = "gpt-5.4-nano"
}

variable "action_model_name" {
  type    = string
  default = "gpt-5.4-nano"
}

variable "action_model_version" {
  type    = string
  default = "2026-03-17"
}

variable "image_deployment_name" {
  type    = string
  default = "gpt-image-2"
}

variable "image_model_name" {
  type    = string
  default = "gpt-image-2"
}

variable "image_model_version" {
  type    = string
  default = "2026-04-21"
}

variable "tags" {
  type    = map(string)
  default = {}
}
