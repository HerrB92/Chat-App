import { useRef, useState, useEffect } from "react";

interface LeftSidebarProps {
  username: string;
  userRoles: string[];
  activeNav: string;
  onActiveNavChange: (nav: string) => void;
  getAvatarColor: (name: string) => string;
  onSignOut: () => void;
}

export default function LeftSidebar({
  username,
  userRoles,
  activeNav,
  onActiveNavChange,
  getAvatarColor,
  onSignOut
}: LeftSidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!infoOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [infoOpen]);

  return (
    <aside className="left-sidebar">
      <div className="app-logo">RT</div>
      <nav className="nav-icons">
        {(["chat", "groups"] as const).map((nav) => (
          <button
            key={nav}
            type="button"
            className={`nav-icon-btn${activeNav === nav ? " active" : ""}`}
            onClick={() => onActiveNavChange(nav)}
          >
            {nav === "chat" ? "Chat" : "Teams"}
          </button>
        ))}
      </nav>

      <div className="profile-area" ref={menuRef}>
        <button
          type="button"
          className="profile-card profile-card--btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <div className="avatar" style={{ backgroundColor: getAvatarColor(username) }}>
            {username[0]}
          </div>
          <div className="profile-text">
            <div className="profile-name">{username}</div>
            <div className="profile-status">Online</div>
          </div>
        </button>

        {menuOpen && (
          <div className="profile-menu" role="menu">
            <button
              type="button"
              className="profile-menu-item"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setInfoOpen(true); }}
            >
              Account info
            </button>
            <button
              type="button"
              className="profile-menu-item profile-menu-item--danger"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onSignOut(); }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {infoOpen && (
        <div className="account-info-overlay" onClick={() => setInfoOpen(false)}>
          <div className="account-info-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Account info">
            <div className="account-info-header">
              <div className="avatar account-info-avatar" style={{ backgroundColor: getAvatarColor(username) }}>
                {username[0]}
              </div>
              <div>
                <div className="account-info-name">{username}</div>
                <div className="account-info-sub">Account information</div>
              </div>
              <button type="button" className="account-info-close" onClick={() => setInfoOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="account-info-section">
              <div className="account-info-label">Assigned roles</div>
              {userRoles.length > 0 ? (
                <ul className="account-info-roles">
                  {userRoles.map((role) => (
                    <li key={role} className="account-info-role-badge">{role}</li>
                  ))}
                </ul>
              ) : (
                <p className="account-info-no-roles">No roles assigned.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
