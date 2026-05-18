import { Body, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { UsersService } from './users.service';

class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@Controller('users')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('username-available')
  usernameAvailable(
    @Req() req: AuthedRequest,
    @Query('username') username: string,
  ): Promise<{ available: boolean }> {
    return this.usersService.usernameAvailable(req.user.sub, username ?? '');
  }

  @Get('me')
  me(@Req() req: AuthedRequest): Promise<unknown> {
    return this.usersService.me(req.user.sub);
  }

  @Patch('me')
  updateMe(@Req() req: AuthedRequest, @Body() dto: UpdateMeDto): Promise<unknown> {
    return this.usersService.updateMe(req.user.sub, dto);
  }
}
