resource "azurerm_container_app" "main" {
  name                         = "ca-trainbb-${var.app_name}-${var.env}"
  container_app_environment_id = var.environment_id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [var.managed_identity_id]
  }

  # ACR access via Managed Identity — no username/password
  registry {
    server   = var.acr_login_server
    identity = var.managed_identity_id
  }

  template {
    min_replicas = var.min_replicas # 0 = scale to zero when idle
    max_replicas = var.max_replicas

    container {
      name   = var.app_name
      image  = "${var.acr_login_server}/${var.image_name}:${var.image_tag}"
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name        = env.value.name
          value       = lookup(env.value, "value", null)
          secret_name = lookup(env.value, "secret_name", null)
        }
      }
    }

    # Scale up on incoming requests, scale down after inactivity
    http_scale_rule {
      name                = "http-scale"
      concurrent_requests = var.concurrent_requests
    }
  }

  ingress {
    external_enabled           = true
    target_port                = var.port
    transport                  = "http" # supports WebSocket upgrade (Socket.io)
    allow_insecure_connections = false

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  tags = var.tags
}
