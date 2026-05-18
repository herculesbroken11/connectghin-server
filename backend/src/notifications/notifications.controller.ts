import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { NotificationsService } from './notifications.service';

class DeviceTokenDto {
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsString()
  token!: string;
}

class RemoveDeviceTokenDto {
  @IsString()
  token!: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@UseGuards(JwtAuthGuard, SuspendedUserGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  list(@Req() req: AuthedRequest): Promise<unknown> {
    return this.notificationsService.list(req.user.sub);
  }

  @Patch('notifications/:id/read')
  markRead(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.notificationsService.markRead(req.user.sub, id);
  }

  @Patch('notifications/read-all')
  markAllRead(@Req() req: AuthedRequest): Promise<{ ok: true }> {
    return this.notificationsService.markAllRead(req.user.sub);
  }

  @Post('devices/register-token')
  registerToken(@Req() req: AuthedRequest, @Body() dto: DeviceTokenDto): Promise<unknown> {
    return this.notificationsService.registerDeviceToken(req.user.sub, dto.token, dto.platform);
  }

  @Delete('devices/register-token')
  unregisterToken(@Req() req: AuthedRequest, @Body() dto: RemoveDeviceTokenDto): Promise<{ ok: true }> {
    return this.notificationsService.unregisterDeviceToken(req.user.sub, dto.token);
  }
}
