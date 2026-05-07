import jwt, { JwtHeader, SigningKeyCallback, JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { Request, Response, NextFunction } from "express";
import type { Socket } from "socket.io";
import type { NormalizedClaims } from "../types";

interface VerifierConfig {
  tenantId: string;
  issuers: string[];
  audience: string;
  jwksUri: string;
}

interface VerifierContext {
  config: VerifierConfig;
  client: ReturnType<typeof jwksClient>;
}

function buildVerifierConfig(): VerifierConfig {
  const tenantId = process.env.ENTRA_TENANT_ID || "";
  const explicitIssuer = process.env.ENTRA_ISSUER || "";
  const defaultIssuers: [string, ...string[]] | [] = tenantId
    ? [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`
      ]
    : [];
  const issuers: [string, ...string[]] | [] = explicitIssuer
    ? [explicitIssuer]
    : defaultIssuers;
  const audience = process.env.ENTRA_AUDIENCE || "";
  const jwksUri =
    process.env.ENTRA_JWKS_URI ||
    (tenantId
      ? `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
      : "");

  return { tenantId, issuers, audience, jwksUri };
}

let verifierContext: VerifierContext | null = null;
let verifierContextKey = "";

function getVerifierContext(): VerifierContext {
  const config = buildVerifierConfig();
  const contextKey = JSON.stringify(config);
  if (verifierContext && verifierContextKey === contextKey) {
    return verifierContext;
  }

  verifierContextKey = contextKey;
  verifierContext = {
    config,
    client: jwksClient({
      jwksUri: config.jwksUri,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10
    })
  };
  return verifierContext;
}

function getSigningKey(
  client: ReturnType<typeof jwksClient>,
  header: JwtHeader,
  callback: SigningKeyCallback
): void {
  client.getSigningKey(header.kid as string, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, key!.getPublicKey());
  });
}

function normalizeClaims(claims: JwtPayload): NormalizedClaims {
  return {
    oid: claims["oid"] as string,
    tid: claims["tid"] as string,
    name:
      (claims["name"] as string) ||
      (claims["preferred_username"] as string) ||
      (claims["upn"] as string) ||
      (claims["oid"] as string),
    preferredUsername:
      (claims["preferred_username"] as string) ||
      (claims["upn"] as string) ||
      "",
    roles: Array.isArray(claims["roles"]) ? (claims["roles"] as string[]) : []
  };
}

export function verifyAccessToken(token: string): Promise<NormalizedClaims> {
  const context = getVerifierContext();
  const verifierConfig = context.config;

  if (!verifierConfig.tenantId || !verifierConfig.audience || verifierConfig.issuers.length === 0) {
    throw new Error("Entra validation not configured. Set ENTRA_TENANT_ID and ENTRA_AUDIENCE.");
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => getSigningKey(context.client, header, callback),
      {
        algorithms: ["RS256"],
        issuer: verifierConfig.issuers as [string, ...string[]],
        audience: verifierConfig.audience
      },
      (err: jwt.VerifyErrors | null, decoded: jwt.JwtPayload | string | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        const payload = decoded as JwtPayload;
        if (!payload?.["oid"]) {
          reject(new Error("Token is missing oid claim."));
          return;
        }

        if (payload["tid"] !== verifierConfig.tenantId) {
          reject(new Error("Token tenant mismatch."));
          return;
        }

        resolve(normalizeClaims(payload));
      }
    );
  });
}

export async function authenticateExpress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = String(req.headers.authorization || "").trim();
    const [scheme, ...rest] = authHeader.split(/\s+/);
    const token = rest.join(" ").trim();
    if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
      res.status(401).json({ ok: false, error: "Missing or malformed bearer token." });
      return;
    }

    req.auth = await verifyAccessToken(token);
    next();
  } catch (_error) {
    res.status(401).json({ ok: false, error: "Invalid bearer token." });
  }
}

export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = String((socket.handshake.auth as Record<string, unknown>)?.token || "").trim();
    if (!token) {
      next(new Error("Missing bearer token."));
      return;
    }
    socket.data.auth = await verifyAccessToken(token);
    next();
  } catch (_error) {
    next(new Error("Invalid bearer token."));
  }
}
