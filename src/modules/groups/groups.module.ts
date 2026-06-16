import { Module } from '@nestjs/common';

import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { InvitesController } from './invites.controller';

@Module({
  controllers: [GroupsController, InvitesController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
