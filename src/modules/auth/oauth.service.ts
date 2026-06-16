import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

import { ERROR_CODES } from '../../common/constants/api.constants';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import type { AuthResponse } from '../auth/dto/auth-response.dto';
import type { AppleAuthDto, GoogleAuthDto } from '../auth/dto/oauth.dto';

type AppleIdentityToken = jwt.JwtPayload & {
  email?: string;
  sub: string;
};

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly googleClient: OAuth2Client | null;
  private readonly appleJwks = jwksClient({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
    rateLimit: true,
  });

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {
    const googleClientId = this.configService.get('oauth.googleClientId', {
      infer: true,
    });
    this.googleClient = googleClientId
      ? new OAuth2Client(googleClientId)
      : null;
  }

  async signInWithGoogle(dto: GoogleAuthDto): Promise<AuthResponse> {
    const googleClientId = this.configService.get('oauth.googleClientId', {
      infer: true,
    });

    if (!this.googleClient || !googleClientId) {
      throw new BadRequestException({
        message: 'Google sign-in is not configured',
        code: ERROR_CODES.AUTH_OAUTH_FAILED,
      });
    }

    let payload: { sub: string; email?: string; name?: string };

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: googleClientId,
      });
      const tokenPayload = ticket.getPayload();

      if (!tokenPayload?.sub) {
        throw new Error('Missing subject');
      }

      payload = {
        sub: tokenPayload.sub,
        email: tokenPayload.email,
        name: tokenPayload.name,
      };
    } catch (error) {
      this.logger.warn('Google token verification failed', error);
      throw new UnauthorizedException({
        message: 'Invalid Google token',
        code: ERROR_CODES.AUTH_OAUTH_FAILED,
      });
    }

    const user = await this.resolveOAuthUser({
      provider: AuthProvider.GOOGLE,
      providerId: payload.sub,
      email: payload.email,
      name: payload.name ?? 'EchoLoc User',
    });

    return this.authService.authenticateUser(user.id);
  }

  async signInWithApple(dto: AppleAuthDto): Promise<AuthResponse> {
    const appleClientId = this.configService.get('oauth.appleClientId', {
      infer: true,
    });

    if (!appleClientId) {
      throw new BadRequestException({
        message: 'Apple sign-in is not configured',
        code: ERROR_CODES.AUTH_OAUTH_FAILED,
      });
    }

    let payload: AppleIdentityToken;

    try {
      payload = await this.verifyAppleToken(dto.identityToken, appleClientId);
    } catch (error) {
      this.logger.warn('Apple token verification failed', error);
      throw new UnauthorizedException({
        message: 'Invalid Apple token',
        code: ERROR_CODES.AUTH_OAUTH_FAILED,
      });
    }

    const user = await this.resolveOAuthUser({
      provider: AuthProvider.APPLE,
      providerId: payload.sub,
      email: payload.email,
      name: dto.name ?? 'EchoLoc User',
    });

    return this.authService.authenticateUser(user.id);
  }

  private async resolveOAuthUser(input: {
    provider: AuthProvider;
    providerId: string;
    email?: string;
    name: string;
  }) {
    const linked = await this.usersService.findByOAuth(
      input.provider,
      input.providerId,
    );

    if (linked) {
      return linked;
    }

    if (input.email) {
      const existing = await this.usersService.findByEmail(input.email);
      if (existing) {
        await this.prisma.oAuthAccount.create({
          data: {
            userId: existing.id,
            provider: input.provider,
            providerId: input.providerId,
          },
        });
        return existing;
      }
    }

    return this.usersService.createOAuthUser({
      name: input.name,
      email: input.email ?? `${input.providerId}@${input.provider.toLowerCase()}.oauth`,
      provider: input.provider,
      providerId: input.providerId,
    });
  }

  private verifyAppleToken(
    identityToken: string,
    audience: string,
  ): Promise<AppleIdentityToken> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        identityToken,
        (header, callback) => {
          if (!header.kid) {
            callback(new Error('Missing key id'));
            return;
          }

          this.appleJwks.getSigningKey(header.kid, (error, key) => {
            if (error || !key) {
              callback(error ?? new Error('Signing key not found'));
              return;
            }
            callback(null, key.getPublicKey());
          });
        },
        {
          algorithms: ['RS256'],
          issuer: 'https://appleid.apple.com',
          audience,
        },
        (error, decoded) => {
          if (error || !decoded || typeof decoded === 'string') {
            reject(error ?? new Error('Invalid Apple token payload'));
            return;
          }

          resolve(decoded as AppleIdentityToken);
        },
      );
    });
  }
}
