import http from "http";
import path from "path";

require("dotenv").config({
  path: process.env.CHAT_API_ENV_FILE || path.resolve(__dirname, "../.env")
});

import express, { Request, Response, NextFunction } from "express";
import logger from "./logger";
import cors from "cors";
import { Server } from "socket.io";
import { CosmosChatStore } from "./store/cosmosChatStore";
import { loadRuntimeConfig } from "./config/runtimeConfig";
import { authenticateExpress, authenticateSocket } from "./auth/entraAuth";
import { createAiRouter } from "./routes/aiRoutes";
import { createUserRouter, createAuthRouter } from "./routes/userRoutes";
import { createRoomRouter } from "./routes/roomRoutes";
import { createStorageRouter } from "./routes/storageRoutes";
import { registerUserHandlers } from "./socket/userHandlers";
import { registerTeamHandlers } from "./socket/teamHandlers";
import { registerChatHandlers } from "./socket/chatHandlers";
import { registerVideoHandlers } from "./socket/videoHandlers";
import type { NormalizedClaims } from "./types";
import type { UserEntry, SocketContext } from "./socket/socketContext";

function getUserFromRequest(req: Request, authMode: string): NormalizedClaims | null {
  if (authMode === "legacy") {
    const userId = String(req.header("x-user-id") || "").trim();
    if (!userId) return null;
    return { oid: userId, tid: "", name: userId, preferredUsername: "", roles: [] };
  }
  return req.auth || null;
}

function createRequireUser(authMode: string) {
  return function requireUser(req: Request, res: Response, next: NextFunction): void {
    const user = getUserFromRequest(req, authMode);
    if (!user) {
      res.status(401).json({ ok: false, error: "Missing authenticated user." });
      return;
    }
    req.user = user;
    next();
  };
}

async function main(): Promise<void> {
  const runtimeConfig = await loadRuntimeConfig();
  const { port, webOrigin, authMode } = runtimeConfig;
  const requireUser = createRequireUser(authMode);

  const store = new CosmosChatStore({
    connectionString: runtimeConfig.cosmos.connectionString,
    endpoint: runtimeConfig.cosmos.endpoint,
    key: runtimeConfig.cosmos.key,
    databaseId: runtimeConfig.cosmos.databaseId,
    messagesContainerId: runtimeConfig.cosmos.messagesContainerId,
    usersContainerId: runtimeConfig.cosmos.usersContainerId,
    roomsContainerId: runtimeConfig.cosmos.roomsContainerId,
    membershipsContainerId: runtimeConfig.cosmos.membershipsContainerId
  });

  await store.init();

  const app = express();
  app.use(cors({ origin: webOrigin }));
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "chat-api", authMode, health: "/health" });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, authMode });
  });

  // Debug endpoint — only available outside production
  if (process.env.NODE_ENV !== "production") {
    app.get("/debug/me", requireUser, (req, res) => {
      res.json({ ok: true, claims: req.user });
    });
  }

  if (authMode !== "legacy") {
    app.use(authenticateExpress);
  }

  app.use("/users", requireUser, createUserRouter(store));
  app.use("/auth", requireUser, createAuthRouter(store));
  app.use("/rooms", requireUser, createRoomRouter(store));
  app.use("/ai", requireUser, createAiRouter());
  app.use("/storage", requireUser, createStorageRouter(store));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: webOrigin } });

  if (authMode !== "legacy") {
    io.use(authenticateSocket);
  }

  const usersById = new Map<string, UserEntry>();
  const usersBySocketId = new Map<string, string>();

  const broadcastUsers = (): void => {
    io.emit(
      "users_online",
      Array.from(usersById.values()).map((u) => ({ userId: u.userId, displayName: u.displayName }))
    );
  };

  const broadcastRooms = (): void => {
    for (const { userId, socketId } of usersById.values()) {
      io.to(socketId).emit("rooms_updated", store.getRoomsForUser(userId));
    }
  };

  const videoCallEnabled = String(process.env.VIDEO_CALL_ENABLED ?? "true").toLowerCase() !== "false";
  logger.info({ videoCallEnabled }, "Feature flags");

  io.on("connection", (socket) => {
    const ctx: SocketContext = { io, store, authMode, usersById, usersBySocketId, broadcastUsers, broadcastRooms };
    registerUserHandlers(socket, ctx);
    registerTeamHandlers(socket, ctx);
    registerChatHandlers(socket, ctx);
    if (videoCallEnabled) registerVideoHandlers(socket, ctx);
  });

  server.listen(port, () => {
    const keyVaultSource = runtimeConfig.keyVault.enabled
      ? "azure-key-vault"
      : runtimeConfig.keyVault.mode === "env_fallback"
        ? "env-fallback"
        : "env";
    logger.info(
      { port, authMode, secretSource: keyVaultSource, webOrigin: process.env["WEB_ORIGIN"] },
      "Chat API ready"
    );
    if (runtimeConfig.keyVault.enabled) {
      const fetchedKeys = runtimeConfig.keyVault.fetched.map((entry) => entry.targetEnv).join(", ");
      logger.info({ uri: runtimeConfig.keyVault.uri, loadedEnvKeys: fetchedKeys || "none" }, "Key Vault enabled");
    }
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "Failed to start chat-api");
  process.exit(1);
});
