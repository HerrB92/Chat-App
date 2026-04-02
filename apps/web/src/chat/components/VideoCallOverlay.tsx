import { useState, type RefObject } from "react";

interface VideoCallOverlayProps {
  callState: "idle" | "calling" | "incoming" | "connecting" | "active";
  callInfo: { peerId: string; peerDisplayName: string } | null;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  isMicMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  availableCameras: MediaDeviceInfo[];
  availableMicrophones: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
  selectedCameraId: string;
  selectedMicrophoneId: string;
  selectedSpeakerId: string;
  onAccept: () => void;
  onReject: () => void;
  onHangUp: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onChangeCamera: (deviceId: string) => void;
  onChangeMicrophone: (deviceId: string) => void;
  onChangeSpeaker: (deviceId: string) => void;
}

export default function VideoCallOverlay({
  callState,
  callInfo,
  localVideoRef,
  remoteVideoRef,
  isMicMuted,
  isCameraOff,
  isScreenSharing,
  availableCameras,
  availableMicrophones,
  availableSpeakers,
  selectedCameraId,
  selectedMicrophoneId,
  selectedSpeakerId,
  onAccept,
  onReject,
  onHangUp,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onChangeCamera,
  onChangeMicrophone,
  onChangeSpeaker
}: VideoCallOverlayProps) {
  const [showSettings, setShowSettings] = useState(false);

  if (callState === "idle") return null;

  const peerName = callInfo?.peerDisplayName || "Unknown";

  return (
    <div className="video-overlay">
      {/* Remote video — fills the background */}
      <video ref={remoteVideoRef} className="video-remote" autoPlay playsInline />

      {/* Local video — picture-in-picture */}
      <video ref={localVideoRef} className="video-local" autoPlay playsInline muted />

      {/* State-dependent UI */}
      {callState === "calling" && (
        <div className="video-status">
          <p className="video-status-name">Calling {peerName}…</p>
          <button type="button" className="video-btn video-btn--hangup" onClick={onHangUp}>
            ✕ Cancel
          </button>
        </div>
      )}

      {callState === "incoming" && (
        <div className="video-status">
          <p className="video-status-name">{peerName} is calling…</p>
          <div className="video-controls">
            <button type="button" className="video-btn video-btn--accept" onClick={onAccept}>
              📹 Accept
            </button>
            <button type="button" className="video-btn video-btn--reject" onClick={onReject}>
              ✕ Decline
            </button>
          </div>
        </div>
      )}

      {callState === "connecting" && (
        <div className="video-status">
          <p className="video-status-name">Connecting…</p>
        </div>
      )}

      {callState === "active" && (
        <div className="video-active-controls">
          {/* Mute mic */}
          <button
            type="button"
            className={`video-icon-btn${isMicMuted ? " video-icon-btn--active" : ""}`}
            title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            onClick={onToggleMic}
          >
            {isMicMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Toggle camera */}
          <button
            type="button"
            className={`video-icon-btn${isCameraOff ? " video-icon-btn--active" : ""}`}
            title={isCameraOff ? "Turn camera on" : "Turn camera off"}
            onClick={onToggleCamera}
          >
            {isCameraOff ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
                <path d="M23 7 16 12 23 17z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
          </button>

          {/* Screen share */}
          <button
            type="button"
            className={`video-icon-btn${isScreenSharing ? " video-icon-btn--active" : ""}`}
            title={isScreenSharing ? "Stop screen sharing" : "Share screen"}
            onClick={onToggleScreenShare}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
              {isScreenSharing && <line x1="1" y1="1" x2="23" y2="23" />}
            </svg>
          </button>

          {/* Device settings toggle */}
          <button
            type="button"
            className={`video-icon-btn${showSettings ? " video-icon-btn--active" : ""}`}
            title="Device settings"
            onClick={() => setShowSettings((s) => !s)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* Hang up */}
          <button type="button" className="video-btn video-btn--hangup" onClick={onHangUp}>
            📵 Hang up
          </button>

          {/* Device settings panel */}
          {showSettings && (
            <div className="video-settings-panel">
              {availableCameras.length > 0 && (
                <label className="video-settings-row">
                  <span>Camera</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => onChangeCamera(e.target.value)}
                  >
                    {availableCameras.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {availableMicrophones.length > 0 && (
                <label className="video-settings-row">
                  <span>Microphone</span>
                  <select
                    value={selectedMicrophoneId}
                    onChange={(e) => onChangeMicrophone(e.target.value)}
                  >
                    {availableMicrophones.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {availableSpeakers.length > 0 && (
                <label className="video-settings-row">
                  <span>Speaker</span>
                  <select
                    value={selectedSpeakerId}
                    onChange={(e) => onChangeSpeaker(e.target.value)}
                  >
                    {availableSpeakers.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
