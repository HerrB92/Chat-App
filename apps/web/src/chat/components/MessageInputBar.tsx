import React from "react";
import type { RefObject } from "react";

interface MessageInputBarProps {
  activeChat: string;
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onAddEmoji: (emoji?: string) => void;
  onOpenFilePicker: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPasteFile: (file: File) => void;
}

export default function MessageInputBar({
  activeChat,
  messageInput,
  onMessageInputChange,
  onSubmit,
  onAddEmoji,
  onOpenFilePicker,
  fileInputRef,
  onFileChange,
  onPasteFile
}: MessageInputBarProps) {
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const emojis = [
    "😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊",
    "😋", "😎", "😍", "🥰", "😘", "🤩", "😏", "😒", "🙄", "😤",
    "😢", "😭", "😠", "🤬", "😱", "😨", "🤯", "😴", "🤒", "🤮",
    "🤗", "🤔", "🤫", "🤭", "🫡", "🙃", "😇", "🥳", "🥺", "😬",
    "👍", "👎", "👏", "🙌", "🤝", "🫶", "💪", "👀", "🙏", "✌️",
    "🎉", "🎊", "🎈", "🏆", "🔥", "💡", "⭐", "✨", "💥", "🚀",
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯",
    "😺", "🐱", "🐶", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🤖",
  ];

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!activeChat) return;
    const imageItem = Array.from(e.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (file) {
      e.preventDefault();
      onPasteFile(file);
    }
  };

  return (
    <form className="chat-input-bar" onSubmit={onSubmit} onPaste={handlePaste}>
      <div className="emoji-picker-container">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          aria-label="Open emoji picker"
        >
          😊
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker-dropdown">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-item"
                onClick={() => {
                  onAddEmoji(emoji);
                  setShowEmojiPicker(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="icon-btn" onClick={onOpenFilePicker} aria-label="Upload file">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>
      <input ref={fileInputRef} type="file" className="hidden-file" onChange={onFileChange} />
      <input
        type="text"
        className="message-input"
        placeholder={activeChat ? "Type a message" : "Select a chat first"}
        value={messageInput}
        onChange={(e) => onMessageInputChange(e.target.value)}
        disabled={!activeChat}
      />
      <button type="submit" className="send-btn" disabled={!activeChat}>
        Send
      </button>
    </form>
  );
}
