import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { ChatMessage } from "../state/chatReducer";

interface FileRef {
  _type: "file";
  blobPath: string;
  contextId: string;
  fileName: string;
  contentType: string;
}

function parseFileRef(content: string): FileRef | null {
  if (!content.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed["_type"] === "file") return parsed as unknown as FileRef;
  } catch {
    // not JSON
  }
  return null;
}

interface FileBubbleProps {
  fileRef: FileRef;
  accessToken: string;
  apiBaseUrl: string;
}

function FileBubble({ fileRef, accessToken, apiBaseUrl }: FileBubbleProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isImage = fileRef.contentType.startsWith("image/");

  const fetchUrl = async (): Promise<string | null> => {
    if (url) return url;
    setLoading(true);
    try {
      const params = new URLSearchParams({ blob: fileRef.blobPath, contextId: fileRef.contextId });
      const res = await fetch(`${apiBaseUrl}/storage/sas?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json() as { ok: boolean; url?: string };
      if (data.ok && data.url) {
        setUrl(data.url);
        return data.url;
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
    return null;
  };

  if (isImage) {
    return (
      <ImageBubble
        fileName={fileRef.fileName}
        fetchUrl={fetchUrl}
        loading={loading}
        resolvedUrl={url}
      />
    );
  }

  return (
    <div className="file-bubble">
      <span className="file-bubble-icon">📎</span>
      <span className="file-bubble-name">{fileRef.fileName}</span>
      <button
        type="button"
        className="file-bubble-btn"
        disabled={loading}
        onClick={async () => {
          const sasUrl = await fetchUrl();
          if (sasUrl) window.open(sasUrl, "_blank", "noopener");
        }}
      >
        {loading ? "…" : "Download"}
      </button>
    </div>
  );
}

interface ImageBubbleProps {
  fileName: string;
  fetchUrl: () => Promise<string | null>;
  loading: boolean;
  resolvedUrl: string | null;
}

function ImageBubble({ fileName, fetchUrl, loading, resolvedUrl }: ImageBubbleProps) {
  useEffect(() => { void fetchUrl(); }, []); // auto-load SAS URL on mount

  if (!resolvedUrl) {
    return (
      <span className="file-bubble file-bubble--image-placeholder">
        {loading ? "Loading…" : `🖼 ${fileName}`}
      </span>
    );
  }
  return <img src={resolvedUrl} alt={fileName} className="message-image" />;
}

interface MessageThreadProps {
  activeThread: ChatMessage[];
  userId: string;
  accessToken: string;
  apiBaseUrl: string;
  messageAreaRef: RefObject<HTMLUListElement | null>;
  formatTime: (isoDate: string) => string;
  aiTyping?: boolean;
}

export default function MessageThread({
  activeThread,
  userId,
  accessToken,
  apiBaseUrl,
  messageAreaRef,
  formatTime,
  aiTyping = false
}: MessageThreadProps) {
  return (
    <ul className="message-thread" ref={messageAreaRef}>
      {activeThread.map((message, index) => {
        if (message.type === "SYSTEM") {
          return (
            <li key={`${message.content}-${index}`} className="system-row">
              <span>{message.content}</span>
            </li>
          );
        }

        const isSender = message.senderId === userId;
        const fileRef = parseFileRef(message.content);

        return (
          <li
            key={`${message.senderId}-${index}-${message.createdAt}`}
            className={`message-row ${isSender ? "sender" : "receiver"}`}
          >
            <div className="message-bubble">
              {message.type === "IMAGE" && !fileRef ? (
                // Direct base64 or URL image from AI
                <img src={message.content} alt="AI Generated" className="message-image" />
              ) : fileRef ? (
                <FileBubble fileRef={fileRef} accessToken={accessToken} apiBaseUrl={apiBaseUrl} />
              ) : (
                <p>{message.content}</p>
              )}
              <span>{formatTime(message.createdAt)}</span>
            </div>
          </li>
        );
      })}
      {aiTyping && (
        <li className="message-row receiver">
          <div className="message-bubble">
            <span className="ai-typing-indicator" aria-label="Chatti tippt…">
              <span />
              <span />
              <span />
            </span>
          </div>
        </li>
      )}
    </ul>
  );
}
