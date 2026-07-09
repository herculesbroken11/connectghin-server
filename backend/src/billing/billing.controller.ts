import { Body, Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { BillingService } from './billing.service';

type AuthedRequest = Request & { user: { sub: string } };

class GoogleVerifyDto {
  @IsString()
  purchaseToken!: string;

  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  packageName?: string;
}

class GoogleRestoreDto {
  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  packageName?: string;
}

@Controller('billing')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  @Get('me')
  me(@Req() req: AuthedRequest): Promise<unknown> {
    return this.billingService.me(req.user.sub);
  }

  @Post('google/verify')
  verifyGoogle(@Req() req: AuthedRequest, @Body() dto: GoogleVerifyDto): Promise<unknown> {
    this.logger.log(
      `Google verify requested userId=${req.user.sub} productId=${dto.productId} package=${dto.packageName ?? 'default'}`,
    );
    return this.billingService.verifyGoogle(req.user.sub, dto);
  }

  @Post('google/restore')
  restoreGoogle(@Req() req: AuthedRequest, @Body() dto: GoogleRestoreDto): Promise<unknown> {
    this.logger.log(`Google restore requested userId=${req.user.sub}`);
    return this.billingService.restoreGoogle(req.user.sub, dto);
  }
}
