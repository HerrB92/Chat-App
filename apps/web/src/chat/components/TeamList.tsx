import { useState } from "react";
import type { TeamRoom } from "../state/chatReducer";
import { TEAM_ROLES } from "../state/chatReducer";
import MemberManagerModal from "./MemberManagerModal";
import UserPickerModal from "./UserPickerModal";
import type { UserEntry } from "./UserPickerModal";

interface TeamListProps {
  rooms: TeamRoom[];
  activeRoomId: string;
  userId: string;
  userRoles: string[];
  onOpenRoom: (room: TeamRoom) => void;
  onCreateTeam: (name: string) => void;
  onRenameTeam: (roomId: string, name: string) => void;
  onDeleteTeam: (roomId: string) => void;
  onTransferOwner: (roomId: string, newOwnerId: string) => void;
  onGetUsers: (search: string, continuation?: string | null) => Promise<{ users: UserEntry[]; continuation: string | null }>;
  onGetRoomMembers: (roomId: string) => Promise<Array<{ userId: string; role: string; displayName?: string }>>;
  onSetRoomMembers: (roomId: string, members: Array<{ userId: string; role: string }>) => void;
  unreadByRoomId: Record<string, number>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

function canEdit(userRoles: string[], userId: string, room: TeamRoom): boolean {
  if (userRoles.includes(TEAM_ROLES.EDIT_ALL)) return true;
  if (userRoles.includes(TEAM_ROLES.EDIT) && room.ownerId === userId) return true;
  return false;
}

const canCreate = (userRoles: string[]): boolean =>
  userRoles.includes(TEAM_ROLES.EDIT) || userRoles.includes(TEAM_ROLES.EDIT_ALL);

type Modal =
  | { type: "members"; room: TeamRoom }
  | { type: "transfer"; room: TeamRoom }
  | { type: "rename"; room: TeamRoom };

export default function TeamList({
  rooms,
  activeRoomId,
  userId,
  userRoles,
  onOpenRoom,
  onCreateTeam,
  onRenameTeam,
  onDeleteTeam,
  onTransferOwner,
  onGetUsers,
  onGetRoomMembers,
  onSetRoomMembers,
  unreadByRoomId,
  searchTerm,
  onSearchTermChange
}: TeamListProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [modal, setModal] = useState<Modal | null>(null);
  const [modalMembers, setModalMembers] = useState<Array<{ userId: string; role: string; displayName?: string }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const openMembersModal = async (room: TeamRoom) => {
    setLoadingMembers(true);
    try {
      const members = await onGetRoomMembers(room.roomId);
      setModalMembers(members);
    } catch {
      setModalMembers([]);
    } finally {
      setLoadingMembers(false);
    }
    setModal({ type: "members", room });
  };

  const openTransferModal = async (room: TeamRoom) => {
    setModal({ type: "transfer", room });
  };

  const filtered = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateTeam(newName.trim());
    setNewName("");
    setCreating(false);
  };

  const startEdit = (room: TeamRoom) => {
    setEditingRoomId(room.roomId);
    setEditName(room.name);
  };

  const commitEdit = (roomId: string) => {
    if (editName.trim()) onRenameTeam(roomId, editName.trim());
    setEditingRoomId(null);
  };

  return (
    <>
      <aside className="middle-sidebar">
        <div className="search-wrap">
          <input
            type="text"
            className="search-input"
            placeholder="Search teams"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
          />
        </div>

        <ul className="chat-list">
          {filtered.map((room) => {
            const mayEdit = canEdit(userRoles, userId, room);
            const canTransferOwner = userRoles.includes(TEAM_ROLES.EDIT_ALL);
            const isEditing = editingRoomId === room.roomId;

            return (
              <li key={room.roomId}>
                {isEditing ? (
                  <div className="team-inline-edit">
                    <input
                      className="search-input"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(room.roomId);
                        if (e.key === "Escape") setEditingRoomId(null);
                      }}
                    />
                    <div className="team-create-actions">
                      <button type="button" className="send-btn" onClick={() => commitEdit(room.roomId)}>Save</button>
                      <button type="button" className="icon-btn" onClick={() => setEditingRoomId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className={`chat-list-item team-list-item${activeRoomId === room.roomId ? " selected" : ""}`}>
                    <button
                      type="button"
                      className="team-open-btn"
                      onClick={() => onOpenRoom(room)}
                    >
                      <div className="team-avatar">
                        {room.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="chat-meta">
                        <div className="chat-meta-top">
                          <span className="chat-name">{room.name}</span>
                        </div>
                        {room.ownerId === userId && (
                          <div className="team-owner-badge">Owner</div>
                        )}
                      </div>
                      {(unreadByRoomId[room.roomId] ?? 0) > 0 && (
                        <span className="unread-badge">{unreadByRoomId[room.roomId]}</span>
                      )}
                    </button>
                    {mayEdit && (
                      <div className="team-actions">
                        <button
                          type="button"
                          className="team-action-btn"
                          title="Manage members"
                          disabled={loadingMembers}
                          onClick={() => openMembersModal(room)}
                        >👥</button>
                        <button
                          type="button"
                          className="team-action-btn"
                          title="Rename"
                          onClick={() => startEdit(room)}
                        >✏️</button>
                        {canTransferOwner && (
                          <button
                            type="button"
                            className="team-action-btn"
                            title="Transfer ownership"
                            onClick={() => openTransferModal(room)}
                          >👤</button>
                        )}
                        <button
                          type="button"
                          className="team-action-btn team-action-btn--danger"
                          title="Delete team"
                          onClick={() => onDeleteTeam(room.roomId)}
                        >🗑️</button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}

          {filtered.length === 0 && !creating && (
            <li className="team-empty">No teams yet.</li>
          )}
        </ul>

        <div className="team-create-area">
          {canCreate(userRoles) && (
            creating ? (
              <div className="team-create-form">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Team name"
                  value={newName}
                  autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setCreating(false);
                  }}
                />
                <div className="team-create-actions">
                  <button type="button" className="send-btn" onClick={handleCreate}>Create</button>
                  <button type="button" className="icon-btn" onClick={() => setCreating(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="team-new-btn" onClick={() => setCreating(true)}>
                + New team
              </button>
            )
          )}
        </div>
      </aside>

      {modal?.type === "members" && (
        <MemberManagerModal
          roomName={modal.room.name}
          ownerId={modal.room.ownerId}
          initialMembers={modalMembers}
          onSave={(members) => {
            onSetRoomMembers(modal.room.roomId, members);
            setModal(null);
          }}
          onClose={() => setModal(null)}
          onGetUsers={onGetUsers}
        />
      )}

      {modal?.type === "transfer" && (
        <UserPickerModal
          title={`Transfer ownership — ${modal.room.name}`}
          onPick={(user) => {
            onTransferOwner(modal.room.roomId, user.userId);
            setModal(null);
          }}
          onClose={() => setModal(null)}
          onGetUsers={onGetUsers}
        />
      )}
    </>
  );
}
