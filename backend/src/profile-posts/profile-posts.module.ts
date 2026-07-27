import { Module } from '@nestjs/common';

import { ProfilePostsController } from './profile-posts.controller';
import { ProfilePostsService } from './profile-posts.service';

@Module({
  controllers: [ProfilePostsController],
  providers: [ProfilePostsService],
  exports: [ProfilePostsService],
})
export class ProfilePostsModule {}
