import { Router } from "express";
import type { Request, Response } from "express";
import type { CosmosChatStore, ChatMessage } from "../store/cosmosChatStore";

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

export function createRoomRouter(store: CosmosChatStore): Router {
  const router = Router();

  router.get("/:roomId/messages", async (req: Request, res: Response) => {
    const roomId = String(req.params["roomId"] || "").trim();
    const userId = req.user!.oid;
    const isMember = await store.isRoomMember(roomId, userId);
    if (!isMember) { res.status(403).json({ ok: false, error: "You are not a member of this room." }); return; }

    const limit = Math.min(Math.max(Number.parseInt(String(req.query["limit"] || "50"), 10), 1), 100);
    const continuation = String(req.query["continuation"] || "").trim() || null;
    const result = await store.listMessages(roomId, limit, continuation);
    res.json({ ok: true, messages: result.items.map(toClientMessage), continuation: result.continuation });
  });

  router.get("/:roomId/members", async (req: Request, res: Response) => {
    const roomId = String(req.params["roomId"] || "").trim();
    const userId = req.user!.oid;
    const isMember = await store.isRoomMember(roomId, userId);
    if (!isMember) { res.status(403).json({ ok: false, error: "You are not a member of this room." }); return; }

    const rawMembers = await store.getRoomMembers(roomId);
    const members = rawMembers.map((m) => ({
      userId: m.userId,
      role: m.role,
      displayName: store.getUserDisplayName(m.userId)
    }));
    res.json({ ok: true, members });
  });

  router.post("/:roomId/members", async (req: Request, res: Response) => {
    const roomId = String(req.params["roomId"] || "").trim();
    const body = req.body as Record<string, unknown>;
    const targetUserId = String(body?.["userId"] || "").trim();
    const role = String(body?.["role"] || "member").trim() || "member";

    if (!targetUserId) { res.status(400).json({ ok: false, error: "userId is required." }); return; }

    const requesterIsMember = await store.isRoomMember(roomId, req.user!.oid);
    if (!requesterIsMember) { res.status(403).json({ ok: false, error: "You are not a member of this room." }); return; }

    await store.addRoomMember(roomId, targetUserId, role);
    res.status(201).json({ ok: true });
  });

  return router;
}
