import { Module } from '@nestjs/common';

import { GHINVerificationController } from './ghin-verification.controller';
import { GHINVerificationService } from './ghin-verification.service';

@Module({
  controllers: [GHINVerificationController],
  providers: [GHINVerificationService],
})
export class GHINVerificationModule {}
