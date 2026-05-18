import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SwipeAction } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { SwipesService } from './swipes.service';

class SwipeDto {
  @IsString()
  toUserId!: string;

  @IsEnum(SwipeAction)
  action!: SwipeAction;
}

type AuthedRequest = Request & { user: { sub: string } };

@Controller('swipes')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class SwipesController {
  constructor(private readonly swipesService: SwipesService) {}

  @Get('daily-status')
  dailyStatus(@Req() req: AuthedRequest) {
    return this.swipesService.getDailySwipeStatus(req.user.sub);
  }

  @Post()
  swipe(@Req() req: AuthedRequest, @Body() dto: SwipeDto): Promise<unknown> {
    return this.swipesService.swipe(req.user.sub, dto.toUserId, dto.action);
  }
}
