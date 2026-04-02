import { buildPrivateConversationId } from "../../../../packages/shared/src/chatTypes";
import type { AppSocket, AckFn, SocketPayload, SocketContext } from "./socketContext";
import type { ChatMessage } from "../store/cosmosChatStore";

interface MessageRecord extends ChatMessage {
  senderDisplayName?: string;
  toDisplayName?: string;
}

function toClientMessage(record: MessageRecord) {
  return {
    id: record.id,
    senderId: record.senderId,
    senderDisplayName: record.senderDisplayName || record.senderId,
    toUserId: record.to || "",
    toDisplayName: record.toDisplayName || "",
    content: record.content,
    type: record.type || "CHAT",
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    status: record.status
  };
}

async function ensurePrivateConversation(
  userAId: string,
  userBId: string,
  store: SocketContext["store"]
): Promise<string> {
  const roomId = buildPrivateConversationId(userAId, userBId);
  await store.ensureRoom({ roomId, createdBy: userAId, isPrivate: true, name: roomId });
  await store.addRoomMember(roomId, userAId, "member");
  await store.addRoomMember(roomId, userBId, "member");
  return roomId;
}

export function registerChatHandlers(socket: AppSocket, ctx: SocketContext): void {
  const { io, store, usersById, usersBySocketId } = ctx;

  socket.on("open_room", async (payload: SocketPayload, ack?: AckFn) => {
    const requesterId = usersBySocketId.get(socket.id);
    if (!requesterId) { ack?.({ ok: false, error: "You must register first." }); return; }

    try {
      let roomId = String(payload?.["roomId"] || "").trim();
      if (!roomId) {
        const peerUserId = String(payload?.["peerUserId"] || payload?.["peerUser"] || "").trim();
        if (!peerUserId) { ack?.({ ok: false, error: "roomId or peerUserId is required." }); return; }
        roomId = await ensurePrivateConversation(requesterId, peerUserId, store);
      } else {
        const member = await store.isRoomMember(roomId, requesterId);
        if (!member) {
          const room = store.getRoom(roomId);
          if (!room || room.isPrivate) { ack?.({ ok: false, error: "You are not a member of this room." }); return; }
          await store.addRoomMember(roomId, requesterId, "member");
        }
      }

      socket.join(roomId);
      const history = await store.listMessages(roomId, 50, null);
      const room = store.getRoom(roomId);
      ack?.({
        ok: true,
        roomId,
        roomName: room?.name ?? roomId,
        isPrivate: room?.isPrivate ?? true,
        messages: history.items.map(toClientMessage),
        continuation: history.continuation
      });
    } catch (_error) {
      ack?.({ ok: false, error: "Failed to open room." });
    }
  });

  socket.on("private_message", async (payload: SocketPayload, ack?: AckFn) => {
    const senderId = usersBySocketId.get(socket.id);
    if (!senderId) { ack?.({ ok: false, error: "You must register first." }); return; }

    const toUserId = String(payload?.["toUserId"] || payload?.["to"] || "").trim();
    const content = String(payload?.["content"] || "").trim();
    const idempotencyKey = String(payload?.["idempotencyKey"] || "").trim() || null;

    if (!toUserId || !content) { ack?.({ ok: false, error: "Recipient and message are required." }); return; }

    const target = usersById.get(toUserId);
    if (!target?.socketId) { ack?.({ ok: false, error: `${toUserId} is offline.` }); return; }

    try {
      const conversationId = await ensurePrivateConversation(senderId, toUserId, store);
      const senderProfile = usersById.get(senderId);
      const stored = await store.saveMessage({
        conversationId,
        senderId,
        to: toUserId,
        content,
        type: String(payload?.["type"] || "CHAT").toUpperCase(),
        status: "sent",
        idempotencyKey
      });
      const message = toClientMessage({
        ...stored,
        senderDisplayName: senderProfile?.displayName || senderId,
        toDisplayName: target.displayName || toUserId
      });
      io.to(target.socketId).emit("private_message", message);
      socket.emit("private_message", message);
      ack?.({ ok: true, message });
    } catch (_error) {
      ack?.({ ok: false, error: "Failed to send message." });
    }
  });

  socket.on("room_message", async (payload: SocketPayload, ack?: AckFn) => {
    const senderId = usersBySocketId.get(socket.id);
    if (!senderId) { ack?.({ ok: false, error: "You must register first." }); return; }

    const roomId = String(payload?.["roomId"] || "").trim();
    const content = String(payload?.["content"] || "").trim();
    const idempotencyKey = String(payload?.["idempotencyKey"] || "").trim() || null;

    if (!roomId || !content) { ack?.({ ok: false, error: "roomId and content are required." }); return; }

    const member = await store.isRoomMember(roomId, senderId);
    if (!member) { ack?.({ ok: false, error: "You are not a member of this room." }); return; }

    try {
      const senderProfile = usersById.get(senderId);
      const stored = await store.saveMessage({
        conversationId: roomId,
        senderId,
        content,
        type: String(payload?.["type"] || "CHAT").toUpperCase(),
        status: "sent",
        idempotencyKey
      });
      const message = toClientMessage({
        ...stored,
        senderDisplayName: senderProfile?.displayName || senderId
      });
      io.to(roomId).emit("room_message", message);
      ack?.({ ok: true, message });
    } catch (_error) {
      ack?.({ ok: false, error: "Failed to send room message." });
    }
  });
}
