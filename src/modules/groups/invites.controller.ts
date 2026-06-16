import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { GroupsService } from './groups.service';

@Controller('invites')
export class InvitesController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.getPendingInvites(user.id);
  }

  @Get(':inviteId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId') inviteId: string,
  ) {
    return this.groupsService.getInvite(user.id, inviteId);
  }

  @Post(':inviteId/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId') inviteId: string,
  ) {
    return this.groupsService.acceptInvite(user.id, inviteId);
  }

  @Post(':inviteId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  async decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId') inviteId: string,
  ) {
    await this.groupsService.declineInvite(user.id, inviteId);
  }
}
