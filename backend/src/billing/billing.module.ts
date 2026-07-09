import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
