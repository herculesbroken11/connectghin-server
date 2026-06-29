import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FoursomeGameStyle } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
import { FoursomeFeedService } from './foursome-feed.service';

class FoursomeFeedListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(['ALL', 'CASUAL', 'COMPETITIVE', 'TOURNAMENT', 'SERIOUS'])
  gameStyle?: FoursomeGameStyle | 'ALL' = 'ALL';
}

class CreateFoursomeFeedPostDto {
  @IsString()
  @MaxLength(120)
  courseName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  state?: string;

  @IsDateString()
  roundDate!: string;

  @IsString()
  @MaxLength(20)
  teeTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  spotsNeeded!: number;

  @IsIn(['CASUAL', 'COMPETITIVE', 'TOURNAMENT', 'SERIOUS'])
  gameStyle!: FoursomeGameStyle;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  handicapPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  feeLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@UseGuards(JwtAuthGuard, SuspendedUserGuard)
@Controller('foursome-feed')
export class FoursomeFeedController {
  constructor(private readonly service: FoursomeFeedService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: FoursomeFeedListQueryDto): Promise<unknown> {
    return this.service.listFeed(req.user.sub, query);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateFoursomeFeedPostDto): Promise<unknown> {
    return this.service.createPost(req.user.sub, dto);
  }

  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id') id: string): Promise<unknown> {
    return this.service.getPost(req.user.sub, id);
  }

  @Post(':id/contact')
  contact(@Req() req: AuthedRequest, @Param('id') id: string): Promise<unknown> {
    return this.service.contactPoster(req.user.sub, id);
  }
}
