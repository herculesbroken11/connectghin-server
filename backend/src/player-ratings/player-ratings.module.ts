import { Module } from '@nestjs/common';

import { PlayerRatingsController } from './player-ratings.controller';
import { PlayerRatingsService } from './player-ratings.service';

@Module({
  controllers: [PlayerRatingsController],
  providers: [PlayerRatingsService],
})
export class PlayerRatingsModule {}
