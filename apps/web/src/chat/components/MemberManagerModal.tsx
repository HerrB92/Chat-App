import { useState } from "react";
import UserPickerModal, { type UserEntry } from "./UserPickerModal";

interface Member {
  userId: string;
  role: string;
  displayName?: string;
}

interface MemberManagerModalProps {
  roomName: string;
  ownerId: string;
  initialMembers: Member[];
  onSave: (members: Member[]) => void;
  onClose: () => void;
  onGetUsers: (search: string, continuation?: string | null) => Promise<{ users: UserEntry[]; continuation: string | null }>;
}

export default function MemberManagerModal({
  roomName,
  ownerId,
  initialMembers,
  onSave,
  onClose,
  onGetUsers
}: MemberManagerModalProps) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [showPicker, setShowPicker] = useState(false);

  const existingIds = new Set(members.map((m) => m.userId));
  const ownerMember = initialMembers.find((m) => m.userId === ownerId);
  const ownerDisplay = ownerMember?.displayName || ownerId;

  const addMember = (user: UserEntry) => {
    if (existingIds.has(user.userId)) return;
    setMembers((prev) => [...prev, { userId: user.userId, role: "member", displayName: user.displayName }]);
    setShowPicker(false);
  };

  const removeMember = (userId: string) => {
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  if (showPicker) {
    return (
      <UserPickerModal
        title="Add member"
        onPick={addMember}
        onClose={() => setShowPicker(false)}
        onGetUsers={onGetUsers}
        existingUserIds={existingIds}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Members — {roomName}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="modal-owner-line">
            Owner: <strong>{ownerDisplay}</strong>
            {ownerMember?.displayName && <span className="user-picker-id"> ({ownerId})</span>}
          </p>

          {members.length === 0 ? (
            <p className="user-picker-empty">No members yet.</p>
          ) : (
            <ul className="member-manager-list">
              {members.map((m) => (
                <li key={m.userId} className="member-manager-item">
                  <div className="user-picker-info">
                    <span className="user-picker-name">{m.displayName || m.userId}</span>
                    {m.displayName && <span className="user-picker-id">{m.userId}</span>}
                    {m.role && <span className="member-role-badge">{m.role}</span>}
                  </div>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    title="Remove member"
                    onClick={() => removeMember(m.userId)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="icon-btn member-add-btn" onClick={() => setShowPicker(true)}>
            + Add member
          </button>
        </div>

        <div className="modal-footer">
          <button type="button" className="send-btn" onClick={() => onSave(members)}>Save</button>
          <button type="button" className="icon-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
