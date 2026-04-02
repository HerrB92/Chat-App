import type { AppSocket, AckFn, SocketContext } from "./socketContext";

export function registerUserHandlers(socket: AppSocket, ctx: SocketContext): void {
  const { store, authMode, usersById, usersBySocketId, broadcastUsers } = ctx;

  socket.on("register", async (_rawUsername: string, ack?: AckFn) => {
    try {
      const auth =
        authMode === "legacy"
          ? {
              oid: String(_rawUsername || "").trim(),
              name: String(_rawUsername || "").trim()
            }
          : (socket.data.auth as { oid?: string; name?: string; preferredUsername?: string });

      const userId = String(auth?.oid || "").trim();
      const displayName = String(
        auth?.name || (auth as { preferredUsername?: string })?.preferredUsername || userId
      ).trim();
      const roles: string[] = Array.isArray((auth as { roles?: string[] })?.roles)
        ? (auth as { roles: string[] }).roles
        : [];

      if (!userId) {
        ack?.({ ok: false, error: "Authenticated user is required." });
        return;
      }

      await store.upsertUserProfile(userId, displayName);
      usersById.set(userId, { userId, displayName, socketId: socket.id, roles });
      usersBySocketId.set(socket.id, userId);

      ack?.({
        ok: true,
        username: displayName,
        userId,
        displayName,
        roles,
        rooms: store.getRoomsForUser(userId)
      });

      socket.broadcast.emit("system_message", `${displayName} joined`);
      broadcastUsers();
    } catch (_error) {
      ack?.({ ok: false, error: "Failed to register user." });
    }
  });

  socket.on("disconnect", () => {
    const userId = usersBySocketId.get(socket.id);
    if (!userId) return;
    const user = usersById.get(userId);
    usersBySocketId.delete(socket.id);
    usersById.delete(userId);
    if (user?.displayName) {
      socket.broadcast.emit("system_message", `${user.displayName} left`);
    }
    broadcastUsers();
  });
}
