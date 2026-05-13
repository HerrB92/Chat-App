variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "enable_free_tier" {
  type        = bool
  description = "Enable Free Tier (max. 1 account per subscription)"
  default     = false
}

variable "database_id" {
  type    = string
  default = "chat-app"
}

variable "messages_container_id" {
  type    = string
  default = "messages"
}

variable "users_container_id" {
  type    = string
  default = "users"
}

variable "rooms_container_id" {
  type    = string
  default = "rooms"
}

variable "memberships_container_id" {
  type    = string
  default = "room_memberships"
}

variable "tags" {
  type    = map(string)
  default = {}
}
