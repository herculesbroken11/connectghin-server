import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { SettingsService } from './settings.service';

type AuthedRequest = Request & { user: { sub: string } };

@Controller('settings')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('me')
  get(@Req() req: AuthedRequest): Promise<unknown> {
    return this.service.get(req.user.sub);
  }

  @Patch('me')
  update(@Req() req: AuthedRequest, @Body() body: Record<string, boolean>): Promise<unknown> {
    return this.service.update(req.user.sub, body);
  }
}
