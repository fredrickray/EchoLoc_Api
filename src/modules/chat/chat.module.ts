import { Module, forwardRef } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChatController, ChatUnreadController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [GroupsModule, forwardRef(() => RealtimeModule)],
  controllers: [ChatController, ChatUnreadController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
