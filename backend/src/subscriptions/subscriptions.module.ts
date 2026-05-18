import { Module } from '@nestjs/common';

import { IapVerificationService } from './iap-verification.service';
import { SubscriptionsNotificationsController } from './subscriptions-notifications.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController, SubscriptionsNotificationsController],
  providers: [SubscriptionsService, IapVerificationService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
