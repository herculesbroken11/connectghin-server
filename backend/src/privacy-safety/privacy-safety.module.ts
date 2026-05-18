import { Module } from '@nestjs/common';

import { PrivacySafetyController } from './privacy-safety.controller';
import { PrivacySafetyService } from './privacy-safety.service';

@Module({
  controllers: [PrivacySafetyController],
  providers: [PrivacySafetyService],
})
export class PrivacySafetyModule {}
