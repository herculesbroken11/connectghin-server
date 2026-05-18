import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { Allow, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { Request } from 'express';

import {
  AdminActivityQueryDto,
  AdminAuditLogsQueryDto,
  AdminAuditLogsSummaryQueryDto,
  AdminGhinQueryDto,
  AdminPlayerRatingsQueryDto,
  AdminReportsQueryDto,
  AdminSearchQueryDto,
  AdminSubscriptionsQueryDto,
  AdminUsersQueryDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';

class ReviewReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  adminNotes?: string;
}

class RejectGhinDto {
  @IsString()
  reason!: string;
}

class UpdateAppSettingDto {
  @IsString()
  key!: string;

  @Allow()
  valueJson!: unknown;
}

class ModeratePlayerRatingDto {
  @IsString()
  @IsIn(['approve', 'delete', 'flag', 'hide', 'remove'])
  action!: 'approve' | 'delete' | 'flag' | 'hide' | 'remove';
}

class SavePlayerRatingNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  adminNotes?: string;
}

class PlayerRatingProfileQueryDto {
  @IsOptional()
  @IsIn(['all', 'flagged', 'low', 'pending', 'removed'])
  filter?: 'all' | 'flagged' | 'low' | 'pending' | 'removed' = 'all';

  @IsOptional()
  @IsIn(['newest', 'lowest', 'highest', 'reported'])
  sort?: 'newest' | 'lowest' | 'highest' | 'reported' = 'newest';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

class AdjustPlayerRatingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  handicapAccuracy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  sportsmanship?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  pace?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  wouldPlayAgain?: boolean;
}

class AdminLoginDto {
  @IsString()
  email!: string;

  @IsString()
  password!: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('auth/login')
  adminLogin(@Body() dto: AdminLoginDto): Promise<unknown> {
    return this.service.adminLogin(dto.email, dto.password);
  }

  @Get('public-config')
  adminPublicConfig(): Promise<unknown> {
    return this.service.adminPublicConfig();
  }

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  dashboardStats(): Promise<unknown> {
    return this.service.dashboardStats();
  }

  @Get('dashboard/activity')
  @UseGuards(JwtAuthGuard, AdminGuard)
  dashboardActivity(@Query() query: AdminActivityQueryDto): Promise<unknown> {
    return this.service.dashboardActivity(query.limit ?? 10);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminSearch(@Query() query: AdminSearchQueryDto): Promise<unknown> {
    return this.service.adminSearch(query.q);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminNotifications(): Promise<unknown> {
    return this.service.adminNotifications();
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  users(@Query() query: AdminUsersQueryDto): Promise<unknown> {
    return this.service.listUsers(query);
  }

  @Get('users/summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  usersSummary(): Promise<unknown> {
    return this.service.usersSummary();
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  userDetail(@Param('id') id: string): Promise<unknown> {
    return this.service.userDetail(id);
  }

  @Patch('users/:id/suspend')
  @UseGuards(JwtAuthGuard, AdminGuard)
  suspend(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.service.suspend(req.user.sub, id);
  }

  @Patch('users/:id/restore')
  @UseGuards(JwtAuthGuard, AdminGuard)
  restore(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.service.restore(req.user.sub, id);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  deleteUser(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.service.deleteUser(req.user.sub, id);
  }

  @Get('ghin-requests')
  @UseGuards(JwtAuthGuard, AdminGuard)
  ghinRequests(@Query() query: AdminGhinQueryDto): Promise<unknown> {
    return this.service.listGhinRequests(query);
  }

  @Get('ghin-requests/summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  ghinRequestsSummary(): Promise<unknown> {
    return this.service.ghinRequestsSummary();
  }

  @Get('ghin-requests/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  ghinDetail(@Param('id') id: string): Promise<unknown> {
    return this.service.ghinDetail(id);
  }

  @Patch('ghin-requests/:id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  approveGhin(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.service.approveGhin(req.user.sub, id);
  }

  @Patch('ghin-requests/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  rejectGhin(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RejectGhinDto,
  ): Promise<{ ok: true }> {
    return this.service.rejectGhin(req.user.sub, id, dto.reason);
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard, AdminGuard)
  reports(@Query() query: AdminReportsQueryDto): Promise<unknown> {
    return this.service.listReports(query);
  }

  @Get('reports/summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  reportsSummary(): Promise<unknown> {
    return this.service.reportsSummary();
  }

  @Get('reports/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  reportDetail(@Param('id') id: string): Promise<unknown> {
    return this.service.reportDetail(id);
  }

  @Patch('reports/:id/review')
  @UseGuards(JwtAuthGuard, AdminGuard)
  reviewReport(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ReviewReportDto,
  ): Promise<{ ok: true }> {
    return this.service.reviewReport(req.user.sub, id, dto.status, dto.adminNotes);
  }

  @Get('player-ratings/summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  playerRatingsSummary(): Promise<unknown> {
    return this.service.playerRatingsSummary();
  }

  @Get('player-ratings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  playerRatings(@Query() query: AdminPlayerRatingsQueryDto): Promise<unknown> {
    return this.service.listPlayerRatings(query);
  }

  @Get('player-ratings/profiles/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  playerRatingProfile(@Param('id') id: string, @Query() query: PlayerRatingProfileQueryDto): Promise<unknown> {
    return this.service.playerRatingProfile(id, query);
  }

  @Get('player-ratings/reviews/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  playerRatingReview(@Param('id') id: string): Promise<unknown> {
    return this.service.playerRatingReview(id);
  }

  @Patch('player-ratings/reviews/:id/moderate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  moderatePlayerRating(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ModeratePlayerRatingDto,
  ): Promise<{ ok: true }> {
    return this.service.moderatePlayerRating(req.user.sub, id, dto.action);
  }

  @Patch('player-ratings/reviews/:id/note')
  @UseGuards(JwtAuthGuard, AdminGuard)
  savePlayerRatingNote(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SavePlayerRatingNoteDto,
  ): Promise<{ ok: true }> {
    return this.service.savePlayerRatingNote(req.user.sub, id, dto.adminNotes ?? '');
  }

  @Patch('player-ratings/reviews/:id/adjust')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adjustPlayerRating(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: AdjustPlayerRatingDto,
  ): Promise<{ ok: true }> {
    return this.service.adjustPlayerRating(req.user.sub, id, dto);
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard, AdminGuard)
  subscriptions(@Query() query: AdminSubscriptionsQueryDto): Promise<unknown> {
    return this.service.listSubscriptions(query);
  }

  @Get('subscriptions/summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  subscriptionsSummary(): Promise<unknown> {
    return this.service.subscriptionsSummary();
  }

  @Get('subscriptions/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  subscriptionDetail(@Param('id') id: string): Promise<unknown> {
    return this.service.subscriptionDetail(id);
  }

  @Get('audit-logs/summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  auditLogsSummary(@Query() query: AdminAuditLogsSummaryQueryDto): Promise<unknown> {
    return this.service.auditLogsSummary(query);
  }

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  auditLogs(@Query() query: AdminAuditLogsQueryDto): Promise<unknown> {
    return this.service.listAuditLogs(query);
  }

  @Get('app-settings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  appSettings(): Promise<unknown> {
    return this.service.getAppSettings();
  }

  @Patch('app-settings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  updateAppSettings(
    @Req() req: AuthedRequest,
    @Body() dto: UpdateAppSettingDto,
  ): Promise<{ ok: true }> {
    return this.service.updateAppSettings(req.user.sub, dto.key, dto.valueJson);
  }
}
