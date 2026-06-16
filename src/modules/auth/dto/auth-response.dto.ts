export type UserResponse = {
  id: string;
  email: string;
  name: string;
  handle: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  emailVerified: boolean;
  createdAt: string;
};

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthResponse = AuthTokensResponse & {
  user: UserResponse;
};

export type MessageResponse = {
  message: string;
};
