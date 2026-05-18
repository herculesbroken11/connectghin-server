import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  AdminActionType,
  AuthProvider,
  MembershipType,
  ReportStatus,
  SubscriptionStatus,
  VerificationStatus,
} from '@prisma/client';

export class PaginationQueryDto {
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

export class AdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(MembershipType)
  membershipType?: MembershipType;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isSuspended?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isGHINVerified?: boolean;

  @IsOptional()
  @IsEnum(AuthProvider)
  authProvider?: AuthProvider;

  @IsOptional()
  @IsIn(['createdAt', 'email', 'username', 'membershipType'])
  sortBy?: 'createdAt' | 'email' | 'username' | 'membershipType' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}

export class AdminReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(['createdAt', 'status'])
  sortBy?: 'createdAt' | 'status' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}

export class AdminPlayerRatingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['all', 'approved', 'flagged', 'pending', 'removed'])
  status?: 'all' | 'approved' | 'flagged' | 'pending' | 'removed' = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminSubscriptionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  /** Status chip: all | ACTIVE | TRIALING | CANCELED | EXPIRED (latter maps to incomplete/unpaid states). */
  @IsOptional()
  @IsIn(['all', 'ACTIVE', 'TRIALING', 'CANCELED', 'EXPIRED'])
  filter?: 'all' | 'ACTIVE' | 'TRIALING' | 'CANCELED' | 'EXPIRED';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(['createdAt', 'status', 'planCode', 'currentPeriodEnd'])
  sortBy?: 'createdAt' | 'status' | 'planCode' | 'currentPeriodEnd' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}

export class AdminGhinQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @IsOptional()
  @IsIn(['submittedAt', 'status'])
  sortBy?: 'submittedAt' | 'status' = 'submittedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}

export class DiscoveryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  handicapMin?: number;

  @IsOptional()
  @Type(() => Number)
  handicapMax?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  excludeSwiped?: boolean = true;
}

export class AdminAuditLogsSummaryQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class AdminAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AdminActionType)
  actionType?: AdminActionType;

  /** When set (and `actionType` is not), filters to a group of action types. */
  @IsOptional()
  @IsIn(['all', 'user', 'verification', 'settings', 'report', 'billing', 'system'])
  category?: 'all' | 'user' | 'verification' | 'settings' | 'report' | 'billing' | 'system';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(['createdAt', 'actionType'])
  sortBy?: 'createdAt' | 'actionType' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}

export class AdminSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

export class AdminActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
