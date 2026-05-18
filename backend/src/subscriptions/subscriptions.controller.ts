import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { SubscriptionsService } from './subscriptions.service';

type AuthedRequest = Request & { user: { sub: string } };
enum MobileStoreProvider {
  APPLE_APP_STORE = 'APPLE_APP_STORE',
  GOOGLE_PLAY = 'GOOGLE_PLAY',
}

class SyncEntitlementDto {
  @IsEnum(MobileStoreProvider)
  provider!: MobileStoreProvider;

  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  externalSubscriptionId?: string;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;

  @IsOptional()
  @IsISO8601()
  currentPeriodStart?: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;
}

class VerifyAppleDto {
  @IsString()
  transactionId!: string;
}

class VerifyGoogleDto {
  @IsString()
  purchaseToken!: string;
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  me(@Req() req: AuthedRequest): Promise<unknown> {
    return this.subscriptionsService.me(req.user.sub);
  }

  @Post('entitlements/sync')
  syncEntitlement(@Req() req: AuthedRequest, @Body() dto: SyncEntitlementDto): Promise<unknown> {
    return this.subscriptionsService.syncEntitlement(req.user.sub, dto);
  }

  @Post('entitlements/verify/apple')
  verifyApple(@Req() req: AuthedRequest, @Body() dto: VerifyAppleDto): Promise<unknown> {
    return this.subscriptionsService.verifyAndSyncApple(req.user.sub, dto.transactionId);
  }

  @Post('entitlements/verify/google')
  verifyGoogle(@Req() req: AuthedRequest, @Body() dto: VerifyGoogleDto): Promise<unknown> {
    return this.subscriptionsService.verifyAndSyncGoogle(req.user.sub, dto.purchaseToken);
  }

  @Post('cancel')
  cancel(@Req() req: AuthedRequest): Promise<{ ok: true }> {
    return this.subscriptionsService.cancel(req.user.sub);
  }
}
