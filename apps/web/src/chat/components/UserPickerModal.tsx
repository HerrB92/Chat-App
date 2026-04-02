import { useState } from "react";

export interface UserEntry {
  userId: string;
  displayName: string;
}

interface UserPickerModalProps {
  title: string;
  onPick: (user: UserEntry) => void;
  onClose: () => void;
  onGetUsers: (search: string, continuation?: string | null) => Promise<{ users: UserEntry[]; continuation: string | null }>;
  /** User IDs already present — shown with a checkmark, "Add" button disabled */
  existingUserIds?: Set<string>;
}

export default function UserPickerModal({
  title,
  onPick,
  onClose,
  onGetUsers,
  existingUserIds = new Set()
}: UserPickerModalProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserEntry[]>([]);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async (query: string, cont: string | null = null) => {
    setLoading(true);
    try {
      const res = await onGetUsers(query, cont);
      if (cont) {
        setResults((prev) => [...prev, ...res.users]);
      } else {
        setResults(res.users);
      }
      setContinuation(res.continuation);
      setSearched(true);
    } catch {
      setResults([]);
      setContinuation(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="user-picker-search-row">
            <input
              className="search-input"
              placeholder="Search by name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch(search, null);
              }}
              autoFocus
            />
            <button
              type="button"
              className="send-btn"
              onClick={() => doSearch(search, null)}
              disabled={loading}
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          {searched && results.length === 0 && !loading && (
            <p className="user-picker-empty">No users found.</p>
          )}

          <ul className="user-picker-list">
            {results.map((user) => {
              const already = existingUserIds.has(user.userId);
              return (
                <li key={user.userId} className="user-picker-item">
                  <div className="user-picker-info">
                    <span className="user-picker-name">{user.displayName}</span>
                    <span className="user-picker-id">{user.userId}</span>
                  </div>
                  <button
                    type="button"
                    className={already ? "icon-btn" : "send-btn"}
                    disabled={already}
                    onClick={() => { if (!already) onPick(user); }}
                  >
                    {already ? "✓" : "Select"}
                  </button>
                </li>
              );
            })}
          </ul>

          {continuation && (
            <button
              type="button"
              className="icon-btn user-picker-load-more"
              onClick={() => doSearch(search, continuation)}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
