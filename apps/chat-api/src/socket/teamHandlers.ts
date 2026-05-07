import { TEAM_ROLES } from "../../../../packages/shared/src/chatTypes";
import type { AppSocket, AckFn, SocketPayload, SocketContext } from "./socketContext";
import type { Room } from "../store/cosmosChatStore";

function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role);
}

function canEditTeam(roles: string[], ownerId: string, requesterId: string): boolean {
  if (hasRole(roles, TEAM_ROLES.EDIT_ALL)) return true;
  if (hasRole(roles, TEAM_ROLES.EDIT) && ownerId === requesterId) return true;
  return false;
}

export function registerTeamHandlers(socket: AppSocket, ctx: SocketContext): void {
  const { io, store, usersById, usersBySocketId, broadcastRooms } = ctx;

  socket.on("create_room", async (payload: SocketPayload, ack?: AckFn) => {
    const requesterId = usersBySocketId.get(socket.id);
    if (!requesterId) { ack?.({ ok: false, error: "You must register first." }); return; }

    const name = String(payload?.["name"] || "").trim();
    if (!name) { ack?.({ ok: false, error: "Room name is required." }); return; }

    const requester = usersById.get(requesterId);
    if (!hasRole(requester?.roles ?? [], TEAM_ROLES.EDIT) && !hasRole(requester?.roles ?? [], TEAM_ROLES.EDIT_ALL)) {
      ack?.({ ok: false, error: "You are not authorized to create teams." });
      return;
    }

    const roomId = `room:${name.toLowerCase().replace(/\s+/g, "-")}:${Date.now()}`;
    try {
      const room = await store.ensureRoom({ roomId, createdBy: requesterId, isPrivate: false, name });
      await store.addRoomMember(roomId, requesterId, "admin");
      broadcastRooms();
      ack?.({ ok: true, room });
    } catch (_error) {
      ack?.({ ok: false, error: "Failed to create room." });
    }
  });

  socket.on("update_room", async (payload: SocketPayload, ack?: AckFn) => {
    const requesterId = usersBySocketId.get(socket.id);
    if (!requesterId) { ack?.({ ok: false, error: "You must register first." }); return; }

    const roomId = String(payload?.["roomId"] || "").trim();
    const room = store.getRoom(roomId);
    if (!room) { ack?.({ ok: false, error: "Room not found." }); return; }

    const requester = usersById.get(requesterId);
    if (!canEditTeam(requester?.roles ?? [], room.ownerId, requesterId)) {
      ack?.({ ok: false, error: "You are not authorized to edit this team." });
      return;
    }

    const patch: Partial<Pick<Room, "name" | "ownerId">> = {};
    const newName = String(payload?.["name"] || "").trim();
    const newOwnerId = String(payload?.["ownerId"] || "").trim();
    const members = Array.isArray(payload?.["members"])
      ? (payload["members"] as Array<{ userId: string; role: string }>)
      : undefined;

    if (newName) patch.name = newName;
    if (newOwnerId && hasRole(requester?.roles ?? [], TEAM_ROLES.EDIT_ALL)) {
      patch.ownerId = newOwnerId;
    }

    try {
      if (Object.keys(patch).length > 0) {
        const updated = store.updateRoom(roomId, patch);
        if (newOwnerId) await store.addRoomMember(roomId, newOwnerId, "admin");
        broadcastRooms();
        if (members) await store.setRoomMembers(roomId, members);
        ack?.({ ok: true, room: updated });
        return;
      }
      if (members) {
        await store.setRoomMembers(roomId, members);
        broadcastRooms();
        ack?.({ ok: true, room });
        return;
      }
      ack?.({ ok: true, room });
    } catch (_error) {
      ack?.({ ok: false, error: "Failed to update room." });
    }
  });

  socket.on("delete_room", async (payload: SocketPayload, ack?: AckFn) => {
    const requesterId = usersBySocketId.get(socket.id);
    if (!requesterId) { ack?.({ ok: false, error: "You must register first." }); return; }

    const roomId = String(payload?.["roomId"] || "").trim();
    const room = store.getRoom(roomId);
    if (!room) { ack?.({ ok: false, error: "Room not found." }); return; }

    const requester = usersById.get(requesterId);
    if (!canEditTeam(requester?.roles ?? [], room.ownerId, requesterId)) {
      ack?.({ ok: false, error: "You are not authorized to delete this team." });
      return;
    }

    store.deleteRoom(roomId);
    io.to(roomId).emit("room_deleted", { roomId });
    broadcastRooms();
    ack?.({ ok: true });
  });
}
