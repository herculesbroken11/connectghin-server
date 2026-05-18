import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { PrivacySafetyService } from './privacy-safety.service';

class ReportDto {
  @IsString()
  targetUserId!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  details?: string;
}

class BlockDto {
  @IsString()
  blockedUserId!: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@UseGuards(JwtAuthGuard, SuspendedUserGuard)
@Controller()
export class PrivacySafetyController {
  constructor(private readonly service: PrivacySafetyService) {}

  @Get('privacy-settings/me')
  getPrivacy(@Req() req: AuthedRequest): Promise<unknown> {
    return this.service.getPrivacy(req.user.sub);
  }

  @Patch('privacy-settings/me')
  updatePrivacy(
    @Req() req: AuthedRequest,
    @Body() body: Record<string, boolean>,
  ): Promise<unknown> {
    return this.service.updatePrivacy(req.user.sub, body);
  }

  @Post('reports')
  report(@Req() req: AuthedRequest, @Body() dto: ReportDto): Promise<unknown> {
    return this.service.report(req.user.sub, dto.targetUserId, dto.reason, dto.details);
  }

  @Post('blocks')
  block(@Req() req: AuthedRequest, @Body() dto: BlockDto): Promise<unknown> {
    return this.service.block(req.user.sub, dto.blockedUserId);
  }

  @Get('blocks')
  listBlocks(@Req() req: AuthedRequest): Promise<unknown> {
    return this.service.listBlocks(req.user.sub);
  }

  @Delete('blocks/:blockedUserId')
  unblock(
    @Req() req: AuthedRequest,
    @Param('blockedUserId') blockedUserId: string,
  ): Promise<{ ok: true }> {
    return this.service.unblock(req.user.sub, blockedUserId);
  }

  @Post('account/delete-request')
  deleteRequest(@Req() req: AuthedRequest, @Body() body: { reason?: string }): Promise<unknown> {
    return this.service.deleteRequest(req.user.sub, body.reason);
  }
}
