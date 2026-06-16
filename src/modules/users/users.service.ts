import { Injectable } from '@nestjs/common';
import type { AuthProvider, User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  getInitials,
  pickAvatarPalette,
  slugifyHandle,
} from '../../common/utils/crypto.util';
import type { UserResponse } from '../auth/dto/auth-response.dto';
import type { GroupMemberResponse } from '../groups/dto/group-response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  toResponse(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      handle: user.handle,
      initials: getInitials(user.name),
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  toMemberPreview(user: User): GroupMemberResponse {
    return {
      id: user.id,
      name: user.name,
      handle: `@${user.handle}`,
      initials: getInitials(user.name),
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      status: 'inactive',
      canSeeMe: true,
    };
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  async findByOAuth(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });

    if (!account?.user || account.user.deletedAt) {
      return null;
    }

    return account.user;
  }

  async searchUsers(
    query: string,
    excludeUserId: string,
  ): Promise<{ users: GroupMemberResponse[] }> {
    const normalized = query.trim().replace(/^@/, '').toLowerCase();

    if (normalized.length < 2) {
      return { users: [] };
    }

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: excludeUserId },
        OR: [
          { handle: { contains: normalized, mode: 'insensitive' } },
          { name: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { name: 'asc' },
    });

    return { users: users.map((user) => this.toMemberPreview(user)) };
  }

  async generateUniqueHandle(name: string, email: string): Promise<string> {
    const base =
      slugifyHandle(name) ||
      slugifyHandle(email.split('@')[0]) ||
      'echoloc.user';

    let candidate = base;
    let suffix = 0;

    while (await this.prisma.user.findUnique({ where: { handle: candidate } })) {
      suffix += 1;
      candidate = `${base}.${suffix}`;
    }

    return candidate;
  }

  async createLocalUser(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<User> {
    const email = input.email.toLowerCase();
    const handle = await this.generateUniqueHandle(input.name, email);
    const palette = pickAvatarPalette(email);

    return this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash: input.passwordHash,
        handle,
        avatarBg: palette.avatarBg,
        avatarColor: palette.avatarColor,
      },
    });
  }

  async createOAuthUser(input: {
    name: string;
    email: string;
    provider: AuthProvider;
    providerId: string;
  }): Promise<User> {
    const email = input.email.toLowerCase();
    const handle = await this.generateUniqueHandle(input.name, email);
    const palette = pickAvatarPalette(email);

    return this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        handle,
        avatarBg: palette.avatarBg,
        avatarColor: palette.avatarColor,
        authProvider: input.provider,
        emailVerifiedAt: new Date(),
        oauthAccounts: {
          create: {
            provider: input.provider,
            providerId: input.providerId,
          },
        },
      },
    });
  }

  async markEmailVerified(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async softDelete(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
  }
}
