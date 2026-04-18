import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => GroupsModule),
    forwardRef(() => ChatModule),
  ],
  providers: [RealtimeGateway, RealtimeAuthService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
