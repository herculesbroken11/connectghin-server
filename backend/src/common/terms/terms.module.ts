import { Global, Module } from '@nestjs/common';

import { TermsAcceptanceService } from './terms-acceptance.service';

@Global()
@Module({
  providers: [TermsAcceptanceService],
  exports: [TermsAcceptanceService],
})
export class TermsModule {}
