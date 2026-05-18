import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { PlayerRatingsService } from './player-ratings.service';

class CreatePlayerRatingDto {
  @IsString()
  revieweeUserId!: string;

  @IsDateString()
  roundDate!: string;

  @IsString()
  @MaxLength(120)
  course!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  handicapAccuracy!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  sportsmanship!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  paceOfPlay!: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  wouldPlayAgain!: boolean;

  @IsString()
  @MaxLength(2000)
  comment!: string;
}

class PlayerRatingsListQueryDto {
  @IsOptional()
  @IsIn(['all', 'approved', 'flagged', 'pending', 'removed'])
  status?: 'all' | 'approved' | 'flagged' | 'pending' | 'removed' = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

type AuthedRequest = Request & { user: { sub: string } };

@UseGuards(JwtAuthGuard, SuspendedUserGuard)
@Controller('player-ratings')
export class PlayerRatingsController {
  constructor(private readonly service: PlayerRatingsService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreatePlayerRatingDto): Promise<unknown> {
    return this.service.createRating(req.user.sub, dto);
  }

  @Get('users/:userId')
  listForUser(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Query() query: PlayerRatingsListQueryDto,
  ): Promise<unknown> {
    return this.service.listForUser(userId, req.user.sub, query);
  }

  @Get('me/given')
  listMineGiven(@Req() req: AuthedRequest, @Query() query: PlayerRatingsListQueryDto): Promise<unknown> {
    return this.service.listMineGiven(req.user.sub, query);
  }

  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id') id: string): Promise<unknown> {
    return this.service.detail(id, req.user.sub);
  }
}
