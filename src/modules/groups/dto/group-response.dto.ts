export type GroupResponse = {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  activeCount: number;
  inviteCode: string;
};

export type GroupMemberResponse = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  status: 'active' | 'inactive';
  locationLabel?: string;
  lastSeen?: string;
  timeRemaining?: string;
  canSeeMe: boolean;
};

export type ActivityItemResponse = {
  id: string;
  message: string;
  timestamp: string;
};

export type PendingInviteResponse = {
  id: string;
  groupName: string;
  emoji: string;
  inviterName: string;
  inviterHandle: string;
};

export type InviteCodeResponse = {
  code: string;
  expiresAt: string;
};
