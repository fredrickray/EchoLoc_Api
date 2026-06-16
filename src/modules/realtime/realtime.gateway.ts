import { Logger } from '@nestjs/common';
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

import { GroupsService } from '../groups/groups.service';
import type { MemberLocationResponse } from '../sharing/dto/sharing-response.dto';
import { RealtimeAuthService } from './realtime-auth.service';

type JoinGroupPayload = { groupId: string };

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

  private groupRoom(groupId: string): string {
    return `group:${groupId}`;
  }
}
