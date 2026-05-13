variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "chat_files_container_name" {
  type    = string
  default = "chat-files"
}

variable "tags" {
  type    = map(string)
  default = {}
}
