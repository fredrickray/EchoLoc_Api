import { Inject, Injectable, forwardRef } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { GroupsService } from '../groups/groups.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { toChatMessageResponse } from './chat.mapper';
import type {
  ChatHistoryResponse,
  ChatMessageResponse,
  ChatReadReceiptResponse,
  ChatUnreadCountResponse,
} from './dto/chat-response.dto';
import type { SendMessageDto } from './dto/chat.dto';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupsService: GroupsService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async getMessages(
    userId: string,
    groupId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<ChatHistoryResponse> {
    await this.groupsService.assertMember(groupId, userId);

    const take = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const messages = await this.prisma.chatMessage.findMany({
      where: { groupId, deletedAt: null },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(options.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = messages.length > take;
    const page = hasMore ? messages.slice(0, take) : messages;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const readState = await this.getReadState(groupId);

    return {
      messages: page.reverse().map((message) => toChatMessageResponse(message)),
      readState,
      nextCursor,
    };
  }

  async sendMessage(
    userId: string,
    groupId: string,
    dto: SendMessageDto,
  ): Promise<ChatMessageResponse> {
    await this.groupsService.assertMember(groupId, userId);

    const isLocation = dto.type === 'location';

    const message = await this.prisma.chatMessage.create({
      data: {
        groupId,
        userId,
        type: isLocation ? 'LOCATION' : 'TEXT',
        body: dto.body.trim(),
        latitude: isLocation ? dto.latitude : null,
        longitude: isLocation ? dto.longitude : null,
        locationLabel: isLocation ? dto.locationLabel : null,
      },
      include: { user: true },
    });

    await this.prisma.groupMember.updateMany({
      where: { groupId, userId },
      data: { lastReadAt: message.createdAt },
    });

    const response = toChatMessageResponse(message);
    this.realtimeGateway.broadcastChatMessage(groupId, response);
    return response;
  }

  async markRead(
    userId: string,
    groupId: string,
  ): Promise<ChatReadReceiptResponse> {
    await this.groupsService.assertMember(groupId, userId);

    const lastReadAt = new Date();
    await this.prisma.groupMember.updateMany({
      where: { groupId, userId },
      data: { lastReadAt },
    });

    const receipt: ChatReadReceiptResponse = {
      groupId,
      userId,
      lastReadAt: lastReadAt.toISOString(),
    };

    this.realtimeGateway.broadcastChatRead(groupId, receipt);
    return receipt;
  }

  async getUnreadCounts(
    userId: string,
  ): Promise<{ counts: ChatUnreadCountResponse[] }> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, group: { deletedAt: null } },
    });

    const counts = await Promise.all(
      memberships.map(async (membership) => {
        const unread = await this.prisma.chatMessage.count({
          where: {
            groupId: membership.groupId,
            deletedAt: null,
            userId: { not: userId },
            ...(membership.lastReadAt
              ? { createdAt: { gt: membership.lastReadAt } }
              : {}),
          },
        });

        return { groupId: membership.groupId, unread };
      }),
    );

    return { counts };
  }

  private async getReadState(groupId: string) {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true, lastReadAt: true },
    });

    return members.map((member) => ({
      userId: member.userId,
      lastReadAt: member.lastReadAt ? member.lastReadAt.toISOString() : null,
    }));
  }
}
