import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { SwipesController } from './swipes.controller';
import { SwipesService } from './swipes.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SwipesController],
  providers: [SwipesService],
})
export class SwipesModule {}
