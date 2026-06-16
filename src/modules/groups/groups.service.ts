import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Group, GroupMember, User } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/api.constants';
import { formatRelativeTime, formatTimeRemaining } from '../../common/utils/duration.util';
import {
  generateInviteCode,
  getInviteCodeExpiry,
  normalizeInviteCode,
} from '../../common/utils/invite.util';
import { getInitials } from '../../common/utils/crypto.util';
import { PrismaService } from '../../database/prisma.service';
import type {
  ActivityItemResponse,
  GroupMemberResponse,
  GroupResponse,
  PendingInviteResponse,
} from './dto/group-response.dto';
import type { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

type GroupWithCounts = Group & {
  _count: { members: number };
};

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGroups(userId: string): Promise<{ groups: GroupResponse[] }> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, group: { deletedAt: null } },
      include: {
        group: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = await Promise.all(
      memberships.map(async (membership) =>
        this.toGroupResponse(membership.group, membership.group._count.members),
      ),
    );

    return { groups };
  }

  async createGroup(
    userId: string,
    dto: CreateGroupDto,
  ): Promise<GroupResponse> {
    const inviteCode = await this.generateUniqueInviteCode();
    const inviteCodeExpiresAt = getInviteCodeExpiry();

    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: dto.name.trim(),
          emoji: dto.emoji,
          inviteCode,
          inviteCodeExpiresAt,
          ownerId: userId,
          members: {
            create: { userId, role: 'OWNER' },
          },
        },
      });

      const memberIds = (dto.memberIds ?? []).filter((id) => id !== userId);

      for (const memberId of memberIds) {
        const user = await tx.user.findFirst({
          where: { id: memberId, deletedAt: null },
        });
        if (!user) continue;

        await tx.groupMember.upsert({
          where: {
            groupId_userId: { groupId: created.id, userId: memberId },
          },
          create: { groupId: created.id, userId: memberId },
          update: {},
        });

        await tx.groupInvite.create({
          data: {
            groupId: created.id,
            inviterId: userId,
            inviteeId: memberId,
            status: 'ACCEPTED',
            expiresAt: inviteCodeExpiresAt,
            respondedAt: new Date(),
          },
        });
      }

      await tx.groupActivity.create({
        data: {
          groupId: created.id,
          message: 'Group created',
        },
      });

      return created;
    });

    return this.toGroupResponse(group, 1 + (dto.memberIds?.length ?? 0));
  }

  async getGroup(userId: string, groupId: string): Promise<GroupResponse> {
    await this.assertMember(groupId, userId);
    const group = await this.findGroupOrThrow(groupId);
    const memberCount = await this.prisma.groupMember.count({
      where: { groupId },
    });
    return this.toGroupResponse(group, memberCount);
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<GroupResponse> {
    await this.assertOwner(groupId, userId);
    const group = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        name: dto.name?.trim(),
        emoji: dto.emoji,
      },
    });
    const memberCount = await this.prisma.groupMember.count({
      where: { groupId },
    });
    return this.toGroupResponse(group, memberCount);
  }

  async deleteGroup(userId: string, groupId: string): Promise<void> {
    await this.assertOwner(groupId, userId);
    await this.prisma.group.update({
      where: { id: groupId },
      data: { deletedAt: new Date() },
    });
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    const membership = await this.assertMember(groupId, userId);
    if (membership.role === 'OWNER') {
      throw new ForbiddenException({
        message: 'Group owners must transfer ownership or delete the group',
        code: ERROR_CODES.GROUP_FORBIDDEN,
      });
    }

    await this.prisma.groupMember.delete({
      where: { id: membership.id },
    });

    await this.stopUserSharingInGroup(userId, groupId);
  }

  async getMembers(
    userId: string,
    groupId: string,
  ): Promise<{ members: GroupMemberResponse[] }> {
    await this.assertMember(groupId, userId);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });

    const activeSessions = await this.prisma.sharingSession.findMany({
      where: {
        groupId,
        stoppedAt: null,
        endsAt: { gt: new Date() },
      },
      include: {
        locations: { orderBy: { createdAt: 'desc' }, take: 1 },
        visibility: { where: { targetUserId: userId } },
      },
    });

    const sessionByUser = new Map(
      activeSessions.map((session) => [session.userId, session]),
    );

    return {
      members: members.map((member) =>
        this.toMemberResponse(
          member,
          member.user,
          sessionByUser.get(member.userId),
          userId,
        ),
      ),
    };
  }

  async addMember(
    userId: string,
    groupId: string,
    memberId: string,
  ): Promise<GroupMemberResponse> {
    await this.assertMember(groupId, userId);

    const user = await this.prisma.user.findFirst({
      where: { id: memberId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: ERROR_CODES.NOT_FOUND,
      });
    }

    const membership = await this.prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: memberId } },
      create: { groupId, userId: memberId },
      update: {},
      include: { user: true },
    });

    await this.prisma.groupActivity.create({
      data: {
        groupId,
        message: `${user.name} joined the group`,
      },
    });

    return this.toMemberResponse(membership, membership.user, undefined, userId);
  }

  async removeMember(
    userId: string,
    groupId: string,
    memberId: string,
  ): Promise<void> {
    await this.assertOwner(groupId, userId);

    await this.prisma.groupMember.deleteMany({
      where: { groupId, userId: memberId, role: { not: 'OWNER' } },
    });

    await this.stopUserSharingInGroup(memberId, groupId);
  }

  async getActivity(
    userId: string,
    groupId: string,
  ): Promise<{ items: ActivityItemResponse[] }> {
    await this.assertMember(groupId, userId);

    const items = await this.prisma.groupActivity.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        message: item.message,
        timestamp: formatRelativeTime(item.createdAt),
      })),
    };
  }

  async regenerateInvite(
    userId: string,
    groupId: string,
  ): Promise<{ code: string; expiresAt: string }> {
    await this.assertMember(groupId, userId);

    const inviteCode = await this.generateUniqueInviteCode();
    const inviteCodeExpiresAt = getInviteCodeExpiry();

    await this.prisma.group.update({
      where: { id: groupId },
      data: { inviteCode, inviteCodeExpiresAt },
    });

    return {
      code: inviteCode,
      expiresAt: inviteCodeExpiresAt.toISOString(),
    };
  }

  async joinByCode(userId: string, code: string): Promise<GroupResponse> {
    const normalized = normalizeInviteCode(code);
    const group = await this.prisma.group.findFirst({
      where: { inviteCode: normalized, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException({
        message: 'Invalid invite code',
        code: ERROR_CODES.INVITE_INVALID,
      });
    }

    if (group.inviteCodeExpiresAt < new Date()) {
      throw new ForbiddenException({
        message: 'Invite code has expired',
        code: ERROR_CODES.INVITE_EXPIRED,
      });
    }

    const existing = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    });

    if (!existing) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      await this.prisma.$transaction([
        this.prisma.groupMember.create({
          data: { groupId: group.id, userId },
        }),
        this.prisma.groupActivity.create({
          data: {
            groupId: group.id,
            message: `${user?.name ?? 'Someone'} joined via invite code`,
          },
        }),
      ]);
    }

    const memberCount = await this.prisma.groupMember.count({
      where: { groupId: group.id },
    });

    return this.toGroupResponse(group, memberCount);
  }

  async getPendingInvites(
    userId: string,
  ): Promise<{ invites: PendingInviteResponse[] }> {
    const invites = await this.prisma.groupInvite.findMany({
      where: {
        inviteeId: userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        group: { deletedAt: null },
      },
      include: {
        group: true,
        inviter: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      invites: invites.map((invite) => ({
        id: invite.id,
        groupName: invite.group.name,
        emoji: invite.group.emoji,
        inviterName: invite.inviter.name,
        inviterHandle: `@${invite.inviter.handle}`,
      })),
    };
  }

  async getInvite(
    userId: string,
    inviteId: string,
  ): Promise<PendingInviteResponse> {
    const invite = await this.findInviteOrThrow(inviteId, userId);
    return {
      id: invite.id,
      groupName: invite.group.name,
      emoji: invite.group.emoji,
      inviterName: invite.inviter.name,
      inviterHandle: `@${invite.inviter.handle}`,
    };
  }

  async acceptInvite(userId: string, inviteId: string): Promise<GroupResponse> {
    const invite = await this.findInviteOrThrow(inviteId, userId);

    if (invite.status !== 'PENDING') {
      throw new ForbiddenException({
        message: 'Invite is no longer valid',
        code: ERROR_CODES.INVITE_INVALID,
      });
    }

    if (invite.expiresAt < new Date()) {
      await this.prisma.groupInvite.update({
        where: { id: inviteId },
        data: { status: 'EXPIRED' },
      });
      throw new ForbiddenException({
        message: 'Invite has expired',
        code: ERROR_CODES.INVITE_EXPIRED,
      });
    }

    await this.prisma.$transaction([
      this.prisma.groupInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      this.prisma.groupMember.upsert({
        where: {
          groupId_userId: { groupId: invite.groupId, userId },
        },
        create: { groupId: invite.groupId, userId },
        update: {},
      }),
      this.prisma.groupActivity.create({
        data: {
          groupId: invite.groupId,
          message: `${invite.invitee?.name ?? 'Someone'} accepted an invite`,
        },
      }),
    ]);

    const memberCount = await this.prisma.groupMember.count({
      where: { groupId: invite.groupId },
    });

    return this.toGroupResponse(invite.group, memberCount);
  }

  async declineInvite(userId: string, inviteId: string): Promise<void> {
    const invite = await this.findInviteOrThrow(inviteId, userId);

    await this.prisma.groupInvite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
  }

  async assertMember(
    groupId: string,
    userId: string,
  ): Promise<GroupMember> {
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId, group: { deletedAt: null } },
    });

    if (!membership) {
      throw new ForbiddenException({
        message: 'You are not a member of this group',
        code: ERROR_CODES.GROUP_FORBIDDEN,
      });
    }

    return membership;
  }

  private async assertOwner(groupId: string, userId: string): Promise<void> {
    const membership = await this.assertMember(groupId, userId);
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException({
        message: 'Only the group owner can perform this action',
        code: ERROR_CODES.GROUP_FORBIDDEN,
      });
    }
  }

  private async findGroupOrThrow(groupId: string): Promise<Group> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException({
        message: 'Group not found',
        code: ERROR_CODES.GROUP_NOT_FOUND,
      });
    }

    return group;
  }

  private async findInviteOrThrow(inviteId: string, userId: string) {
    const invite = await this.prisma.groupInvite.findFirst({
      where: { id: inviteId, inviteeId: userId },
      include: { group: true, inviter: true, invitee: true },
    });

    if (!invite) {
      throw new NotFoundException({
        message: 'Invite not found',
        code: ERROR_CODES.NOT_FOUND,
      });
    }

    return invite;
  }

  private async toGroupResponse(
    group: Group,
    memberCount: number,
  ): Promise<GroupResponse> {
    const activeCount = await this.prisma.sharingSession.count({
      where: {
        groupId: group.id,
        stoppedAt: null,
        endsAt: { gt: new Date() },
      },
    });

    return {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      memberCount,
      activeCount,
      inviteCode: group.inviteCode,
    };
  }

  private toMemberResponse(
    member: GroupMember,
    user: User,
    session:
      | {
          endsAt: Date;
          locations: { label: string | null; createdAt: Date }[];
          visibility: { canSeeMe: boolean }[];
        }
      | undefined,
    viewerId: string,
  ): GroupMemberResponse {
    const isActive =
      !!session && session.endsAt > new Date();
    const latestLocation = session?.locations[0];
    const visibility = session?.visibility[0];

    return {
      id: user.id,
      name: user.name,
      handle: `@${user.handle}`,
      initials: getInitials(user.name),
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      status: isActive ? 'active' : 'inactive',
      locationLabel: latestLocation?.label ?? undefined,
      lastSeen: latestLocation
        ? formatRelativeTime(latestLocation.createdAt)
        : undefined,
      timeRemaining:
        isActive && session ? formatTimeRemaining(session.endsAt) : undefined,
      canSeeMe:
        member.userId === viewerId ? true : (visibility?.canSeeMe ?? true),
    };
  }

  private async generateUniqueInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateInviteCode();
      const existing = await this.prisma.group.findUnique({
        where: { inviteCode: code },
      });
      if (!existing) return code;
    }

    return `${generateInviteCode()}-${Date.now().toString().slice(-4)}`;
  }

  private async stopUserSharingInGroup(
    userId: string,
    groupId: string,
  ): Promise<void> {
    await this.prisma.sharingSession.updateMany({
      where: { userId, groupId, stoppedAt: null },
      data: { stoppedAt: new Date() },
    });
  }
}
