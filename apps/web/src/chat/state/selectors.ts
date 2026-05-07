import type { ChatMessage, OnlineUser } from "./chatReducer";

export interface ConversationEntry {
  userId: string;
  displayName: string;
  lastMessage: string;
  createdAt: string;
}

export function buildConversations(
  messages: ChatMessage[],
  usersOnline: OnlineUser[],
  currentUserId: string,
  searchTerm: string
): ConversationEntry[] {
  const ownChats = messages.filter(
    (msg) =>
      msg.type === "CHAT" &&
      (msg.senderId === currentUserId || msg.toUserId === currentUserId)
  );

  // Collect the best-known display name for each peer across ALL messages.
  // toDisplayName is not persisted in the DB, so history messages for sent
  // messages only carry the userId. We prefer any real name we can find.
  const displayNameById = new Map<string, string>();
  ownChats.forEach((msg) => {
    const otherUserId = msg.senderId === currentUserId ? msg.toUserId! : msg.senderId;
    const name =
      msg.senderId === currentUserId ? msg.toDisplayName : msg.senderDisplayName;
    if (otherUserId && name && name !== otherUserId && !displayNameById.has(otherUserId)) {
      displayNameById.set(otherUserId, name);
    }
  });
  // usersOnline is the most up-to-date source — always wins
  usersOnline.forEach((u) => {
    if (u.userId !== currentUserId && u.displayName && u.displayName !== u.userId) {
      displayNameById.set(u.userId, u.displayName);
    }
  });

  const byUser = new Map<string, ConversationEntry>();

  ownChats.forEach((msg) => {
    const otherUserId = msg.senderId === currentUserId ? msg.toUserId! : msg.senderId;
    if (!otherUserId) {
      return;
    }

    const existing = byUser.get(otherUserId);
    if (!existing || new Date(msg.createdAt) > new Date(existing.createdAt)) {
      byUser.set(otherUserId, {
        userId: otherUserId,
        displayName: displayNameById.get(otherUserId) || otherUserId,
        lastMessage: msg.content,
        createdAt: msg.createdAt
      });
    }
  });

  usersOnline
    .filter((user) => user.userId !== currentUserId)
    .forEach((user) => {
      if (!byUser.has(user.userId)) {
        byUser.set(user.userId, {
          userId: user.userId,
          displayName: user.displayName || user.userId,
          lastMessage: "No messages yet",
          createdAt: new Date(0).toISOString()
        });
      }
    });

  return Array.from(byUser.values())
    .filter((entry) => entry.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function buildActiveThread(messages: ChatMessage[], activeRoomId: string): ChatMessage[] {
  if (!activeRoomId) {
    return [];
  }

  return messages.filter((msg) => {
    if (msg.type === "SYSTEM") {
      return true;
    }
    return (msg.type === "CHAT" || msg.type === "IMAGE") && msg.conversationId === activeRoomId;
  });
}

export function getConnectingText(errorText: string, statusText: string): string {
  return errorText || statusText;
}
