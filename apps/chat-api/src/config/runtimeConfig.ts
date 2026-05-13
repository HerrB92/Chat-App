import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import logger from "../logger";

interface SecretSpec {
  targetEnv: string;
  secretName: string;
}

interface SecretCacheEntry {
  value: string;
  expiresAt: number;
}

interface SecretCache {
  getOrLoad(
    secretName: string,
    loader: (name: string) => Promise<string>
  ): Promise<{ value: string; source: string }>;
  set(secretName: string, value: string): void;
}

interface FetchedSecret {
  targetEnv: string;
  secretName: string;
  source: string;
}

interface KeyVaultEnabled {
  keyVaultEnabled: true;
  keyVaultUri: string;
  fetched: FetchedSecret[];
  cache: SecretCache;
  refreshIntervalSeconds: number;
  client: SecretClient;
  mode: "key_vault";
}

interface KeyVaultDisabled {
  keyVaultEnabled: false;
  keyVaultUri: string;
  fetched: FetchedSecret[];
  cache: null;
  refreshIntervalSeconds: number;
  mode: "env" | "env_fallback";
}

type RuntimeSecrets = KeyVaultEnabled | KeyVaultDisabled;

export interface CosmosConfig {
  connectionString: string | undefined;
  endpoint: string | undefined;
  key: string | undefined;
  databaseId: string;
  messagesContainerId: string;
  usersContainerId: string;
  roomsContainerId: string;
  membershipsContainerId: string;
}

export interface RuntimeConfig {
  port: number;
  webOrigin: string;
  authMode: string;
  cosmos: CosmosConfig;
  keyVault: {
    enabled: boolean;
    uri: string;
    fetched: FetchedSecret[];
    mode: string;
  };
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null || value === "") {
    return fallback;
  }
  return String(value).trim().toLowerCase() === "true";
}

function parseIntOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function isProductionLike(): boolean {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "production";
}

function shouldEnableKeyVault(): boolean {
  const raw = process.env.KEY_VAULT_ENABLED;
  if (raw == null || raw === "") {
    return isProductionLike() && Boolean(String(process.env.KEY_VAULT_URI || "").trim());
  }
  return parseBoolean(raw, false);
}

function shouldAllowLocalFallbackOnKeyVaultError(): boolean {
  const raw = process.env.KEY_VAULT_ALLOW_LOCAL_FALLBACK;
  if (raw == null || raw === "") {
    return !isProductionLike();
  }
  return parseBoolean(raw, !isProductionLike());
}

function buildSecretSpec(): SecretSpec[] {
  return [
    {
      targetEnv: "COSMOS_CONNECTION_STRING",
      secretName: String(process.env.KEY_VAULT_SECRET_COSMOS_CONNECTION_STRING || "").trim()
    },
    {
      targetEnv: "COSMOS_ENDPOINT",
      secretName: String(process.env.KEY_VAULT_SECRET_COSMOS_ENDPOINT || "").trim()
    },
    {
      targetEnv: "COSMOS_KEY",
      secretName: String(process.env.KEY_VAULT_SECRET_COSMOS_KEY || "").trim()
    },
    {
      targetEnv: "ENTRA_TENANT_ID",
      secretName: String(process.env.KEY_VAULT_SECRET_ENTRA_TENANT_ID || "").trim()
    },
    {
      targetEnv: "ENTRA_ISSUER",
      secretName: String(process.env.KEY_VAULT_SECRET_ENTRA_ISSUER || "").trim()
    },
    {
      targetEnv: "ENTRA_AUDIENCE",
      secretName: String(process.env.KEY_VAULT_SECRET_ENTRA_AUDIENCE || "").trim()
    },
    {
      targetEnv: "ENTRA_JWKS_URI",
      secretName: String(process.env.KEY_VAULT_SECRET_ENTRA_JWKS_URI || "").trim()
    }
  ].filter((entry) => entry.secretName);
}

function createSecretCache({ ttlSeconds }: { ttlSeconds: number }): SecretCache {
  const cache = new Map<string, SecretCacheEntry>();
  const ttlMs = Math.max(ttlSeconds, 0) * 1000;
  return {
    async getOrLoad(
      secretName: string,
      loader: (name: string) => Promise<string>
    ): Promise<{ value: string; source: string }> {
      const now = Date.now();
      const cached = cache.get(secretName);
      if (cached && cached.expiresAt > now) {
        return { value: cached.value, source: "cache" };
      }
      const value = await loader(secretName);
      cache.set(secretName, { value, expiresAt: now + ttlMs });
      return { value, source: "key_vault" };
    },
    set(secretName: string, value: string): void {
      cache.set(secretName, { value, expiresAt: Date.now() + ttlMs });
    }
  };
}

function buildConfigSnapshot(): Omit<RuntimeConfig, "keyVault"> {
  return {
    port: Number.parseInt(process.env.CHAT_API_PORT || "3001", 10),
    webOrigin: process.env.WEB_ORIGIN || "http://localhost:3000",
    authMode: String(process.env.AUTH_MODE || "entra").toLowerCase(),
    cosmos: {
      connectionString: process.env.COSMOS_CONNECTION_STRING,
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY,
      databaseId: process.env.COSMOS_DATABASE_ID || "chat_app",
      messagesContainerId: process.env.COSMOS_MESSAGES_CONTAINER_ID || "messages",
      usersContainerId: process.env.COSMOS_USERS_CONTAINER_ID || "users",
      roomsContainerId: process.env.COSMOS_ROOMS_CONTAINER_ID || "rooms",
      membershipsContainerId: process.env.COSMOS_MEMBERSHIPS_CONTAINER_ID || "room_memberships"
    }
  };
}

function validateConfig(
  config: Omit<RuntimeConfig, "keyVault">,
  { keyVaultEnabled }: { keyVaultEnabled: boolean }
): void {
  const hasConnectionString = Boolean(String(config.cosmos.connectionString || "").trim());
  const hasEndpoint = Boolean(String(config.cosmos.endpoint || "").trim());
  if (!hasConnectionString && !hasEndpoint) {
    const mode = keyVaultEnabled ? "Key Vault + env" : "env";
    throw new Error(
      `Cosmos configuration missing after ${mode} resolution. Set COSMOS_CONNECTION_STRING or COSMOS_ENDPOINT (with COSMOS_KEY for key-based auth, or without for Managed Identity).`
    );
  }
}

async function hydrateFromKeyVault(): Promise<RuntimeSecrets> {
  const keyVaultEnabled = shouldEnableKeyVault();
  const allowLocalFallback = shouldAllowLocalFallbackOnKeyVaultError();
  const keyVaultUri = String(process.env.KEY_VAULT_URI || "").trim();
  if (!keyVaultEnabled) {
    return {
      keyVaultEnabled: false,
      keyVaultUri: "",
      fetched: [],
      cache: null,
      refreshIntervalSeconds: 0,
      mode: "env"
    };
  }

  if (!keyVaultUri) {
    throw new Error("KEY_VAULT_ENABLED is true but KEY_VAULT_URI is missing.");
  }

  const cacheTtlSeconds = parseIntOrDefault(process.env.KEY_VAULT_CACHE_TTL_SECONDS, 300);
  const refreshIntervalSeconds = parseIntOrDefault(
    process.env.KEY_VAULT_REFRESH_INTERVAL_SECONDS,
    0
  );
  const secretSpec = buildSecretSpec();
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(keyVaultUri, credential);
  const cache = createSecretCache({ ttlSeconds: cacheTtlSeconds });
  const fetched: FetchedSecret[] = [];

  const loadSecretValue = async (secretName: string): Promise<string> => {
    const response = await client.getSecret(secretName);
    if (!response || typeof response.value !== "string" || !response.value.trim()) {
      throw new Error(`Key Vault secret "${secretName}" is empty or missing a value.`);
    }
    return response.value;
  };

  try {
    for (const secret of secretSpec) {
      const { value, source } = await cache.getOrLoad(secret.secretName, loadSecretValue);
      process.env[secret.targetEnv] = value;
      fetched.push({
        targetEnv: secret.targetEnv,
        secretName: secret.secretName,
        source
      });
    }
  } catch (error) {
    if (!allowLocalFallback) {
      throw error;
    }
    logger.warn(
      { reason: (error as Error).message },
      "Key Vault resolution failed; falling back to local env values. Set KEY_VAULT_ALLOW_LOCAL_FALLBACK=false to enforce fail-fast."
    );
    return {
      keyVaultEnabled: false,
      keyVaultUri: "",
      fetched: [],
      cache: null,
      refreshIntervalSeconds: 0,
      mode: "env_fallback"
    };
  }

  return {
    keyVaultEnabled: true,
    keyVaultUri,
    fetched,
    cache,
    refreshIntervalSeconds,
    client,
    mode: "key_vault"
  };
}

function startRefreshLoop(runtimeSecrets: RuntimeSecrets): NodeJS.Timeout | null {
  if (!runtimeSecrets.keyVaultEnabled) {
    return null;
  }

  const intervalSeconds = runtimeSecrets.refreshIntervalSeconds || 0;
  if (intervalSeconds <= 0) {
    return null;
  }

  const interval = setInterval(async () => {
    try {
      for (const fetched of runtimeSecrets.fetched) {
        const response = await runtimeSecrets.client.getSecret(fetched.secretName);
        if (typeof response.value === "string" && response.value.trim()) {
          runtimeSecrets.cache.set(fetched.secretName, response.value);
          process.env[fetched.targetEnv] = response.value;
        }
      }
      logger.info("Key Vault refresh completed. Restart service to guarantee all clients use updated secrets.");
    } catch (error) {
      logger.error({ err: error }, "Key Vault refresh failed");
    }
  }, intervalSeconds * 1000);

  interval.unref?.();
  return interval;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const runtimeSecrets = await hydrateFromKeyVault();
  const config = buildConfigSnapshot();
  validateConfig(config, { keyVaultEnabled: runtimeSecrets.keyVaultEnabled });
  startRefreshLoop(runtimeSecrets);

  return {
    ...config,
    keyVault: {
      enabled: runtimeSecrets.keyVaultEnabled,
      uri: runtimeSecrets.keyVaultUri,
      fetched: runtimeSecrets.fetched,
      mode: runtimeSecrets.mode || "env"
    }
  };
}
