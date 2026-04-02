import { CosmosClient, Database, Container } from "@azure/cosmos";
import crypto from "crypto";
import { buildMembershipId } from "../../../../packages/shared/src/chatTypes";

interface CosmosChatStoreConfig {
  connectionString?: string;
  endpoint?: string;
  key?: string;
  databaseId?: string;
  messagesContainerId?: string;
  usersContainerId?: string;
  roomsContainerId?: string;
  membershipsContainerId?: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  avatar: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface Room {
  id: string;
  roomId: string;
  name: string;
  createdBy: string;
  /** Transferable owner — defaults to createdBy, can be reassigned by Team.Edit.All */
  ownerId: string;
  createdAt: string;
  isPrivate: boolean;
}

export interface Membership {
  id: string;
  roomId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  to: string | null;
  content: string;
  type: string;
  createdAt: string;
  editedAt: string | null;
  status: string;
}

interface SaveMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
  status?: string;
  to?: string | null;
  idempotencyKey?: string | null;
}

interface EnsureRoomInput {
  roomId: string;
  createdBy: string;
  isPrivate?: boolean;
  name?: string;
}

interface ListMessagesResult {
  items: ChatMessage[];
  continuation: string | null;
}

function parseIntOrDefault(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export class CosmosChatStore {
  private databaseId: string;
  private containerIds: {
    messages: string;
    users: string;
    rooms: string;
    memberships: string;
  };
  private client: CosmosClient;
  private rooms: Map<string, Room>;
  private membershipsByRoom: Map<string, Map<string, Membership>>;
  private usersCache: Map<string, UserProfile>;
  private containers!: { messages: Container; users: Container };

  constructor(config: CosmosChatStoreConfig) {
    const endpointInput = String(config.endpoint || "").trim();
    const keyInput = String(config.key || "").trim();
    const connectionStringInput = String(config.connectionString || "").trim();

    let endpoint = endpointInput;
    let key = keyInput;

    const candidateConnectionString =
      connectionStringInput || (endpointInput.includes("AccountEndpoint=") ? endpointInput : "");
    if (candidateConnectionString) {
      const endpointMatch = candidateConnectionString.match(/AccountEndpoint=([^;]+);?/i);
      const keyMatch = candidateConnectionString.match(/AccountKey=([^;]+);?/i);
      endpoint = endpointMatch ? endpointMatch[1].trim() : "";
      key = keyMatch ? keyMatch[1].trim() : "";
    }

    if (!endpoint || !key) {
      throw new Error(
        "Cosmos config missing. Set COSMOS_CONNECTION_STRING or COSMOS_ENDPOINT + COSMOS_KEY."
      );
    }

    this.databaseId = config.databaseId || "chat_app";
    this.containerIds = {
      messages: config.messagesContainerId || "messages",
      users: config.usersContainerId || "users",
      rooms: config.roomsContainerId || "rooms",
      memberships: config.membershipsContainerId || "room_memberships"
    };

    this.client = new CosmosClient({
      endpoint,
      key,
      consistencyLevel: "Session"
    });

    this.rooms = new Map();
    this.membershipsByRoom = new Map();
    this.usersCache = new Map();
  }

  async init(): Promise<void> {
    const { database } = await this.client.databases.createIfNotExists({ id: this.databaseId });

    const { container: messages } = await database.containers.createIfNotExists({
      id: this.containerIds.messages,
      partitionKey: { paths: ["/conversationId"] },
      indexingPolicy: {
        indexingMode: "consistent",
        includedPaths: [{ path: "/*" }]
      }
    });

    const { container: users } = await database.containers.createIfNotExists({
      id: this.containerIds.users,
      partitionKey: { paths: ["/userId"] }
    });

    this.containers = { messages, users };
    await this.loadUsersIntoCache();
  }

  private async loadUsersIntoCache(): Promise<void> {
    try {
      const iterator = this.containers.users.items.query<UserProfile>(
        { query: "SELECT * FROM c" },
        { maxItemCount: 500 }
      );
      let hasMore = true;
      while (hasMore) {
        const page = await iterator.fetchNext();
        for (const user of page.resources || []) {
          this.usersCache.set(user.userId, user);
        }
        hasMore = page.hasMoreResults;
      }
    } catch (_err) {
      // non-critical; cache fills as users log in
    }
  }

  async upsertUserProfile(userId: string, displayName = ""): Promise<UserProfile> {
    const now = new Date().toISOString();
    const doc: UserProfile = {
      id: userId,
      userId,
      displayName: displayName || userId,
      avatar: "",
      createdAt: now,
      lastSeenAt: now
    };

    try {
      const existing = await this.containers.users.item(userId, userId).read<UserProfile>();
      if (existing.resource) {
        doc.createdAt = existing.resource.createdAt || now;
        doc.avatar = existing.resource.avatar || "";
        doc.displayName = displayName || existing.resource.displayName || userId;
      }
    } catch (error) {
      if ((error as { code?: number }).code !== 404) {
        throw error;
      }
    }

    await this.containers.users.items.upsert(doc);
    this.usersCache.set(userId, doc);
    return doc;
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const response = await this.containers.users.item(userId, userId).read<UserProfile>();
      return response.resource ?? null;
    } catch (error) {
      if ((error as { code?: number }).code === 404) {
        return null;
      }
      throw error;
    }
  }

  async ensureRoom({ roomId, createdBy, isPrivate = false, name = "" }: EnsureRoomInput): Promise<Room> {
    const existing = this.rooms.get(roomId);
    if (existing) {
      return existing;
    }

    const room: Room = {
      id: roomId,
      roomId,
      name: name || roomId,
      createdBy,
      ownerId: createdBy,
      createdAt: new Date().toISOString(),
      isPrivate: Boolean(isPrivate)
    };
    this.rooms.set(roomId, room);
    return room;
  }

  async addRoomMember(roomId: string, userId: string, role = "member"): Promise<Membership> {
    const roomMembers = this.membershipsByRoom.get(roomId) || new Map<string, Membership>();
    const membershipId = buildMembershipId(roomId, userId);
    const existing = roomMembers.get(membershipId);
    if (existing) {
      return existing;
    }

    const membership: Membership = {
      id: membershipId,
      roomId,
      userId,
      role,
      joinedAt: new Date().toISOString()
    };
    roomMembers.set(membershipId, membership);
    this.membershipsByRoom.set(roomId, roomMembers);
    return membership;
  }

  async getRoomMembers(roomId: string): Promise<Membership[]> {
    const roomMembers = this.membershipsByRoom.get(roomId);
    return roomMembers ? Array.from(roomMembers.values()) : [];
  }

  async isRoomMember(roomId: string, userId: string): Promise<boolean> {
    const roomMembers = this.membershipsByRoom.get(roomId);
    if (!roomMembers) {
      return false;
    }
    return roomMembers.has(buildMembershipId(roomId, userId));
  }

  async saveMessage({
    conversationId,
    senderId,
    content,
    type = "CHAT",
    status = "sent",
    to = null,
    idempotencyKey = null
  }: SaveMessageInput): Promise<ChatMessage> {
    const createdAt = new Date().toISOString();
    const id = idempotencyKey
      ? `${conversationId}:${idempotencyKey}`
      : crypto.randomUUID();
    const doc: ChatMessage = {
      id,
      conversationId,
      senderId,
      to,
      content,
      type,
      createdAt,
      editedAt: null,
      status
    };

    try {
      const response = await this.containers.messages.items.create<ChatMessage>(doc);
      return response.resource!;
    } catch (error) {
      if ((error as { code?: number }).code !== 409 || !idempotencyKey) {
        throw error;
      }
      const existing = await this.containers.messages
        .item(id, conversationId)
        .read<ChatMessage>();
      return existing.resource!;
    }
  }

  updateRoom(roomId: string, patch: Partial<Pick<Room, "name" | "ownerId">>): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    const updated = { ...room, ...patch };
    this.rooms.set(roomId, updated);
    return updated;
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
    this.membershipsByRoom.delete(roomId);
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getAllPublicRooms(): Room[] {
    return Array.from(this.rooms.values()).filter((r) => !r.isPrivate);
  }

  async listMessages(
    conversationId: string,
    limit = 50,
    continuation: string | null = null
  ): Promise<ListMessagesResult> {
    const query = {
      query:
        "SELECT c.id, c.conversationId, c.senderId, c.to, c.content, c.type, c.createdAt, c.editedAt, c.status " +
        "FROM c WHERE c.conversationId = @conversationId ORDER BY c.createdAt DESC",
      parameters: [{ name: "@conversationId", value: conversationId }]
    };

    const iterator = this.containers.messages.items.query<ChatMessage>(query, {
      partitionKey: conversationId,
      maxItemCount: limit,
      continuationToken: continuation || undefined
    });

    const page = await iterator.fetchNext();
    return {
      items: (page.resources || []).reverse(),
      continuation: page.continuationToken || null
    };
  }

  listUsers(query = "", limit = 20, continuation: string | null = null): { items: Pick<UserProfile, "userId" | "displayName">[]; continuation: string | null } {
    const q = query.trim().toLowerCase();
    let all = Array.from(this.usersCache.values());
    if (q) {
      all = all.filter(u =>
        u.displayName.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q)
      );
    }
    all.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const offset = continuation ? (Number.parseInt(continuation, 10) || 0) : 0;
    const page = all.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      items: page.map(u => ({ userId: u.userId, displayName: u.displayName })),
      continuation: nextOffset < all.length ? String(nextOffset) : null
    };
  }

  getRoomsForUser(userId: string): Room[] {
    const result: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPrivate) continue;
      const roomMembers = this.membershipsByRoom.get(room.roomId);
      if (room.ownerId === userId) {
        result.push(room);
        continue;
      }
      if (!roomMembers) continue;
      if (roomMembers.has(buildMembershipId(room.roomId, userId))) {
        result.push(room);
      }
    }
    return result;
  }

  getUserDisplayName(userId: string): string {
    return this.usersCache.get(userId)?.displayName || userId;
  }

  async removeRoomMember(roomId: string, userId: string): Promise<void> {
    const roomMembers = this.membershipsByRoom.get(roomId);
    if (!roomMembers) return;
    const membershipId = buildMembershipId(roomId, userId);
    roomMembers.delete(membershipId);
  }

  async setRoomMembers(
    roomId: string,
    members: Array<{ userId: string; role: string }>
  ): Promise<void> {
    const roomMembers = new Map<string, Membership>();
    for (const member of members) {
      const membershipId = buildMembershipId(roomId, member.userId);
      roomMembers.set(membershipId, {
        id: membershipId,
        roomId,
        userId: member.userId,
        role: member.role || "member",
        joinedAt: new Date().toISOString()
      });
    }
    this.membershipsByRoom.set(roomId, roomMembers);
  }
}

