import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3030),
  API_PREFIX: Joi.string().default('api/v1'),
  DATABASE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  EMAIL_VERIFICATION_EXPIRES_MINUTES: Joi.number().default(15),
  PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().default(30),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  APPLE_CLIENT_ID: Joi.string().allow('').default(''),
});
