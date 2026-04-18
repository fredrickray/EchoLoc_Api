import { Inject, Logger, forwardRef } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { ChatService } from '../chat/chat.service';
import type {
  ChatMessageResponse,
  ChatReadReceiptResponse,
} from '../chat/dto/chat-response.dto';
import type { SendMessageDto } from '../chat/dto/chat.dto';
import { GroupsService } from '../groups/groups.service';
import type { MemberLocationResponse } from '../sharing/dto/sharing-response.dto';
import { RealtimeAuthService } from './realtime-auth.service';

type JoinGroupPayload = { groupId: string };
type SendMessagePayload = SendMessageDto & { groupId: string };
type TypingPayload = { groupId: string; isTyping: boolean };
type MarkReadPayload = { groupId: string };

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: RealtimeAuthService,
    private readonly groupsService: GroupsService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = await this.authService.authenticateSocket(client);

    if (!userId) {
      client.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    this.logger.debug(`Client connected: ${client.id} user=${userId}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinGroup')
  async joinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinGroupPayload,
  ): Promise<{ ok: true }> {
    const userId = this.authService.requireUserId(client);
    await this.groupsService.assertMember(payload.groupId, userId);

    await client.join(this.groupRoom(payload.groupId));
    return { ok: true };
  }

  @SubscribeMessage('leaveGroup')
  async leaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinGroupPayload,
  ): Promise<{ ok: true }> {
    this.authService.requireUserId(client);
    await client.leave(this.groupRoom(payload.groupId));
    return { ok: true };
  }

  broadcastLocationUpdate(
    groupId: string,
    memberId: string,
    location: MemberLocationResponse,
  ): void {
    this.server.to(this.groupRoom(groupId)).emit('memberLocation', {
      groupId,
      memberId,
      location,
    });
  }

  broadcastGroupEvent(
    groupId: string,
    event: 'sharingStarted' | 'sharingStopped',
    payload: unknown,
  ): void {
    this.server.to(this.groupRoom(groupId)).emit(event, {
      groupId,
      ...(payload as object),
    });
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<{ ok: true; message: ChatMessageResponse }> {
    const userId = this.authService.requireUserId(client);
    const { groupId, ...dto } = payload;
    const message = await this.chatService.sendMessage(userId, groupId, dto);
    return { ok: true, message };
  }

  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ): { ok: true } {
    const userId = this.authService.requireUserId(client);
    client.to(this.groupRoom(payload.groupId)).emit('chatTyping', {
      groupId: payload.groupId,
      userId,
      isTyping: payload.isTyping,
    });
    return { ok: true };
  }

  @SubscribeMessage('markRead')
  async markRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarkReadPayload,
  ): Promise<{ ok: true }> {
    const userId = this.authService.requireUserId(client);
    await this.chatService.markRead(userId, payload.groupId);
    return { ok: true };
  }

  broadcastChatMessage(groupId: string, message: ChatMessageResponse): void {
    this.server.to(this.groupRoom(groupId)).emit('chatMessage', message);
  }

  broadcastChatRead(groupId: string, receipt: ChatReadReceiptResponse): void {
    this.server.to(this.groupRoom(groupId)).emit('chatRead', receipt);
  }

  private groupRoom(groupId: string): string {
    return `group:${groupId}`;
  }
}
