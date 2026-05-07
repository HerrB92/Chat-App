import ConversationList from "./ConversationList";
import TeamList from "./TeamList";
import LeftSidebar from "./LeftSidebar";
import MessageInputBar from "./MessageInputBar";
import MessageThread from "./MessageThread";
import VideoCallOverlay from "./VideoCallOverlay";
import { getAvatarColor } from "../utils/avatarColor";
import { formatTime } from "../utils/chatFormat";
import type { useChatController } from "../hooks/useChatController";

const videoEnabled = process.env.NEXT_PUBLIC_ENABLE_VIDEO_CALL !== "false";

interface AppShellProps {
  controller: ReturnType<typeof useChatController>;
}

export default function AppShell({ controller }: AppShellProps) {
  const { state, conversations, activeThread } = controller;
  const isTeamsView = state.activeNav === "groups";

  const headerTitle = isTeamsView
    ? (state.activeRoomName || "Select a team")
    : (state.activeChat || "Select a conversation");

  const headerSub = isTeamsView
    ? (state.activeRoomName ? `Team: ${state.activeRoomName}` : "Choose a team from the list.")
    : (state.activeChat ? `Private chat with ${state.activeChat}` : "Choose a user from chat list.");

  const isActive = isTeamsView ? Boolean(state.activeRoomId) : Boolean(state.activeChat);

  return (
    <>
    <div className="app-shell">
      <LeftSidebar
        username={state.username}
        userRoles={state.userRoles}
        onSignOut={controller.signOut}
        activeNav={state.activeNav}
        onActiveNavChange={controller.setActiveNav}
        getAvatarColor={getAvatarColor}
      />

      {isTeamsView ? (
        <TeamList
          rooms={state.rooms}
          activeRoomId={state.activeRoomId}
          userId={state.userId}
          userRoles={state.userRoles}
          onOpenRoom={controller.openTeamRoom}
          onCreateTeam={controller.createTeam}
          onRenameTeam={controller.renameTeam}
          onDeleteTeam={controller.deleteTeam}
          onTransferOwner={controller.transferTeamOwner}
          onGetUsers={controller.fetchUsers}
          onGetRoomMembers={controller.getRoomMembers}
          onSetRoomMembers={controller.setRoomMembers}
          unreadByRoomId={state.unreadByRoomId}
          searchTerm={state.searchTerm}
          onSearchTermChange={controller.setSearchTerm}
        />
      ) : (
        <ConversationList
          searchTerm={state.searchTerm}
          onSearchTermChange={controller.setSearchTerm}
          conversations={conversations}
          activeChat={state.activeChat}
          onOpenConversation={controller.openConversation}
          unreadByUserId={state.unreadByUserId}
          getAvatarColor={getAvatarColor}
          formatTime={formatTime}
        />
      )}

      <main className="main-chat">
        <header className="main-chat-header">
          <div className="main-chat-header-top">
            <h2>{headerTitle}</h2>
            {videoEnabled && !isTeamsView && state.activeChatUserId && (
              <button
                type="button"
                className="icon-btn"
                title={`Video call with ${state.activeChat}`}
                disabled={controller.callState !== "idle"}
                onClick={() => controller.startVideoCall(state.activeChatUserId, state.activeChat)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </button>
            )}
          </div>
          <p>{headerSub}</p>
        </header>

        <MessageThread
          activeThread={activeThread}
          userId={state.userId}
          accessToken={state.accessToken}
          apiBaseUrl={process.env.NEXT_PUBLIC_CHAT_API_URL || "http://localhost:3001"}
          messageAreaRef={controller.messageAreaRef}
          formatTime={formatTime}
          aiTyping={state.aiTyping}
        />

        <MessageInputBar
          activeChat={isActive ? headerTitle : ""}
          messageInput={state.messageInput}
          onMessageInputChange={controller.setMessageInput}
          onSubmit={controller.sendMessage}
          onAddEmoji={controller.addEmoji}
          onOpenFilePicker={controller.openFilePicker}
          fileInputRef={controller.fileInputRef}
          onFileChange={controller.handleFileChange}
          onPasteFile={controller.sendFileAsMessage}
        />
      </main>
    </div>
    <VideoCallOverlay
      callState={controller.callState}
      callInfo={controller.callInfo}
      localVideoRef={controller.localVideoRef}
      remoteVideoRef={controller.remoteVideoRef}
      isMicMuted={controller.isMicMuted}
      isCameraOff={controller.isCameraOff}
      isScreenSharing={controller.isScreenSharing}
      availableCameras={controller.availableCameras}
      availableMicrophones={controller.availableMicrophones}
      availableSpeakers={controller.availableSpeakers}
      selectedCameraId={controller.selectedCameraId}
      selectedMicrophoneId={controller.selectedMicrophoneId}
      selectedSpeakerId={controller.selectedSpeakerId}
      onAccept={controller.acceptVideoCall}
      onReject={controller.rejectVideoCall}
      onHangUp={controller.hangUpVideoCall}
      onToggleMic={controller.toggleMic}
      onToggleCamera={controller.toggleCamera}
      onToggleScreenShare={controller.toggleScreenShare}
      onChangeCamera={controller.changeCamera}
      onChangeMicrophone={controller.changeMicrophone}
      onChangeSpeaker={controller.changeSpeaker}
    />
    </>
  );
}
