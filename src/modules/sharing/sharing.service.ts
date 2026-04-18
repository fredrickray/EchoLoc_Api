import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import type { SharingSession } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/api.constants';
import {
  computeEndsAt,
  isValidDurationId,
  resolveDurationId,
} from '../../common/utils/duration.util';
import { PrismaService } from '../../database/prisma.service';
import { toChatMessageResponse } from '../chat/chat.mapper';
import { GroupsService } from '../groups/groups.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type {
  MemberLocationResponse,
  SharingSessionResponse,
} from './dto/sharing-response.dto';
import type {
  StartSharingDto,
  UpdateLocationDto,
  UpdateSharingDurationDto,
  UpdateVisibilityDto,
} from './dto/sharing.dto';

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupsService: GroupsService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async getActiveSession(
    userId: string,
  ): Promise<{ session: SharingSessionResponse | null }> {
    const session = await this.findActiveSessionForUser(userId);
    if (!session) {
      return { session: null };
    }

    return { session: this.toSessionResponse(session) };
  }

  async startSession(
    userId: string,
    dto: StartSharingDto,
  ): Promise<SharingSessionResponse> {
    if (!isValidDurationId(dto.durationId)) {
      throw new ForbiddenException({
        message: 'Invalid sharing duration',
        code: ERROR_CODES.INVALID_DURATION,
      });
    }

    await this.groupsService.assertMember(dto.groupId, userId);

    const existing = await this.findActiveSessionForUser(userId);
    if (existing) {
      throw new ConflictException({
        message: 'You already have an active sharing session',
        code: ERROR_CODES.SHARING_ALREADY_ACTIVE,
      });
    }

    const endsAt = computeEndsAt(dto.durationId);
    const group = await this.prisma.group.findUnique({
      where: { id: dto.groupId },
    });

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sharingSession.create({
        data: {
          userId,
          groupId: dto.groupId,
          durationId: dto.durationId,
          endsAt,
        },
        include: { group: true },
      });

      const members = await tx.groupMember.findMany({
        where: { groupId: dto.groupId, userId: { not: userId } },
      });

      if (members.length > 0) {
        await tx.sessionVisibility.createMany({
          data: members.map((member) => ({
            sessionId: created.id,
            targetUserId: member.userId,
            canSeeMe: true,
          })),
        });
      }

      await tx.groupActivity.create({
        data: {
          groupId: dto.groupId,
          message: `${(await tx.user.findUnique({ where: { id: userId } }))?.name ?? 'Someone'} started sharing`,
        },
      });

      return created;
    });

    this.realtimeGateway.broadcastGroupEvent(dto.groupId, 'sharingStarted', {
      session: this.toSessionResponse({ ...session, group: group! }),
    });

    const sharer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    await this.postSystemMessage(
      dto.groupId,
      `${sharer?.name ?? 'A member'} started sharing their location`,
    );

    return this.toSessionResponse({ ...session, group: group! });
  }

  private async postSystemMessage(
    groupId: string,
    body: string,
  ): Promise<void> {
    const message = await this.prisma.chatMessage.create({
      data: { groupId, type: 'SYSTEM', body },
      include: { user: true },
    });
    this.realtimeGateway.broadcastChatMessage(
      groupId,
      toChatMessageResponse(message),
    );
  }

  async updateDuration(
    userId: string,
    sessionId: string,
    dto: UpdateSharingDurationDto,
  ): Promise<SharingSessionResponse> {
    const session = await this.findOwnedActiveSession(userId, sessionId);
    const endsAt = computeEndsAt(
      resolveDurationId(dto.durationId),
      session.startedAt,
    );

    const updated = await this.prisma.sharingSession.update({
      where: { id: sessionId },
      data: { durationId: dto.durationId, endsAt },
      include: { group: true },
    });

    return this.toSessionResponse(updated);
  }

  async stopSession(userId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      const session = await this.findOwnedActiveSession(userId, sessionId);
      await this.stopSessions([session.id], session.groupId);
      return;
    }

    const sessions = await this.prisma.sharingSession.findMany({
      where: { userId, stoppedAt: null, endsAt: { gt: new Date() } },
    });

    for (const session of sessions) {
      await this.stopSessions([session.id], session.groupId);
    }
  }

  async updateLocation(
    userId: string,
    sessionId: string,
    dto: UpdateLocationDto,
  ): Promise<void> {
    const session = await this.findOwnedActiveSession(userId, sessionId);

    if (session.endsAt <= new Date()) {
      throw new ForbiddenException({
        message: 'Sharing session has expired',
        code: ERROR_CODES.SHARING_EXPIRED,
      });
    }

    const location = await this.prisma.locationUpdate.create({
      data: {
        sessionId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        label: dto.label,
      },
    });

    this.realtimeGateway.broadcastLocationUpdate(session.groupId, userId, {
      memberId: userId,
      latitude: location.latitude,
      longitude: location.longitude,
      locationLabel: location.label ?? undefined,
      updatedAt: location.createdAt.toISOString(),
    });
  }

  async updateVisibility(
    userId: string,
    sessionId: string,
    dto: UpdateVisibilityDto,
  ): Promise<void> {
    const session = await this.findOwnedActiveSession(userId, sessionId);
    await this.groupsService.assertMember(session.groupId, dto.memberId);

    await this.prisma.sessionVisibility.upsert({
      where: {
        sessionId_targetUserId: {
          sessionId,
          targetUserId: dto.memberId,
        },
      },
      create: {
        sessionId,
        targetUserId: dto.memberId,
        canSeeMe: dto.canSeeMe,
      },
      update: { canSeeMe: dto.canSeeMe },
    });
  }

  async getGroupLocations(
    userId: string,
    groupId: string,
  ): Promise<{ locations: MemberLocationResponse[] }> {
    await this.groupsService.assertMember(groupId, userId);

    const sessions = await this.prisma.sharingSession.findMany({
      where: {
        groupId,
        stoppedAt: null,
        endsAt: { gt: new Date() },
        userId: { not: userId },
      },
      include: {
        locations: { orderBy: { createdAt: 'desc' }, take: 1 },
        visibility: { where: { targetUserId: userId } },
      },
    });

    const locations: MemberLocationResponse[] = [];

    for (const session of sessions) {
      const canSee = session.visibility[0]?.canSeeMe ?? true;
      if (!canSee) continue;

      const latest = session.locations[0];
      if (!latest) continue;

      locations.push({
        memberId: session.userId,
        latitude: latest.latitude,
        longitude: latest.longitude,
        locationLabel: latest.label ?? undefined,
        updatedAt: latest.createdAt.toISOString(),
      });
    }

    return { locations };
  }

  private async findActiveSessionForUser(userId: string) {
    return this.prisma.sharingSession.findFirst({
      where: {
        userId,
        stoppedAt: null,
        endsAt: { gt: new Date() },
      },
      include: { group: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  private async findOwnedActiveSession(userId: string, sessionId: string) {
    const session = await this.prisma.sharingSession.findFirst({
      where: {
        id: sessionId,
        userId,
        stoppedAt: null,
        endsAt: { gt: new Date() },
      },
      include: { group: true },
    });

    if (!session) {
      throw new NotFoundException({
        message: 'Active sharing session not found',
        code: ERROR_CODES.SHARING_NOT_FOUND,
      });
    }

    return session;
  }

  private async stopSessions(
    sessionIds: string[],
    groupId: string,
  ): Promise<void> {
    if (sessionIds.length === 0) return;

    await this.prisma.sharingSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { stoppedAt: new Date() },
    });

    this.realtimeGateway.broadcastGroupEvent(groupId, 'sharingStopped', {
      sessionIds,
    });
  }

  private toSessionResponse(
    session: SharingSession & { group: { name: string } },
  ): SharingSessionResponse {
    return {
      id: session.id,
      groupId: session.groupId,
      groupName: session.group.name,
      durationId: session.durationId,
      startedAt: session.startedAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      isActive: !session.stoppedAt && session.endsAt > new Date(),
    };
  }
}
