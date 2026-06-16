export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3030', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  auth: {
    emailVerificationExpiresMinutes: parseInt(
      process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES ?? '15',
      10,
    ),
    passwordResetExpiresMinutes: parseInt(
      process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? '30',
      10,
    ),
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    appleClientId: process.env.APPLE_CLIENT_ID ?? '',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
