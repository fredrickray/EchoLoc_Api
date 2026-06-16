export type JwtPayload = {
  sub: string;
  email: string;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
  type: 'refresh';
};
