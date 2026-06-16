import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query = '',
  ) {
    return this.usersService.searchUsers(query, user.id);
  }
}
