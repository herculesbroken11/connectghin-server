import { Module } from '@nestjs/common';

import { ConversationsModule } from '../conversations/conversations.module';
import { FoursomeFeedController } from './foursome-feed.controller';
import { FoursomeFeedService } from './foursome-feed.service';

@Module({
  imports: [ConversationsModule],
  controllers: [FoursomeFeedController],
  providers: [FoursomeFeedService],
})
export class FoursomeFeedModule {}
