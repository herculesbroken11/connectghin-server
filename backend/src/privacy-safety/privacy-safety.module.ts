import { Module } from '@nestjs/common';

import { AccountDeletionPublicController } from './account-deletion-public.controller';
import { PrivacySafetyController } from './privacy-safety.controller';
import { PrivacySafetyService } from './privacy-safety.service';

@Module({
  controllers: [PrivacySafetyController, AccountDeletionPublicController],
  providers: [PrivacySafetyService],
  exports: [PrivacySafetyService],
})
export class PrivacySafetyModule {}
