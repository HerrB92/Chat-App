import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError, type AccountInfo } from "@azure/msal-browser";
import { io, type Socket } from "socket.io-client";
import {
  CHAT_ACTIONS,
  chatReducer,
  initialChatState,
  type ChatMessage,
  type TeamRoom
} from "../state/chatReducer";
import {
  buildActiveThread,
  buildConversations,
  getConnectingText,
  type ConversationEntry
} from "../state/selectors";
import { apiScope, loginRequest } from "../../auth/msalConfig";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

type CallState = "idle" | "calling" | "incoming" | "connecting" | "active";

interface CallInfo {
  peerId: string;
  peerDisplayName: string;
}

interface RegisterResult {
  ok: boolean;
  error?: string;
  roles?: string[];
  rooms?: TeamRoom[];
}

interface RoomActionResult {
  ok: boolean;
  room?: TeamRoom;
  error?: string;
}

interface OpenRoomResult {
  ok: boolean;
  roomId?: string;
  roomName?: string;
  isPrivate?: boolean;
  messages?: ChatMessage[];
  continuation?: string | null;
  error?: string;
}

interface CreateRoomResult {
  ok: boolean;
  room?: TeamRoom;
  error?: string;
}

interface SendResult {
  ok: boolean;
  error?: string;
}

export function useChatController() {
  const { instance } = useMsal();
  const apiBaseUrl = process.env.NEXT_PUBLIC_CHAT_API_URL || "http://localhost:3001";
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const createIdempotencyKey = (): string =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const socketRef = useRef<Socket | null>(null);
  const messageAreaRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<string>("");
  const userIdRef = useRef<string>("");
  const activeChatUserIdRef = useRef<string>("");
  const activeRoomIdRef = useRef<string>("");
  const authBootstrappedRef = useRef<boolean>(false);
  const msalInitPromiseRef = useRef<Promise<void> | null>(null);

  // Video call state & refs
  const [callState, setCallState] = useState<CallState>("idle");
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const selectedCameraIdRef = useRef<string>("");
  const selectedMicrophoneIdRef = useRef<string>("");

  const cleanupCall = (): void => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallState("idle");
    setCallInfo(null);
    setIsMicMuted(false);
    setIsCameraOff(false);
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
  };

  const loadDevices = async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableCameras(devices.filter((d) => d.kind === "videoinput"));
      setAvailableMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setAvailableSpeakers(devices.filter((d) => d.kind === "audiooutput"));
    } catch { /* ignore */ }
  };

  const getLocalMediaStream = async (): Promise<MediaStream> => {
    const videoConstraint: MediaTrackConstraints | boolean = selectedCameraIdRef.current
      ? { deviceId: { exact: selectedCameraIdRef.current } }
      : true;
    const audioConstraint: MediaTrackConstraints | boolean = selectedMicrophoneIdRef.current
      ? { deviceId: { exact: selectedMicrophoneIdRef.current } }
      : true;
    return navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint });
  };

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit("video:ice", { toUserId: peerId, candidate });
    };
    pc.ontrack = ({ streams }) => {
      if (remoteVideoRef.current && streams[0]) remoteVideoRef.current.srcObject = streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("active");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") cleanupCall();
    };
    return pc;
  };

  const ensureMsalInitialized = async (): Promise<void> => {
    if (!msalInitPromiseRef.current) {
      msalInitPromiseRef.current = instance.initialize();
    }
    await msalInitPromiseRef.current;
  };

  useEffect(() => { tokenRef.current = state.accessToken; }, [state.accessToken]);
  useEffect(() => { userIdRef.current = state.userId; }, [state.userId]);
  useEffect(() => { activeChatUserIdRef.current = state.activeChatUserId; }, [state.activeChatUserId]);
  useEffect(() => { activeRoomIdRef.current = state.activeRoomId; }, [state.activeRoomId]);

  useEffect(() => {
    const socket = io(apiBaseUrl, {
      transports: ["websocket"],
      autoConnect: false,
      auth: (cb: (data: { token: string }) => void) => {
        cb({ token: tokenRef.current });
      }
    });
    socketRef.current = socket;

    socket.on("private_message", (message: ChatMessage) => {
      dispatch({ type: CHAT_ACTIONS.MESSAGE_RECEIVED, payload: message });
      if (
        message.senderId !== userIdRef.current &&
        message.senderId !== activeChatUserIdRef.current
      ) {
        dispatch({ type: CHAT_ACTIONS.UNREAD_INCREMENT, payload: message.senderId });
      }
    });

    socket.on("room_message", (message: ChatMessage) => {
      dispatch({ type: CHAT_ACTIONS.MESSAGE_RECEIVED, payload: message });
      if (message.conversationId && message.conversationId !== activeRoomIdRef.current) {
        dispatch({ type: CHAT_ACTIONS.UNREAD_ROOM_INCREMENT, payload: message.conversationId });
      }
    });

    socket.on("system_message", (content: string) => {
      dispatch({ type: CHAT_ACTIONS.SYSTEM_MESSAGE_RECEIVED, payload: content });
    });

    socket.on("users_online", (users: unknown) => {
      dispatch({
        type: CHAT_ACTIONS.USERS_ONLINE_UPDATED,
        payload: (users as { userId: string; displayName: string }[]) || []
      });
    });

    socket.on("rooms_updated", (rooms: unknown) => {
      dispatch({ type: CHAT_ACTIONS.ROOMS_UPDATED, payload: (rooms as TeamRoom[]) || [] });
    });

    socket.on("room_deleted", ({ roomId }: { roomId: string }) => {
      dispatch({ type: CHAT_ACTIONS.ROOM_DELETED, payload: roomId });
    });

    socket.on("connect_error", () => {
      dispatch({ type: CHAT_ACTIONS.CONNECT_ERROR, payload: "Could not connect to server." });
    });

    // ── Video call signaling ──────────────────────────────────────────────
    socket.on("video:incoming", ({ fromUserId, fromDisplayName }: { fromUserId: string; fromDisplayName: string }) => {
      setCallState("incoming");
      setCallInfo({ peerId: fromUserId, peerDisplayName: fromDisplayName });
    });

    // Caller: callee accepted → get media, create offer
    socket.on("video:accepted", async ({ fromUserId }: { fromUserId: string }) => {
      try {
        await loadDevices();
        const stream = await getLocalMediaStream();
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const pc = createPeerConnection(fromUserId);
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("video:offer", { toUserId: fromUserId, sdp: offer });
        setCallState("connecting");
      } catch {
        cleanupCall();
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: "Camera/microphone access denied." });
      }
    });

    // Callee: received offer → create answer
    socket.on("video:offer", async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      try {
        const pc = createPeerConnection(fromUserId);
        pcRef.current = pc;
        localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("video:answer", { toUserId: fromUserId, sdp: answer });
        setCallState("active");
      } catch {
        cleanupCall();
      }
    });

    // Caller: received answer → set remote description
    socket.on("video:answer", async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      if (pcRef.current) await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socket.on("video:ice", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (pcRef.current && candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on("video:hangup",  () => { cleanupCall(); });
    socket.on("video:rejected", () => {
      cleanupCall();
      dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: "Call was declined." });
    });

    return () => { socket.disconnect(); };
  }, [apiBaseUrl]);

  useEffect(() => {
    const area = messageAreaRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [state.messages, state.activeChat, state.activeRoomId, state.aiTyping]);

  const conversations = useMemo(
    () => buildConversations(state.messages, state.usersOnline, state.userId, state.searchTerm),
    [state.messages, state.searchTerm, state.usersOnline, state.userId]
  );

  const activeThread = useMemo(
    () => buildActiveThread(state.messages, state.activeRoomId),
    [state.messages, state.activeRoomId]
  );

  const connectingText = useMemo(
    () => getConnectingText(state.errorText, state.statusText),
    [state.errorText, state.statusText]
  );

  const completeAuthSession = async (account: AccountInfo, accessToken: string): Promise<void> => {
    const userId =
      (account.idTokenClaims?.["oid"] as string | undefined) ||
      account.localAccountId ||
      account.homeAccountId;
    const username = account.name || account.username || userId;

    dispatch({ type: CHAT_ACTIONS.CONNECT_SUCCESS, payload: { userId, username, accessToken } });

    const syncResponse = await fetch(`${apiBaseUrl}/auth/sync-user`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!syncResponse.ok) {
      throw new Error("Failed to sync Entra user to backend profile store.");
    }

    const socket = socketRef.current;
    if (!socket) return;
    (socket as Socket & { auth: { token: string } }).auth = { token: accessToken };
    if (!socket.connected) socket.connect();
    socket.emit("register", null, (result: RegisterResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.CONNECT_ERROR, payload: result?.error || "Failed to register user." });
        return;
      }
      // Roles come from the Entra token claims — store them in state for UI permission checks
      if (result.roles) {
        dispatch({ type: CHAT_ACTIONS.CONNECT_SUCCESS, payload: { userId, username, accessToken, roles: result.roles } });
      }
      if (result.rooms) {
        dispatch({ type: CHAT_ACTIONS.ROOMS_UPDATED, payload: result.rooms });
      }
    });
  };

  const acquireAccessToken = async (account: AccountInfo): Promise<string> => {
    await ensureMsalInitialized();
    const tokenRequest = { ...loginRequest, account, scopes: apiScope ? [apiScope] : [] };
    try {
      const result = await instance.acquireTokenSilent(tokenRequest);
      return result.accessToken;
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error;
      const interactive = await instance.acquireTokenPopup(tokenRequest);
      return interactive.accessToken;
    }
  };

  useEffect(() => {
    if (authBootstrappedRef.current) return;
    authBootstrappedRef.current = true;

    const bootstrap = async (): Promise<void> => {
      try {
        await ensureMsalInitialized();
        const redirectResult = await instance.handleRedirectPromise();
        const account =
          redirectResult?.account ||
          instance.getActiveAccount() ||
          instance.getAllAccounts()[0];
        if (!account) return;

        dispatch({ type: CHAT_ACTIONS.CONNECT_START });
        instance.setActiveAccount(account);
        if (!apiScope) throw new Error("NEXT_PUBLIC_CHAT_API_SCOPE is not configured.");

        const accessToken = await acquireAccessToken(account);
        await completeAuthSession(account, accessToken);
      } catch (error) {
        dispatch({
          type: CHAT_ACTIONS.CONNECT_ERROR,
          payload: (error as Error)?.message || "Failed to complete sign-in redirect."
        });
      }
    };
    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);

  const signIn = async (): Promise<void> => {
    try {
      await ensureMsalInitialized();
      if (!apiScope) throw new Error("NEXT_PUBLIC_CHAT_API_SCOPE is not configured.");
      dispatch({ type: CHAT_ACTIONS.CONNECT_START });
      await instance.loginRedirect({ ...loginRequest, scopes: apiScope ? [apiScope] : [] });
    } catch (error) {
      dispatch({
        type: CHAT_ACTIONS.CONNECT_ERROR,
        payload: (error as Error)?.message || "Failed to sign in with Microsoft."
      });
    }
  };

  const signOut = async (): Promise<void> => {
    await ensureMsalInitialized();
    cleanupCall();
    const socket = socketRef.current;
    if (socket?.connected) socket.disconnect();
    dispatch({ type: CHAT_ACTIONS.SIGN_OUT });
    const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (account) await instance.logoutPopup({ account });
  };

  const loadRoomHistoryPage = async (roomId: string, continuation: string): Promise<void> => {
    const query = new URLSearchParams({ limit: "50" });
    if (continuation) query.set("continuation", continuation);

    const response = await fetch(
      `${apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/messages?${query}`,
      { headers: { Authorization: `Bearer ${state.accessToken}` } }
    );
    const result = await response.json() as {
      ok: boolean; error?: string; messages?: ChatMessage[]; continuation?: string | null;
    };
    if (!response.ok || !result?.ok) throw new Error(result?.error || "Failed to load room history.");
    dispatch({
      type: CHAT_ACTIONS.HISTORY_LOADED,
      payload: { roomId, messages: result.messages || [], continuation: result.continuation || null }
    });
  };

  type AiIntent =
    | { intent: "PreviousChat" }
    | { intent: "PreviousImage" }
    | { intent: "CurrentChat"; topic: string }
    | { intent: "CurrentImage"; topic: string }
    | { intent: "None" };

  const AI_TRIGGER = /^(hey|hi)\s+(chatti|chatty|chaty)(,|\s)/i;

  const classifyAiIntent = async (afterTrigger: string): Promise<AiIntent> => {
    try {
      const res = await fetch(`${apiBaseUrl}/ai/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.accessToken}`
        },
        body: JSON.stringify({ prompt: afterTrigger })
      });
      const data = await res.json() as { ok: boolean; intent?: string; topic?: string; error?: string };
      if (!res.ok || !data.ok) return { intent: "None" };

      const intent = data.intent || "None";
      if (intent === "CurrentChat" || intent === "CurrentImage") {
        return { intent: intent as "CurrentChat" | "CurrentImage", topic: data.topic || afterTrigger };
      }
      return { intent: intent as AiIntent["intent"] } as AiIntent;
    } catch {
      return { intent: "None" };
    }
  };

  const sendAiMessage = async (aiPrompt: string, isImage = false): Promise<void> => {
    dispatch({ type: CHAT_ACTIONS.AI_TYPING_START });
    try {
      const endpoint = isImage ? `${apiBaseUrl}/ai/image` : `${apiBaseUrl}/ai/chat`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.accessToken}` },
        body: JSON.stringify({ prompt: aiPrompt })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "AI request failed");
      }
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;

      const message = isImage ? data.imageUrl : data.response;
      const payload = {
        content: message || "(keine Antwort)",
        idempotencyKey: createIdempotencyKey(),
        type: isImage ? "IMAGE" : "CHAT"
      } as Record<string, unknown>;

      if (state.activeChatType === "team" && state.activeRoomId) {
        socket.emit("room_message", { roomId: state.activeRoomId, ...payload });
      } else if (state.activeChatUserId) {
        socket.emit("private_message", { toUserId: state.activeChatUserId, ...payload });
      }
    } catch (error) {
      dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: (error as Error).message || "AI call failed" });
    } finally {
      dispatch({ type: CHAT_ACTIONS.AI_TYPING_END });
    }
  };

  const sendMessage = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const content = state.messageInput.trim();
    const socket = socketRef.current;
    if (!socket || !socket.connected || !content) return;

    dispatch({ type: CHAT_ACTIONS.CLEAR_ERROR });

    // Check for AI trigger prefix
    if (AI_TRIGGER.test(content)) {
      const afterTrigger = content.replace(AI_TRIGGER, "").trim();
      dispatch({ type: CHAT_ACTIONS.SET_MESSAGE_INPUT, payload: "" });

      // Send the user's original message into chat before triggering AI
      const userMsgKey = createIdempotencyKey();
      if (state.activeChatType === "team" && state.activeRoomId) {
        socket.emit("room_message", { roomId: state.activeRoomId, content, idempotencyKey: userMsgKey });
      } else if (state.activeChatUserId) {
        socket.emit("private_message", { toUserId: state.activeChatUserId, content, idempotencyKey: userMsgKey });
      }

      const result = await classifyAiIntent(afterTrigger);

      if (result.intent === "None") {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: "Ich konnte Dich nicht verstehen." });
        return;
      }

      // Resolve previous message for intents that need it
      let previousMessage = "";
      if (result.intent === "PreviousChat" || result.intent === "PreviousImage") {
        if (state.activeChatType === "team" && state.activeRoomId) {
          const thread = state.messages.filter(
            (msg) => msg.type === "CHAT" && msg.conversationId === state.activeRoomId
          );
          previousMessage = thread[thread.length - 1]?.content || "";
        } else if (state.activeChatUserId) {
          const thread = state.messages.filter(
            (msg) =>
              msg.type === "CHAT" &&
              ((msg.senderId === state.userId && msg.toUserId === state.activeChatUserId) ||
               (msg.senderId === state.activeChatUserId && msg.toUserId === state.userId))
          );
          previousMessage = thread[thread.length - 1]?.content || "";
        }
      }

      let prompt = "";
      let isImage = false;
      switch (result.intent) {
        case "PreviousChat":
          prompt = `Was kannst Du zu folgendem sagen? ${previousMessage}`;
          break;
        case "PreviousImage":
          prompt = `Erzeuge ein Bild basierend auf folgendem: ${previousMessage}`;
          isImage = true;
          break;
        case "CurrentChat":
          prompt = `Erkläre bitte: ${result.topic}`;
          break;
        case "CurrentImage":
          prompt = result.topic;
          isImage = true;
          break;
      }

      await sendAiMessage(prompt, isImage);
      return;
    }

    if (state.activeChatType === "team" && state.activeRoomId) {
      socket.emit(
        "room_message",
        { roomId: state.activeRoomId, content, idempotencyKey: createIdempotencyKey() },
        (result: SendResult) => {
          if (!result?.ok) {
            dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to send message." });
          }
        }
      );
    } else {
      const toUserId = state.activeChatUserId.trim();
      if (!toUserId) return;
      socket.emit(
        "private_message",
        { toUserId, content, idempotencyKey: createIdempotencyKey() },
        (result: SendResult) => {
          if (!result?.ok) {
            dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to send message." });
          }
        }
      );
    }
    dispatch({ type: CHAT_ACTIONS.SET_MESSAGE_INPUT, payload: "" });
  };


  const sendFileAsMessage = async (file: File): Promise<void> => {
    const socket = socketRef.current;
    if (!socket) return;

    // For both team and private chats, activeRoomId holds the actual room ID
    // (set by HISTORY_LOADED). Using activeChatUserId for private chats would
    // send the peer's userId as contextId, which fails the isRoomMember check.
    const contextId = state.activeRoomId;
    if (!contextId) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (state.activeChatType === "team") formData.append("roomId", contextId);
      else formData.append("conversationId", contextId);

      const uploadRes = await fetch(`${apiBaseUrl}/storage/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.accessToken}` },
        body: formData
      });
      const uploadData = await uploadRes.json() as {
        ok: boolean; blobPath?: string; contentType?: string; error?: string;
      };
      if (!uploadRes.ok || !uploadData.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: uploadData.error || "Upload failed." });
        return;
      }

      // Encode blob reference as JSON so the receiver can fetch a SAS URL
      const isImage = uploadData.contentType?.startsWith("image/") ?? false;
      const content = JSON.stringify({
        _type: "file",
        blobPath: uploadData.blobPath,
        contextId,
        fileName: file.name,
        contentType: uploadData.contentType || ""
      });
      const msgType = isImage ? "IMAGE" : "CHAT";
      const key = createIdempotencyKey();

      if (state.activeChatType === "team" && contextId) {
        socket.emit("room_message", { roomId: contextId, content, idempotencyKey: key, type: msgType },
          (result: SendResult) => {
            if (!result?.ok) dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to send file." });
          }
        );
      } else if (state.activeChatUserId) {
        socket.emit("private_message", { toUserId: state.activeChatUserId, content, idempotencyKey: key, type: msgType },
          (result: SendResult) => {
            if (!result?.ok) dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to send file." });
          }
        );
      }
    } catch (error) {
      dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: (error as Error).message || "File upload failed." });
    }
  };

  const openConversation = (entry: ConversationEntry): void => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    socket.emit("open_room", { peerUserId: entry.userId }, async (result: OpenRoomResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to open room." });
        return;
      }
      dispatch({ type: CHAT_ACTIONS.SET_ACTIVE_CHAT, payload: { userId: entry.userId, displayName: entry.displayName } });
      dispatch({ type: CHAT_ACTIONS.UNREAD_RESET, payload: entry.userId });
      dispatch({
        type: CHAT_ACTIONS.HISTORY_LOADED,
        payload: { roomId: result.roomId!, messages: result.messages || [], continuation: result.continuation || null }
      });
      if (result.continuation) {
        try {
          await loadRoomHistoryPage(result.roomId!, result.continuation);
        } catch (error) {
          dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: (error as Error).message || "Failed to load extra history." });
        }
      }
    });
  };

  const openTeamRoom = (room: TeamRoom): void => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    socket.emit("open_room", { roomId: room.roomId }, async (result: OpenRoomResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to open room." });
        return;
      }
      dispatch({ type: CHAT_ACTIONS.SET_ACTIVE_TEAM_ROOM, payload: { roomId: room.roomId, roomName: room.name } });
      dispatch({ type: CHAT_ACTIONS.UNREAD_ROOM_RESET, payload: room.roomId });
      dispatch({
        type: CHAT_ACTIONS.HISTORY_LOADED,
        payload: { roomId: room.roomId, messages: result.messages || [], continuation: result.continuation || null }
      });
      if (result.continuation) {
        try {
          await loadRoomHistoryPage(room.roomId, result.continuation);
        } catch (error) {
          dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: (error as Error).message || "Failed to load extra history." });
        }
      }
    });
  };

  const createTeam = (name: string): void => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !name.trim()) return;

    socket.emit("create_room", { name: name.trim() }, (result: CreateRoomResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to create team." });
      }
    });
  };

  const renameTeam = (roomId: string, name: string): void => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !name.trim()) return;
    socket.emit("update_room", { roomId, name: name.trim() }, (result: RoomActionResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to rename team." });
      }
    });
  };

  const deleteTeam = (roomId: string): void => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit("delete_room", { roomId }, (result: RoomActionResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to delete team." });
      }
    });
  };

  const transferTeamOwner = (roomId: string, newOwnerId: string): void => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !newOwnerId.trim()) return;
    socket.emit("update_room", { roomId, ownerId: newOwnerId.trim() }, (result: RoomActionResult) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to transfer ownership." });
      }
    });
  };

  const setActiveNav = (value: string): void => {
    dispatch({ type: CHAT_ACTIONS.SET_ACTIVE_NAV, payload: value });
  };

  const setSearchTerm = (value: string): void => {
    dispatch({ type: CHAT_ACTIONS.SET_SEARCH_TERM, payload: value });
  };

  const setMessageInput = (value: string): void => {
    dispatch({ type: CHAT_ACTIONS.SET_MESSAGE_INPUT, payload: value });
  };

  const addEmoji = (emoji = " "): void => {
    const symbol = emoji && emoji !== "\u0000" ? emoji : "😀";
    setMessageInput(`${state.messageInput}${state.messageInput ? " " : ""}${symbol}`);
  };

  const fetchUsers = async (
    query = "",
    continuation: string | null = null
  ): Promise<{ users: Array<{ userId: string; displayName: string }>; continuation: string | null }> => {
    const queryParams = new URLSearchParams();
    if (query) queryParams.set("query", query);
    queryParams.set("limit", "20");
    if (continuation) queryParams.set("continuation", continuation);

    const response = await fetch(`${apiBaseUrl}/users?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${state.accessToken}` }
    });
    const data = (await response.json()) as {
      ok: boolean;
      users?: Array<{ userId: string; displayName: string }>;
      continuation?: string | null;
      error?: string;
    };
    if (!response.ok || !data?.ok) {
      throw new Error(data.error || "Failed to fetch users.");
    }
    return { users: data.users || [], continuation: data.continuation || null };
  };

  const getRoomMembers = async (roomId: string): Promise<Array<{ userId: string; role: string; displayName?: string }>> => {
    const response = await fetch(`${apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/members`, {
      headers: { Authorization: `Bearer ${state.accessToken}` }
    });
    const data = (await response.json()) as {
      ok: boolean;
      members?: Array<{ userId: string; role: string; displayName?: string }>;
      error?: string;
    };
    if (!response.ok || !data?.ok) {
      throw new Error(data.error || "Failed to fetch room members.");
    }
    return data.members || [];
  };

  const setRoomMembers = async (
    roomId: string,
    members: Array<{ userId: string; role: string }>
  ): Promise<void> => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    socket.emit("update_room", { roomId, members }, (result: { ok: boolean; error?: string }) => {
      if (!result?.ok) {
        dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: result?.error || "Failed to save room members." });
      }
    });
  };

  const openFilePicker = (): void => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) sendFileAsMessage(file);
    event.target.value = "";
  };

  const startVideoCall = (peerId: string, peerDisplayName: string): void => {
    if (!socketRef.current?.connected) return;
    setCallState("calling");
    setCallInfo({ peerId, peerDisplayName });
    socketRef.current.emit("video:call", { toUserId: peerId });
  };

  const acceptVideoCall = async (): Promise<void> => {
    if (!callInfo) return;
    try {
      await loadDevices();
      const stream = await getLocalMediaStream();
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setCallState("connecting");
      socketRef.current?.emit("video:accept", { toUserId: callInfo.peerId });
    } catch {
      cleanupCall();
      dispatch({ type: CHAT_ACTIONS.SEND_ERROR, payload: "Camera/microphone access denied." });
    }
  };

  const rejectVideoCall = (): void => {
    if (!callInfo) return;
    socketRef.current?.emit("video:reject", { toUserId: callInfo.peerId });
    cleanupCall();
  };

  const hangUpVideoCall = (): void => {
    if (!callInfo) return;
    socketRef.current?.emit("video:hangup", { toUserId: callInfo.peerId });
    cleanupCall();
  };

  const toggleMic = (): void => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMicMuted((prev) => !prev);
  };

  const toggleCamera = (): void => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsCameraOff((prev) => !prev);
  };

  const changeCamera = async (deviceId: string): Promise<void> => {
    setSelectedCameraId(deviceId);
    selectedCameraIdRef.current = deviceId;
    if (!localStreamRef.current || !pcRef.current) return;
    try {
      const newStream = await getLocalMediaStream();
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newVideoTrack);
      localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      const combined = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])]);
      localStreamRef.current = combined;
      if (localVideoRef.current) localVideoRef.current.srcObject = combined;
      newStream.getAudioTracks().forEach((t) => t.stop());
    } catch { /* ignore device errors */ }
  };

  const changeMicrophone = async (deviceId: string): Promise<void> => {
    setSelectedMicrophoneId(deviceId);
    selectedMicrophoneIdRef.current = deviceId;
    if (!localStreamRef.current || !pcRef.current) return;
    try {
      const newStream = await getLocalMediaStream();
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (!newAudioTrack) return;
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) await sender.replaceTrack(newAudioTrack);
      localStreamRef.current.getAudioTracks().forEach((t) => t.stop());
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const combined = new MediaStream([...(videoTrack ? [videoTrack] : []), newAudioTrack]);
      localStreamRef.current = combined;
      if (localVideoRef.current) localVideoRef.current.srcObject = combined;
      newStream.getVideoTracks().forEach((t) => t.stop());
    } catch { /* ignore device errors */ }
  };

  const stopScreenShare = async (): Promise<void> => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    if (!localStreamRef.current || !pcRef.current) return;
    const cameraTrack = localStreamRef.current.getVideoTracks()[0];
    if (cameraTrack) {
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(cameraTrack);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
  };

  const toggleScreenShare = async (): Promise<void> => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenStreamRef.current = screenStream;
      // When the user clicks "Stop sharing" in the browser's built-in bar
      screenTrack.addEventListener("ended", () => { void stopScreenShare(); });
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(screenTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      setIsScreenSharing(true);
    } catch { /* user cancelled or permission denied */ }
  };

  const changeSpeaker = async (deviceId: string): Promise<void> => {
    setSelectedSpeakerId(deviceId);
    if (remoteVideoRef.current && "setSinkId" in remoteVideoRef.current) {
      try {
        await (remoteVideoRef.current as HTMLVideoElement & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId);
      } catch { /* browser may not support setSinkId */ }
    }
  };

  return {
    state,
    conversations,
    activeThread,
    connectingText,
    messageAreaRef,
    fileInputRef,
    signIn,
    signOut,
    sendMessage,
    sendFileAsMessage,
    openConversation,
    openTeamRoom,
    createTeam,
    renameTeam,
    deleteTeam,
    transferTeamOwner,
    loadRoomHistoryPage,
    setActiveNav,
    setSearchTerm,
    setMessageInput,
    addEmoji,
    openFilePicker,
    handleFileChange,
    fetchUsers,
    getRoomMembers,
    setRoomMembers,
    callState,
    callInfo,
    localVideoRef,
    remoteVideoRef,
    isMicMuted,
    isCameraOff,
    availableCameras,
    availableMicrophones,
    availableSpeakers,
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,
    startVideoCall,
    acceptVideoCall,
    rejectVideoCall,
    hangUpVideoCall,
    toggleMic,
    toggleCamera,
    isScreenSharing,
    toggleScreenShare,
    changeCamera,
    changeMicrophone,
    changeSpeaker
  };
}
