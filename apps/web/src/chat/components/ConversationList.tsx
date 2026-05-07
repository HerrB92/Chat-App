import type { ConversationEntry } from "../state/selectors";

interface ConversationListProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  conversations: ConversationEntry[];
  activeChat: string;
  onOpenConversation: (entry: ConversationEntry) => void;
  unreadByUserId: Record<string, number>;
  getAvatarColor: (name: string) => string;
  formatTime: (isoDate: string) => string;
}

export default function ConversationList({
  searchTerm,
  onSearchTermChange,
  conversations,
  activeChat,
  onOpenConversation,
  unreadByUserId,
  getAvatarColor,
  formatTime
}: ConversationListProps) {
  return (
    <aside className="middle-sidebar">
      <div className="search-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="Search chats"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
        />
      </div>
      <ul className="chat-list">
        {conversations.map((entry) => (
          <li key={entry.userId}>
            <button
              type="button"
              className={`chat-list-item${activeChat === entry.displayName ? " selected" : ""}`}
              onClick={() => onOpenConversation(entry)}
            >
              <div className="avatar small" style={{ backgroundColor: getAvatarColor(entry.displayName) }}>
                {entry.displayName[0]}
              </div>
              <div className="chat-meta">
                <div className="chat-meta-top">
                  <span className="chat-name">{entry.displayName}</span>
                  <span className="chat-time">
                    {entry.lastMessage === "No messages yet" ? "--" : formatTime(entry.createdAt)}
                  </span>
                </div>
                <div className="chat-meta-bottom">
                  <span className="chat-preview">{entry.lastMessage}</span>
                  {(unreadByUserId[entry.userId] ?? 0) > 0 && (
                    <span className="unread-badge">{unreadByUserId[entry.userId]}</span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
