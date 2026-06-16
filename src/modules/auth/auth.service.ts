import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

import type { AppConfig } from '../../config/configuration';
import { ERROR_CODES } from '../../common/constants/api.constants';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import type {
  JwtPayload,
  RefreshTokenPayload,
} from '../../common/interfaces/jwt-payload.interface';
import {
  addMinutes,
  generateSecureToken,
  generateVerificationCode,
  hashPassword,
  hashToken,
  parseDurationToMs,
  verifyPassword,
} from '../../common/utils/crypto.util';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import type {
  AuthResponse,
  AuthTokensResponse,
  MessageResponse,
} from './dto/auth-response.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { RegisterDto } from './dto/register.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async register(dto: RegisterDto): Promise<MessageResponse> {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException({
        message: 'An account with this email already exists',
        code: ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS,
      });
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.usersService.createLocalUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

    await this.createEmailVerificationToken(user.id);

    return {
      message: 'Account created. Check your email for a verification code.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new BadRequestException({
        message: 'Invalid verification code',
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
      });
    }

    const token = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token || token.codeHash !== hashToken(dto.code)) {
      throw new BadRequestException({
        message: 'Invalid or expired verification code',
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
      });
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    const verifiedUser = await this.usersService.findById(user.id);
    if (!verifiedUser) {
      throw new UnauthorizedException();
    }

    return this.buildAuthResponse(verifiedUser);
  }

  async resendVerification(email: string): Promise<MessageResponse> {
    const user = await this.usersService.findByEmail(email);

    if (!user || user.emailVerifiedAt) {
      return {
        message:
          'If an unverified account exists for this email, a new code has been sent.',
      };
    }

    await this.createEmailVerificationToken(user.id);

    return {
      message:
        'If an unverified account exists for this email, a new code has been sent.',
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      });
    }

    const valid = await verifyPassword(dto.password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      });
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException({
        message: 'Please verify your email before signing in',
        code: ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
      });
    }

    return this.buildAuthResponse(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        dto.refreshToken,
        {
          secret: this.configService.get('jwt.refreshSecret', { infer: true }),
        },
      );
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
      });
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.jti,
        userId: payload.sub,
        tokenHash: hashToken(dto.refreshToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!stored) {
      throw new UnauthorizedException({
        message: 'Refresh token expired or revoked',
        code: ERROR_CODES.AUTH_TOKEN_EXPIRED,
      });
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user.id, user.email);
  }

  async logout(userId: string, refreshToken?: string): Promise<MessageResponse> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          tokenHash: hashToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Signed out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      await this.createPasswordResetToken(user.id);
    }

    return {
      message:
        'If an account exists for this email, password reset instructions have been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<MessageResponse> {
    const tokenHash = hashToken(dto.token);

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      throw new BadRequestException({
        message: 'Invalid or expired reset token',
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
      });
    }

    const passwordHash = await hashPassword(dto.password);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password updated successfully' };
  }

  async getProfile(user: AuthenticatedUser) {
    const record = await this.usersService.findById(user.id);

    if (!record) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    return this.usersService.toResponse(record);
  }

  async authenticateUser(userId: string): Promise<AuthResponse> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
  }): Promise<AuthResponse> {
    const tokens = await this.issueTokens(user.id, user.email);
    const record = await this.usersService.findById(user.id);

    if (!record) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    return {
      ...tokens,
      user: this.usersService.toResponse(record),
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokensResponse> {
    const accessExpiresIn = this.configService.get('jwt.accessExpiresIn', {
      infer: true,
    });

    const refreshExpiresIn = this.configService.get('jwt.refreshExpiresIn', {
      infer: true,
    });

    const refreshTokenId = randomUUID();
    const refreshExpiresAt = new Date(
      Date.now() + parseDurationToMs(refreshExpiresIn),
    );

    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, type: 'access' } satisfies JwtPayload,
      {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
        expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti: refreshTokenId, type: 'refresh' } satisfies RefreshTokenPayload,
      {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
        expiresIn: refreshExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(parseDurationToMs(accessExpiresIn) / 1000),
    };
  }

  private async createEmailVerificationToken(userId: string): Promise<void> {
    const code = generateVerificationCode();
    const minutes = this.configService.get(
      'auth.emailVerificationExpiresMinutes',
      { infer: true },
    );

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        codeHash: hashToken(code),
        expiresAt: addMinutes(new Date(), minutes),
      },
    });

    this.logger.log(
      `[DEV] Email verification code for user ${userId}: ${code}`,
    );
  }

  private async createPasswordResetToken(userId: string): Promise<void> {
    const token = generateSecureToken();
    const minutes = this.configService.get('auth.passwordResetExpiresMinutes', {
      infer: true,
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: addMinutes(new Date(), minutes),
      },
    });

    this.logger.log(
      `[DEV] Password reset token for user ${userId}: ${token}`,
    );
  }
}
