export const TEAM_ROLES = {
  EDIT: "Teams.Edit",
  EDIT_ALL: "Teams.Edit.All"
} as const;

export type TeamRole = (typeof TEAM_ROLES)[keyof typeof TEAM_ROLES];

export function toIsoNow(): string {
  return new Date().toISOString();
}

export function buildPrivateConversationId(userA: string, userB: string): string {
  return [String(userA || "").trim(), String(userB || "").trim()].sort().join(":");
}

export function buildMembershipId(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}
