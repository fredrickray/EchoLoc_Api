export type SharingSessionResponse = {
  id: string;
  groupId: string;
  groupName: string;
  durationId: string;
  startedAt: string;
  endsAt: string;
  isActive: boolean;
};

export type MemberLocationResponse = {
  memberId: string;
  latitude: number;
  longitude: number;
  locationLabel?: string;
  updatedAt: string;
};
