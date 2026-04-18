export type ChatMessageType = 'text' | 'location' | 'system';

export type ChatMessageSender = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
};

export type ChatMessageResponse = {
  id: string;
  groupId: string;
  type: ChatMessageType;
  body: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  createdAt: string;
  sender: ChatMessageSender | null;
};

export type ChatReadStateResponse = {
  userId: string;
  lastReadAt: string | null;
};

export type ChatHistoryResponse = {
  messages: ChatMessageResponse[];
  readState: ChatReadStateResponse[];
  nextCursor: string | null;
};

export type ChatUnreadCountResponse = {
  groupId: string;
  unread: number;
};

export type ChatReadReceiptResponse = {
  groupId: string;
  userId: string;
  lastReadAt: string;
};
