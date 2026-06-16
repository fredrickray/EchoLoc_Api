import { Module, forwardRef } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GroupLocationsController, SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  imports: [GroupsModule, forwardRef(() => RealtimeModule)],
  controllers: [SharingController, GroupLocationsController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
