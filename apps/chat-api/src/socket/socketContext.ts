import type { Server, Socket } from "socket.io";
import type { CosmosChatStore } from "../store/cosmosChatStore";

export interface UserEntry {
  userId: string;
  displayName: string;
  socketId: string;
  roles: string[];
}

export interface SocketContext {
  io: Server;
  store: CosmosChatStore;
  authMode: string;
  usersById: Map<string, UserEntry>;
  usersBySocketId: Map<string, string>;
  broadcastUsers: () => void;
  broadcastRooms: () => void;
}

export type AckFn = (result: unknown) => void;
export type SocketPayload = Record<string, unknown>;
export type AppSocket = Socket;
