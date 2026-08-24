import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { SettingsService } from './settings.service';

type AuthedRequest = Request & { user: { sub: string } };

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  /** Public (non-secret) legal/contact settings for mobile Privacy/Terms. */
  @Get('public-legal')
  publicLegal(): Promise<unknown> {
    return this.service.getPublicLegal();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, SuspendedUserGuard)
  get(@Req() req: AuthedRequest): Promise<unknown> {
    return this.service.get(req.user.sub);
  }

  /** Profile + notification + privacy toggles for Settings UI. */
  @Get('overview')
  @UseGuards(JwtAuthGuard, SuspendedUserGuard)
  overview(@Req() req: AuthedRequest): Promise<unknown> {
    return this.service.overview(req.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, SuspendedUserGuard)
  update(@Req() req: AuthedRequest, @Body() body: Record<string, boolean>): Promise<unknown> {
    return this.service.update(req.user.sub, body);
  }
}
