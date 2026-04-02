import type { AppSocket, SocketContext } from "./socketContext";
import logger from "../logger";

interface VideoPayload {
  toUserId?: string;
  sdp?: unknown;       // RTCSessionDescriptionInit — relayed as-is, no server-side validation needed
  candidate?: unknown; // RTCIceCandidateInit       — relayed as-is
}

export function registerVideoHandlers(socket: AppSocket, ctx: SocketContext): void {
  const { io, usersById, usersBySocketId } = ctx;

  /** Relay a socket event from the current socket's user to another user by userId. */
  function relay(toUserId: string | undefined, event: string, extra: Record<string, unknown>): void {
    if (!toUserId) return;
    const fromUserId = usersBySocketId.get(socket.id);
    if (!fromUserId) return;
    const target = usersById.get(toUserId);
    if (!target?.socketId) {
      logger.debug({ fromUserId, toUserId, event }, "[Video] relay target offline — dropped");
      return;
    }
    io.to(target.socketId).emit(event, { ...extra, fromUserId });
  }

  socket.on("video:call", ({ toUserId }: VideoPayload) => {
    const fromUserId = usersBySocketId.get(socket.id);
    const caller = fromUserId ? usersById.get(fromUserId) : undefined;
    logger.debug({ fromUserId, toUserId }, "[Video] video:call");
    relay(toUserId, "video:incoming", { fromDisplayName: caller?.displayName || fromUserId || "Unknown" });
  });

  socket.on("video:accept",  ({ toUserId }: VideoPayload) => { relay(toUserId, "video:accepted",  {}); });
  socket.on("video:offer",   ({ toUserId, sdp }: VideoPayload) => { relay(toUserId, "video:offer",   { sdp }); });
  socket.on("video:answer",  ({ toUserId, sdp }: VideoPayload) => { relay(toUserId, "video:answer",  { sdp }); });
  socket.on("video:ice",     ({ toUserId, candidate }: VideoPayload) => { relay(toUserId, "video:ice", { candidate }); });
  socket.on("video:hangup",  ({ toUserId }: VideoPayload) => { relay(toUserId, "video:hangup",  {}); });
  socket.on("video:reject",  ({ toUserId }: VideoPayload) => { relay(toUserId, "video:rejected", {}); });
}
