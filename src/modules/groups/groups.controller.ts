import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AddMemberDto, CreateGroupDto, JoinGroupDto, UpdateGroupDto } from './dto/group.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.listGroups(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(user.id, dto);
  }

  @Post('join')
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinGroupDto) {
    return this.groupsService.joinByCode(user.id, dto.code);
  }

  @Get(':groupId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.getGroup(user.id, groupId);
  }

  @Patch(':groupId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(user.id, groupId, dto);
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    await this.groupsService.deleteGroup(user.id, groupId);
  }

  @Post(':groupId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    await this.groupsService.leaveGroup(user.id, groupId);
  }

  @Get(':groupId/members')
  members(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.getMembers(user.id, groupId);
  }

  @Post(':groupId/members')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.groupsService.addMember(user.id, groupId, dto.userId);
  }

  @Delete(':groupId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.groupsService.removeMember(user.id, groupId, memberId);
  }

  @Get(':groupId/activity')
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.getActivity(user.id, groupId);
  }

  @Post(':groupId/invites')
  createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.regenerateInvite(user.id, groupId);
  }
}
