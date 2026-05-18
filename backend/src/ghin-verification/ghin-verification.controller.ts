import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { GHINVerificationService } from './ghin-verification.service';

class GHINRequestDto {
  @IsString()
  @MaxLength(32)
  ghinNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  submittedFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  submittedLastName?: string;
}

class GHINAppealDto {
  @IsString()
  appealNote!: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@Controller('ghin-verification')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class GHINVerificationController {
  constructor(private readonly service: GHINVerificationService) {}

  @Get('me')
  me(@Req() req: AuthedRequest): Promise<unknown> {
    return this.service.me(req.user.sub);
  }

  @Post('request')
  request(@Req() req: AuthedRequest, @Body() dto: GHINRequestDto): Promise<unknown> {
    return this.service.request(req.user.sub, dto.ghinNumber, {
      submittedFirstName: dto.submittedFirstName,
      submittedLastName: dto.submittedLastName,
    });
  }

  @Post('appeal')
  appeal(@Req() req: AuthedRequest, @Body() dto: GHINAppealDto): Promise<unknown> {
    return this.service.appeal(req.user.sub, dto.appealNote);
  }
}
