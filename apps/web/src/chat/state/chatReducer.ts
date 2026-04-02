export { TEAM_ROLES } from "@chat-app/shared";

export const CHAT_ACTIONS = {
  CONNECT_START: "CONNECT_START",
  CONNECT_SUCCESS: "CONNECT_SUCCESS",
  CONNECT_ERROR: "CONNECT_ERROR",
  SET_ACTIVE_NAV: "SET_ACTIVE_NAV",
  SET_ACTIVE_CHAT: "SET_ACTIVE_CHAT",
  SET_ACTIVE_TEAM_ROOM: "SET_ACTIVE_TEAM_ROOM",
  SET_SEARCH_TERM: "SET_SEARCH_TERM",
  SET_MESSAGE_INPUT: "SET_MESSAGE_INPUT",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  HISTORY_LOADED: "HISTORY_LOADED",
  SYSTEM_MESSAGE_RECEIVED: "SYSTEM_MESSAGE_RECEIVED",
  USERS_ONLINE_UPDATED: "USERS_ONLINE_UPDATED",
  ROOMS_UPDATED: "ROOMS_UPDATED",
  ROOM_DELETED: "ROOM_DELETED",
  UNREAD_INCREMENT: "UNREAD_INCREMENT",
  UNREAD_RESET: "UNREAD_RESET",
  UNREAD_ROOM_INCREMENT: "UNREAD_ROOM_INCREMENT",
  UNREAD_ROOM_RESET: "UNREAD_ROOM_RESET",
  SEND_ERROR: "SEND_ERROR",
  CLEAR_ERROR: "CLEAR_ERROR",
  SIGN_OUT: "SIGN_OUT",
  AI_TYPING_START: "AI_TYPING_START",
  AI_TYPING_END: "AI_TYPING_END"
} as const;


export interface ChatMessage {
  id?: string;
  senderId: string;
  senderDisplayName?: string;
  toUserId?: string;
  toDisplayName?: string;
  content: string;
  type: "CHAT" | "SYSTEM" | "IMAGE";
  conversationId?: string;
  createdAt: string;
  status?: string;
}

export interface OnlineUser {
  userId: string;
  displayName: string;
}

export interface TeamRoom {
  id: string;
  roomId: string;
  name: string;
  createdBy: string;
  ownerId: string;
  createdAt: string;
  isPrivate: boolean;
}

export interface ChatState {
  userId: string;
  username: string;
  accessToken: string;
  userRoles: string[];
  activeNav: string;
  /** "chat" = private DM, "team" = public group room */
  activeChatType: "chat" | "team";
  activeChat: string;
  activeChatUserId: string;
  activeRoomId: string;
  activeRoomName: string;
  searchTerm: string;
  messageInput: string;
  messages: ChatMessage[];
  usersOnline: OnlineUser[];
  rooms: TeamRoom[];
  unreadByUserId: Record<string, number>;
  unreadByRoomId: Record<string, number>;
  roomContinuationById: Record<string, string | null>;
  statusText: string;
  errorText: string;
  aiTyping: boolean;
}

type ChatAction =
  | { type: "CONNECT_START" }
  | { type: "CONNECT_SUCCESS"; payload: { userId: string; username: string; accessToken: string; roles?: string[]; rooms?: TeamRoom[] } }
  | { type: "CONNECT_ERROR"; payload: string }
  | { type: "SET_ACTIVE_NAV"; payload: string }
  | { type: "SET_ACTIVE_CHAT"; payload: { userId: string; displayName: string } }
  | { type: "SET_ACTIVE_TEAM_ROOM"; payload: { roomId: string; roomName: string } }
  | { type: "SET_SEARCH_TERM"; payload: string }
  | { type: "SET_MESSAGE_INPUT"; payload: string }
  | { type: "MESSAGE_RECEIVED"; payload: ChatMessage }
  | { type: "HISTORY_LOADED"; payload: { roomId: string; messages: ChatMessage[]; continuation: string | null } }
  | { type: "SYSTEM_MESSAGE_RECEIVED"; payload: string }
  | { type: "USERS_ONLINE_UPDATED"; payload: OnlineUser[] }
  | { type: "ROOMS_UPDATED"; payload: TeamRoom[] }
  | { type: "ROOM_DELETED"; payload: string }
  | { type: "UNREAD_INCREMENT"; payload: string }
  | { type: "UNREAD_RESET"; payload: string }
  | { type: "UNREAD_ROOM_INCREMENT"; payload: string }
  | { type: "UNREAD_ROOM_RESET"; payload: string }
  | { type: "SEND_ERROR"; payload: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SIGN_OUT" }
  | { type: "AI_TYPING_START" }
  | { type: "AI_TYPING_END" };

export const initialChatState: ChatState = {
  userId: "",
  username: "",
  accessToken: "",
  userRoles: [],
  activeNav: "chat",
  activeChatType: "chat",
  activeChat: "",
  activeChatUserId: "",
  activeRoomId: "",
  activeRoomName: "",
  searchTerm: "",
  messageInput: "",
  messages: [],
  usersOnline: [],
  rooms: [],
  unreadByUserId: {},
  unreadByRoomId: {},
  roomContinuationById: {},
  statusText: "",
  errorText: "",
  aiTyping: false
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case CHAT_ACTIONS.CONNECT_START:
      return { ...state, statusText: "Signing in...", errorText: "" };
    case CHAT_ACTIONS.CONNECT_SUCCESS:
      return {
        ...state,
        userId: action.payload.userId,
        username: action.payload.username,
        accessToken: action.payload.accessToken,
        userRoles: action.payload.roles ?? state.userRoles,
        rooms: action.payload.rooms ?? state.rooms,
        statusText: "Connected",
        errorText: ""
      };
    case CHAT_ACTIONS.CONNECT_ERROR:
      return { ...state, statusText: "", errorText: action.payload };
    case CHAT_ACTIONS.SET_ACTIVE_NAV:
      return { ...state, activeNav: action.payload };
    case CHAT_ACTIONS.SET_ACTIVE_CHAT:
      return {
        ...state,
        activeChatType: "chat",
        activeChat: action.payload.displayName,
        activeChatUserId: action.payload.userId,
        activeRoomName: ""
      };
    case CHAT_ACTIONS.SET_ACTIVE_TEAM_ROOM:
      return {
        ...state,
        activeChatType: "team",
        activeRoomId: action.payload.roomId,
        activeRoomName: action.payload.roomName,
        activeChat: "",
        activeChatUserId: ""
      };
    case CHAT_ACTIONS.SET_SEARCH_TERM:
      return { ...state, searchTerm: action.payload };
    case CHAT_ACTIONS.SET_MESSAGE_INPUT:
      return { ...state, messageInput: action.payload };
    case CHAT_ACTIONS.MESSAGE_RECEIVED:
      if (state.messages.some((msg) => msg.id && msg.id === action.payload.id)) {
        return state;
      }
      return { ...state, messages: [...state.messages, action.payload] };
    case CHAT_ACTIONS.HISTORY_LOADED: {
      const incoming = action.payload.messages || [];
      const existingById = new Map<string, ChatMessage>(
        state.messages.filter((msg) => msg.id).map((msg) => [msg.id!, msg])
      );
      incoming.forEach((msg) => {
        if (msg.id) existingById.set(msg.id, msg);
      });
      const deduped = [
        ...state.messages.filter((msg) => !msg.id),
        ...Array.from(existingById.values())
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        ...state,
        messages: deduped,
        activeRoomId: action.payload.roomId || state.activeRoomId,
        roomContinuationById: {
          ...state.roomContinuationById,
          ...(action.payload.roomId
            ? { [action.payload.roomId]: action.payload.continuation || null }
            : {})
        }
      };
    }
    case CHAT_ACTIONS.SYSTEM_MESSAGE_RECEIVED:
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            senderId: "system",
            senderDisplayName: "System",
            content: action.payload,
            type: "SYSTEM",
            createdAt: new Date().toISOString()
          }
        ]
      };
    case CHAT_ACTIONS.USERS_ONLINE_UPDATED:
      return { ...state, usersOnline: action.payload };
    case CHAT_ACTIONS.ROOMS_UPDATED:
      return { ...state, rooms: action.payload };
    case CHAT_ACTIONS.ROOM_DELETED: {
      const deletedId = action.payload;
      return {
        ...state,
        rooms: state.rooms.filter((r) => r.roomId !== deletedId),
        activeRoomId: state.activeRoomId === deletedId ? "" : state.activeRoomId,
        activeRoomName: state.activeRoomId === deletedId ? "" : state.activeRoomName,
        activeChatType: state.activeRoomId === deletedId ? "chat" : state.activeChatType
      };
    }
    case CHAT_ACTIONS.UNREAD_INCREMENT: {
      const userId = action.payload;
      return {
        ...state,
        unreadByUserId: { ...state.unreadByUserId, [userId]: (state.unreadByUserId[userId] || 0) + 1 }
      };
    }
    case CHAT_ACTIONS.UNREAD_RESET: {
      const userId = action.payload;
      return { ...state, unreadByUserId: { ...state.unreadByUserId, [userId]: 0 } };
    }
    case CHAT_ACTIONS.UNREAD_ROOM_INCREMENT: {
      const roomId = action.payload;
      return {
        ...state,
        unreadByRoomId: { ...state.unreadByRoomId, [roomId]: (state.unreadByRoomId[roomId] || 0) + 1 }
      };
    }
    case CHAT_ACTIONS.UNREAD_ROOM_RESET: {
      const roomId = action.payload;
      return { ...state, unreadByRoomId: { ...state.unreadByRoomId, [roomId]: 0 } };
    }
    case CHAT_ACTIONS.SEND_ERROR:
      return { ...state, errorText: action.payload };
    case CHAT_ACTIONS.CLEAR_ERROR:
      return { ...state, errorText: "" };
    case CHAT_ACTIONS.SIGN_OUT:
      return { ...initialChatState };
    case CHAT_ACTIONS.AI_TYPING_START:
      return { ...state, aiTyping: true };
    case CHAT_ACTIONS.AI_TYPING_END:
      return { ...state, aiTyping: false };
    default:
      return state;
  }
}
