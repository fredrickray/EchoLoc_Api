import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ChatService } from './chat.service';
import { GetMessagesQueryDto, SendMessageDto } from './dto/chat.dto';

@Controller('groups/:groupId/messages')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.chatService.getMessages(user.id, groupId, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Post()
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user.id, groupId, dto);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.chatService.markRead(user.id, groupId);
  }
}

@Controller('chat')
export class ChatUnreadController {
  constructor(private readonly chatService: ChatService) {}

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getUnreadCounts(user.id);
  }
}
