import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  AdminActionType,
  BillingCycle,
  MembershipType,
  PlayerRatingStatus,
  Prisma,
  ReportStatus,
  SubscriptionProvider,
  SubscriptionStatus,
  UserLifecycleStatus,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import {
  AdminAuditLogsQueryDto,
  AdminAuditLogsSummaryQueryDto,
  AdminGhinQueryDto,
  AdminPlayerRatingsQueryDto,
  AdminReportsQueryDto,
  AdminSubscriptionsQueryDto,
  AdminUsersQueryDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

type ModeratePlayerRatingAction = 'approve' | 'delete' | 'flag' | 'hide';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private readonly notDeletedUser: Prisma.UserWhereInput = {
    lifecycleStatus: { not: UserLifecycleStatus.DELETED },
  };

  /** Login / sidebar branding; no auth required. */
  async adminPublicConfig(): Promise<{ brandName: string }> {
    const row = await this.prisma.appSettings.findUnique({ where: { key: 'admin_brand_name' } });
    const raw = row?.valueJson;
    let brand = typeof raw === 'string' ? raw.trim() : '';
    if (!brand) {
      brand = (process.env.ADMIN_BRAND_NAME ?? '').trim();
    }
    if (!brand) {
      brand = 'ConnectGHIN';
    }
    if (brand.length > 80) {
      brand = brand.slice(0, 80);
    }
    return { brandName: brand };
  }

  private pctChangeWeekOverWeek(current: number, previous: number): number | null {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return current > 0 ? 100 : null;
    return Math.round(((current - previous) / previous) * 100);
  }

  async dashboardStats(): Promise<unknown> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const fortnightAgo = new Date(weekAgo);
    fortnightAgo.setDate(fortnightAgo.getDate() - 7);
    const [
      totalUsers,
      activeUsers,
      premiumUsers,
      verifiedUsers,
      pendingGhin,
      openReports,
      newUsersLast7Days,
      newUsersPrev7Days,
      loginsLast7Days,
      loginsPrev7Days,
      newPremiumLast7Days,
      newPremiumPrev7Days,
      activeSubscriptions,
      ghinPendingSubmittedLast7,
      ghinPendingSubmittedPrev7,
      openReportsCreatedLast7,
      openReportsCreatedPrev7,
      subsActiveTrialingCreatedLast7,
      subsActiveTrialingCreatedPrev7,
      ghinApprovedLast7,
      ghinApprovedPrev7,
      activeSubsApple,
      activeSubsGoogle,
      newSubsAppleLast7,
      newSubsGoogleLast7,
      newSubsApplePrev7,
      newSubsGooglePrev7,
    ] = await Promise.all([
      this.prisma.user.count({ where: this.notDeletedUser }),
      this.prisma.user.count({
        where: { ...this.notDeletedUser, isActive: true, isSuspended: false },
      }),
      this.prisma.user.count({ where: { ...this.notDeletedUser, membershipType: MembershipType.PREMIUM } }),
      this.prisma.profile.count({
        where: { isGHINVerified: true, user: { is: this.notDeletedUser } },
      }),
      this.prisma.gHINVerificationRequest.count({ where: { status: VerificationStatus.PENDING } }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.user.count({ where: { ...this.notDeletedUser, createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({
        where: {
          ...this.notDeletedUser,
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.user.count({
        where: { ...this.notDeletedUser, lastLoginAt: { gte: weekAgo } },
      }),
      this.prisma.user.count({
        where: {
          ...this.notDeletedUser,
          lastLoginAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.user.count({
        where: {
          ...this.notDeletedUser,
          membershipType: MembershipType.PREMIUM,
          createdAt: { gte: weekAgo },
        },
      }),
      this.prisma.user.count({
        where: {
          ...this.notDeletedUser,
          membershipType: MembershipType.PREMIUM,
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
      }),
      this.prisma.gHINVerificationRequest.count({
        where: { status: VerificationStatus.PENDING, submittedAt: { gte: weekAgo } },
      }),
      this.prisma.gHINVerificationRequest.count({
        where: {
          status: VerificationStatus.PENDING,
          submittedAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.report.count({
        where: { status: ReportStatus.OPEN, createdAt: { gte: weekAgo } },
      }),
      this.prisma.report.count({
        where: {
          status: ReportStatus.OPEN,
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          createdAt: { gte: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.adminAuditLog.count({
        where: { actionType: AdminActionType.GHIN_APPROVE, createdAt: { gte: weekAgo } },
      }),
      this.prisma.adminAuditLog.count({
        where: {
          actionType: AdminActionType.GHIN_APPROVE,
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          provider: SubscriptionProvider.APPLE_APP_STORE,
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          provider: SubscriptionProvider.GOOGLE_PLAY,
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          provider: SubscriptionProvider.APPLE_APP_STORE,
          createdAt: { gte: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          provider: SubscriptionProvider.GOOGLE_PLAY,
          createdAt: { gte: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          provider: SubscriptionProvider.APPLE_APP_STORE,
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          provider: SubscriptionProvider.GOOGLE_PLAY,
          createdAt: { gte: fortnightAgo, lt: weekAgo },
        },
      }),
    ]);

    const activeStoreSubs = activeSubsApple + activeSubsGoogle;
    const appleSharePct =
      activeStoreSubs > 0 ? Math.round((activeSubsApple / activeStoreSubs) * 1000) / 10 : null;
    const googleSharePct =
      activeStoreSubs > 0 ? Math.round((activeSubsGoogle / activeStoreSubs) * 1000) / 10 : null;

    const [mrrRow, iapLastSync, iapSyncs7d, iapApple7d, iapGoogle7d, iapUsersDistinct] = await Promise.all([
      this.prisma.$queryRaw<Array<{ mrr: bigint }>>(
        Prisma.sql`
          SELECT COALESCE(SUM(
            CASE
              WHEN s."billingCycle" = 'MONTHLY'::"BillingCycle" AND s."amount" IS NOT NULL THEN s."amount"
              WHEN s."billingCycle" = 'YEARLY'::"BillingCycle" AND s."amount" IS NOT NULL THEN (s."amount" / 12)
              ELSE 0
            END
          ), 0)::bigint AS mrr
          FROM "Subscription" s
          WHERE s."status" IN ('ACTIVE'::"SubscriptionStatus", 'TRIALING'::"SubscriptionStatus")
        `,
      ),
      this.prisma.paymentEvent.findFirst({
        where: { eventType: 'iap.entitlement.sync' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.paymentEvent.count({
        where: { eventType: 'iap.entitlement.sync', createdAt: { gte: weekAgo } },
      }),
      this.prisma.paymentEvent.count({
        where: {
          eventType: 'iap.entitlement.sync',
          createdAt: { gte: weekAgo },
          payloadJson: { path: ['provider'], equals: 'APPLE_APP_STORE' },
        },
      }),
      this.prisma.paymentEvent.count({
        where: {
          eventType: 'iap.entitlement.sync',
          createdAt: { gte: weekAgo },
          payloadJson: { path: ['provider'], equals: 'GOOGLE_PLAY' },
        },
      }),
      this.prisma.paymentEvent.groupBy({
        by: ['userId'],
        where: {
          eventType: 'iap.entitlement.sync',
          userId: { not: null },
        },
        _count: true,
      }),
    ]);

    const estimatedMrrCents = Number(mrrRow[0]?.mrr ?? 0);
    const usersWithIapReceiptSync = iapUsersDistinct.length;

    return {
      totalUsers,
      activeUsers,
      premiumUsers,
      verifiedUsers,
      pendingGhin,
      openReports,
      newUsersLast7Days,
      activeSubscriptions,
      premiumSubscriptions: {
        activeApple: activeSubsApple,
        activeGoogle: activeSubsGoogle,
        appleSharePct,
        googleSharePct,
        newAppleLast7Days: newSubsAppleLast7,
        newGoogleLast7Days: newSubsGoogleLast7,
        newAppleTrendPct: this.pctChangeWeekOverWeek(newSubsAppleLast7, newSubsApplePrev7),
        newGoogleTrendPct: this.pctChangeWeekOverWeek(newSubsGoogleLast7, newSubsGooglePrev7),
      },
      inAppPurchaseSync: {
        lastEntitlementSyncAt: iapLastSync?.createdAt.toISOString() ?? null,
        entitlementSyncsLast7Days: iapSyncs7d,
        entitlementSyncsAppleLast7Days: iapApple7d,
        entitlementSyncsGoogleLast7Days: iapGoogle7d,
        usersWithReceiptSyncRecorded: usersWithIapReceiptSync,
        activeEntitlements: activeSubscriptions,
      },
      estimatedMrrCents,
      trends: {
        totalUsersPct: this.pctChangeWeekOverWeek(newUsersLast7Days, newUsersPrev7Days),
        activeUsersPct: this.pctChangeWeekOverWeek(loginsLast7Days, loginsPrev7Days),
        premiumUsersPct: this.pctChangeWeekOverWeek(newPremiumLast7Days, newPremiumPrev7Days),
        pendingGhinPct: this.pctChangeWeekOverWeek(ghinPendingSubmittedLast7, ghinPendingSubmittedPrev7),
        openReportsPct: this.pctChangeWeekOverWeek(openReportsCreatedLast7, openReportsCreatedPrev7),
        activeSubscriptionsPct: this.pctChangeWeekOverWeek(
          subsActiveTrialingCreatedLast7,
          subsActiveTrialingCreatedPrev7,
        ),
        /** GHIN approvals logged vs prior week (proxy for verified throughput). */
        verifiedUsersPct: this.pctChangeWeekOverWeek(ghinApprovedLast7, ghinApprovedPrev7),
      },
    };
  }

  async usersSummary(): Promise<{
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    premiumUsers: number;
    freeUsers: number;
    verifiedProfiles: number;
  }> {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      premiumUsers,
      freeUsers,
      verifiedProfiles,
    ] = await Promise.all([
      this.prisma.user.count({ where: this.notDeletedUser }),
      this.prisma.user.count({
        where: { ...this.notDeletedUser, isSuspended: false, isActive: true },
      }),
      this.prisma.user.count({ where: { ...this.notDeletedUser, isSuspended: true } }),
      this.prisma.user.count({ where: { ...this.notDeletedUser, membershipType: MembershipType.PREMIUM } }),
      this.prisma.user.count({ where: { ...this.notDeletedUser, membershipType: MembershipType.FREE } }),
      this.prisma.profile.count({
        where: { isGHINVerified: true, user: { is: this.notDeletedUser } },
      }),
    ]);
    return {
      totalUsers,
      activeUsers,
      suspendedUsers,
      premiumUsers,
      freeUsers,
      verifiedProfiles,
    };
  }

  async listUsers(query: AdminUsersQueryDto): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const skip = page * pageSize;
    const where: Prisma.UserWhereInput = { ...this.notDeletedUser };
    if (query.membershipType) {
      where.membershipType = query.membershipType;
    }
    if (query.isSuspended !== undefined) {
      where.isSuspended = query.isSuspended;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.isGHINVerified !== undefined) {
      where.profile = { is: { isGHINVerified: query.isGHINVerified } };
    }
    if (query.authProvider) {
      where.authProvider = query.authProvider;
    }
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortDir },
        include: {
          profile: true,
          ghinRequests: { orderBy: { submittedAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const items = rows.map(({ passwordHash: _pw, ghinRequests, ...u }) => ({
      ...u,
      lastGhinRequest: ghinRequests[0] ?? null,
    }));
    return { items, total, page, pageSize };
  }

  private estimateLifetimeValueCents(
    subs: { amount: number | null; billingCycle: BillingCycle; createdAt: Date; canceledAt: Date | null }[],
  ): number | null {
    if (!subs.length) return null;
    let total = 0;
    let counted = false;
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    for (const sub of subs) {
      if (sub.amount == null) continue;
      const start = sub.createdAt.getTime();
      const end = sub.canceledAt ? sub.canceledAt.getTime() : now;
      const ms = Math.max(0, end - start);
      if (ms === 0) {
        total += sub.amount;
        counted = true;
        continue;
      }
      if (sub.billingCycle === BillingCycle.YEARLY) {
        const periods = Math.max(1, Math.ceil(ms / yearMs));
        total += sub.amount * periods;
      } else {
        const periods = Math.max(1, Math.ceil(ms / monthMs));
        total += sub.amount * periods;
      }
      counted = true;
    }
    return counted ? total : null;
  }

  /** Sum successful billing event amounts (in cents) stored on PaymentEvent rows. */
  private async sumSuccessfulBillingEventCents(userId: string): Promise<number | null> {
    const rows = await this.prisma.paymentEvent.findMany({
      where: {
        eventType: 'invoice.payment_succeeded',
        OR: [{ userId }, { subscription: { is: { userId } } }],
      },
      select: { payloadJson: true },
    });
    let total = 0;
    let any = false;
    for (const row of rows) {
      const cents = extractBillingEventAmountPaidCents(row.payloadJson);
      if (cents != null && cents > 0) {
        total += cents;
        any = true;
      }
    }
    return any ? total : null;
  }

  async userDetail(id: string): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        privacySettings: true,
        subscriptions: { orderBy: { createdAt: 'desc' } },
        profilePhotos: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const uid = user.id;
    const [
      matchesCount,
      messagesCount,
      swipesCount,
      profileViewsCount,
      reportsReceivedCount,
      reportsMadeCount,
      blocksCreated,
      latestGhin,
      recentReportsAgainstUser,
      paymentSumCents,
    ] = await Promise.all([
      this.prisma.match.count({
        where: { isActive: true, OR: [{ userOneId: uid }, { userTwoId: uid }] },
      }),
      this.prisma.message.count({ where: { senderId: uid } }),
      this.prisma.swipe.count({ where: { fromUserId: uid } }),
      this.prisma.swipe.count({ where: { toUserId: uid } }),
      this.prisma.report.count({ where: { targetUserId: uid } }),
      this.prisma.report.count({ where: { reportedByUserId: uid } }),
      this.prisma.block.count({ where: { blockerUserId: uid } }),
      this.prisma.gHINVerificationRequest.findFirst({
        where: { userId: uid },
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.report.findMany({
        where: { targetUserId: uid },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, reason: true, status: true, createdAt: true },
      }),
      this.sumSuccessfulBillingEventCents(uid),
    ]);
    const { passwordHash: _pw, profilePhotos, ...safe } = user;
    const estimateLtvCents = this.estimateLifetimeValueCents(user.subscriptions);
    const lifetimeValueCents =
      paymentSumCents != null && paymentSumCents > 0 ? paymentSumCents : estimateLtvCents;
    const lifetimeValueSource: 'billing_events' | 'estimated' | null =
      paymentSumCents != null && paymentSumCents > 0
        ? 'billing_events'
        : estimateLtvCents != null
          ? 'estimated'
          : null;
    const primaryPhoto = profilePhotos[0] ?? null;
    return {
      ...safe,
      primaryProfilePhoto: primaryPhoto,
      stats: {
        matchesCount,
        messagesCount,
        swipesCount,
        profileViewsCount,
        reportsReceivedCount,
        reportsMadeCount,
        blocksCreated,
      },
      latestGhinRequest: latestGhin,
      recentReportsAgainstUser,
      lifetimeValueCents,
      lifetimeValueSource,
    };
  }

  async suspend(adminUserId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { lifecycleStatus: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new BadRequestException('User is deleted');
    }
    await this.prisma.user.update({ where: { id }, data: { isSuspended: true } });
    await this.log(adminUserId, AdminActionType.USER_SUSPEND, id, {});
    return { ok: true };
  }

  async restore(adminUserId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { lifecycleStatus: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new BadRequestException('User is deleted');
    }
    await this.prisma.user.update({ where: { id }, data: { isSuspended: false, isActive: true } });
    await this.log(adminUserId, AdminActionType.USER_RESTORE, id, {});
    return { ok: true };
  }

  async deleteUser(adminUserId: string, id: string): Promise<{ ok: true }> {
    if (adminUserId === id) {
      throw new BadRequestException('You cannot delete your own admin account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, lifecycleStatus: true, email: true, username: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new BadRequestException('User is already deleted');
    }
    if (target.role === UserRole.ADMIN || target.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot delete admin accounts');
    }
    const stamp = Date.now();
    const archivedEmail = `archived+${id}+${stamp}@user-deleted.invalid`;
    const archivedUsername = `deleted_${id}_${stamp}`;
    await this.prisma.user.update({
      where: { id },
      data: {
        lifecycleStatus: UserLifecycleStatus.DELETED,
        deletedAt: new Date(),
        isActive: false,
        isSuspended: false,
        email: archivedEmail,
        username: archivedUsername,
        refreshTokenVersion: { increment: 1 },
      },
    });
    await this.log(adminUserId, AdminActionType.USER_DELETE, id, {});
    return { ok: true };
  }

  async ghinRequestsSummary(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    appeal: number;
  }> {
    const [total, pending, approved, rejected, appeal] = await Promise.all([
      this.prisma.gHINVerificationRequest.count(),
      this.prisma.gHINVerificationRequest.count({ where: { status: VerificationStatus.PENDING } }),
      this.prisma.gHINVerificationRequest.count({ where: { status: VerificationStatus.VERIFIED } }),
      this.prisma.gHINVerificationRequest.count({ where: { status: VerificationStatus.REJECTED } }),
      this.prisma.gHINVerificationRequest.count({ where: { status: VerificationStatus.APPEAL } }),
    ]);
    return { total, pending, approved, rejected, appeal };
  }

  async listGhinRequests(query: AdminGhinQueryDto): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const skip = page * pageSize;
    const where: Prisma.GHINVerificationRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    const sortBy = query.sortBy ?? 'submittedAt';
    const sortDir = query.sortDir ?? 'desc';
    const [items, total] = await Promise.all([
      this.prisma.gHINVerificationRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortDir },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              createdAt: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      }),
      this.prisma.gHINVerificationRequest.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async ghinDetail(id: string): Promise<unknown> {
    const row = await this.prisma.gHINVerificationRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            createdAt: true,
            profile: { select: { displayName: true, homeCourse: true, bio: true } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('GHIN request not found');
    }
    return row;
  }

  /** GHINder (manual): approval completes verification — profile is GHIN-verified in the app. */
  async approveGhin(adminUserId: string, id: string): Promise<{ ok: true }> {
    const record = await this.prisma.gHINVerificationRequest.update({
      where: { id },
      data: { status: VerificationStatus.VERIFIED, reviewedAt: new Date(), reviewedByAdminId: adminUserId },
    });
    await this.prisma.profile.updateMany({ where: { userId: record.userId }, data: { isGHINVerified: true } });
    await this.log(adminUserId, AdminActionType.GHIN_APPROVE, record.userId, { requestId: id });
    return { ok: true };
  }

  /** GHINder (manual): rejection completes the attempt unsuccessfully — profile is not GHIN-verified. */
  async rejectGhin(adminUserId: string, id: string, reason: string): Promise<{ ok: true }> {
    const record = await this.prisma.gHINVerificationRequest.update({
      where: { id },
      data: {
        status: VerificationStatus.REJECTED,
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedByAdminId: adminUserId,
      },
    });
    await this.prisma.profile.updateMany({ where: { userId: record.userId }, data: { isGHINVerified: false } });
    await this.log(adminUserId, AdminActionType.GHIN_REJECT, record.userId, { requestId: id, reason });
    return { ok: true };
  }

  async reportsSummary(): Promise<{
    total: number;
    open: number;
    reviewed: number;
    resolved: number;
    dismissed: number;
  }> {
    const [total, open, reviewed, resolved, dismissed] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.count({ where: { status: ReportStatus.REVIEWED } }),
      this.prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      this.prisma.report.count({ where: { status: ReportStatus.DISMISSED } }),
    ]);
    return { total, open, reviewed, resolved, dismissed };
  }

  async listReports(query: AdminReportsQueryDto): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const skip = page * pageSize;
    const where: Prisma.ReportWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { reason: { contains: s, mode: 'insensitive' } },
        { details: { contains: s, mode: 'insensitive' } },
      ];
    }
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';
    const userSelect = {
      id: true,
      email: true,
      username: true,
      profile: { select: { displayName: true } },
    } as const;
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortDir },
        include: {
          reportedBy: { select: userSelect },
          targetUser: { select: userSelect },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    const items = rows.map((r) => ({
      ...r,
      severity: inferReportSeverity(r.reason, r.details),
    }));
    return { items, total, page, pageSize };
  }

  async reportDetail(id: string): Promise<unknown> {
    const userSelect = {
      id: true,
      email: true,
      username: true,
      isSuspended: true,
      lifecycleStatus: true,
      createdAt: true,
      profile: { select: { displayName: true } },
    } as const;
    const row = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reportedBy: { select: userSelect },
        targetUser: { select: userSelect },
      },
    });
    if (!row) {
      throw new NotFoundException('Report not found');
    }
    return {
      ...row,
      severity: inferReportSeverity(row.reason, row.details),
    };
  }

  async reviewReport(
    adminUserId: string,
    id: string,
    status: ReportStatus,
    adminNotes?: string,
  ): Promise<{ ok: true }> {
    const report = await this.prisma.report.update({
      where: { id },
      data: {
        status,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        ...(adminNotes !== undefined ? { adminNotes: adminNotes || null } : {}),
      },
    });
    await this.log(adminUserId, AdminActionType.REPORT_REVIEW, report.targetUserId, { reportId: id, status });
    return { ok: true };
  }

  async playerRatingsSummary(): Promise<{ total: number; flagged: number; approved: number; avgRating: number }> {
    const [total, flagged, approved, aggregate] = await Promise.all([
      this.prisma.playerRatingReview.count({ where: { status: { not: PlayerRatingStatus.REMOVED } } }),
      this.prisma.playerRatingReview.count({
        where: { status: PlayerRatingStatus.FLAGGED },
      }),
      this.prisma.playerRatingReview.count({
        where: { status: PlayerRatingStatus.APPROVED },
      }),
      this.prisma.playerRatingReview.aggregate({
        where: { status: { not: PlayerRatingStatus.REMOVED } },
        _avg: { overallRating: true },
      }),
    ]);
    const avgRaw = aggregate._avg.overallRating ?? 0;
    return { total, flagged, approved, avgRating: Number(avgRaw.toFixed(1)) };
  }

  async listPlayerRatings(query: AdminPlayerRatingsQueryDto): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const skip = page * pageSize;
    const where: Prisma.PlayerRatingReviewWhereInput = {};
    if (query.status && query.status !== 'all') {
      where.status = mapPlayerRatingStatusInput(query.status);
    } else {
      where.status = { not: PlayerRatingStatus.REMOVED };
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { reviewer: { is: { profile: { is: { displayName: { contains: s, mode: 'insensitive' } } } } } },
        { reviewee: { is: { profile: { is: { displayName: { contains: s, mode: 'insensitive' } } } } } },
        { reviewer: { is: { username: { contains: s, mode: 'insensitive' } } } },
        { reviewee: { is: { username: { contains: s, mode: 'insensitive' } } } },
        { comment: { contains: s, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.playerRatingReview.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { submittedAt: 'desc' },
        include: {
          reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
          reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        },
      }),
      this.prisma.playerRatingReview.count({ where }),
    ]);
    const items = rows.map((row) => mapPlayerRatingRow(row));
    return { items, total, page, pageSize };
  }

  async playerRatingProfile(
    id: string,
    query?: { filter?: 'all' | 'flagged' | 'low' | 'pending' | 'removed'; sort?: 'newest' | 'lowest' | 'highest' | 'reported'; search?: string },
  ): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        membershipType: true,
        profile: { select: { displayName: true, handicap: true, isGHINVerified: true } },
      },
    });
    if (!user || !user.profile) {
      throw new NotFoundException('Player rating profile not found');
    }
    const [allRows, aggregate] = await Promise.all([
      this.prisma.playerRatingReview.findMany({
        where: { revieweeUserId: id },
        include: {
          reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
          reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        },
      }),
      this.prisma.playerRatingReview.aggregate({
        where: { revieweeUserId: id, status: { not: PlayerRatingStatus.REMOVED } },
        _count: { _all: true },
        _avg: {
          overallRating: true,
          handicapAccuracy: true,
          sportsmanship: true,
          paceOfPlay: true,
        },
      }),
    ]);
    const distributionRows = await this.prisma.playerRatingReview.groupBy({
      by: ['overallRating'],
      where: { revieweeUserId: id, status: { not: PlayerRatingStatus.REMOVED } },
      _count: { _all: true },
    });
    const distributionMap = new Map<number, number>(
      distributionRows.map((d) => [d.overallRating, d._count._all]),
    );
    const totalRatings = aggregate._count._all;
    const wouldPlayAgainCount = await this.prisma.playerRatingReview.count({
      where: { revieweeUserId: id, wouldPlayAgain: true, status: { not: PlayerRatingStatus.REMOVED } },
    });
    const wouldPlayAgainPct =
      totalRatings === 0 ? 0 : Math.round((wouldPlayAgainCount / totalRatings) * 100);
    const counts = {
      all: allRows.length,
      flagged: allRows.filter((r) => r.status === PlayerRatingStatus.FLAGGED).length,
      low: allRows.filter((r) => r.status !== PlayerRatingStatus.REMOVED && r.overallRating <= 2).length,
      pending: allRows.filter((r) => r.status === PlayerRatingStatus.PENDING).length,
      removed: allRows.filter((r) => r.status === PlayerRatingStatus.REMOVED).length,
    };

    const filter = query?.filter ?? 'all';
    const sort = query?.sort ?? 'newest';
    const search = query?.search?.trim().toLowerCase() ?? '';
    let rows = [...allRows];
    if (filter === 'flagged') {
      rows = rows.filter((r) => r.status === PlayerRatingStatus.FLAGGED);
    } else if (filter === 'low') {
      rows = rows.filter((r) => r.status !== PlayerRatingStatus.REMOVED && r.overallRating <= 2);
    } else if (filter === 'pending') {
      rows = rows.filter((r) => r.status === PlayerRatingStatus.PENDING);
    } else if (filter === 'removed') {
      rows = rows.filter((r) => r.status === PlayerRatingStatus.REMOVED);
    }
    if (search) {
      rows = rows.filter((r) => {
        const n = (r.reviewer.profile?.displayName || r.reviewer.username).toLowerCase();
        return (
          n.includes(search) ||
          r.reviewer.username.toLowerCase().includes(search) ||
          r.comment.toLowerCase().includes(search)
        );
      });
    }
    rows.sort((a, b) => {
      if (sort === 'lowest') return a.overallRating - b.overallRating || +b.submittedAt - +a.submittedAt;
      if (sort === 'highest') return b.overallRating - a.overallRating || +b.submittedAt - +a.submittedAt;
      if (sort === 'reported') {
        const ar = a.status === PlayerRatingStatus.FLAGGED ? 1 : 0;
        const br = b.status === PlayerRatingStatus.FLAGGED ? 1 : 0;
        return br - ar || +b.submittedAt - +a.submittedAt;
      }
      return +b.submittedAt - +a.submittedAt;
    });

    const profile = {
      id: user.id,
      name: user.profile.displayName,
      hcp: user.profile.handicap ? String(user.profile.handicap) : '--',
      ghin: user.profile.isGHINVerified ? 'GHIN' : 'Unverified',
      membership: user.membershipType === MembershipType.PREMIUM ? 'Premium' : 'Free',
      averageRating: Number((aggregate._avg.overallRating ?? 0).toFixed(1)),
      totalRatings,
      trend: 'flat',
      handicapAccuracyAvg: Number((aggregate._avg.handicapAccuracy ?? 0).toFixed(1)),
      sportsmanshipAvg: Number((aggregate._avg.sportsmanship ?? 0).toFixed(1)),
      paceAvg: Number((aggregate._avg.paceOfPlay ?? 0).toFixed(1)),
      wouldPlayAgainPct,
      ratingDistribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: distributionMap.get(rating) ?? 0,
      })),
    };
    const ratings = rows.map((row) => mapPlayerRatingRow(row));
    return { profile, ratings, counts, filter, sort };
  }

  async playerRatingReview(id: string): Promise<unknown> {
    const review = await this.prisma.playerRatingReview.findUnique({
      where: { id },
      include: {
        reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
    });
    if (!review) {
      throw new NotFoundException('Player rating review not found');
    }
    const auditRows = await this.prisma.adminAuditLog.findMany({
      where: { actionType: AdminActionType.REPORT_REVIEW },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        adminUser: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    const moderationHistory = auditRows
      .filter((row) => {
        if (!row.metadataJson || typeof row.metadataJson !== 'object') return false;
        const meta = row.metadataJson as Record<string, unknown>;
        return meta.playerRatingId === id;
      })
      .map((row) => {
        const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
        const action =
          typeof meta.moderationAction === 'string'
            ? `Moderation: ${meta.moderationAction}`
            : meta.adjusted === true
              ? 'Adjusted rating/comment'
              : meta.noteSaved === true
                ? 'Saved admin note'
                : 'Updated review';
        return {
          id: row.id,
          action,
          createdAt: row.createdAt.toISOString(),
          adminName: row.adminUser.profile?.displayName || row.adminUser.username,
        };
      });
    return { ...mapPlayerRatingRow(review), moderationHistory };
  }

  async moderatePlayerRating(
    adminUserId: string,
    id: string,
    action: ModeratePlayerRatingAction | 'remove',
  ): Promise<{ ok: true }> {
    const existing = await this.prisma.playerRatingReview.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('Player rating review not found');
    }
    const now = new Date();
    let status: PlayerRatingStatus | undefined;
    let reportedReason: string | null | undefined;
    if (action === 'approve') {
      status = PlayerRatingStatus.APPROVED;
      reportedReason = null;
    } else if (action === 'delete' || action === 'hide' || action === 'remove') {
      status = PlayerRatingStatus.REMOVED;
    } else if (action === 'flag') {
      status = PlayerRatingStatus.FLAGGED;
      reportedReason = 'Flagged by admin moderation';
    }
    await this.prisma.playerRatingReview.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(reportedReason !== undefined ? { reportedReason } : {}),
        reviewedByAdminId: adminUserId,
        reviewedAt: now,
      },
    });
    await this.log(adminUserId, AdminActionType.REPORT_REVIEW, null, {
      playerRatingId: id,
      moderationAction: action,
    });
    return { ok: true };
  }

  async adjustPlayerRating(
    adminUserId: string,
    id: string,
    payload: {
      overallRating?: number;
      handicapAccuracy?: number;
      sportsmanship?: number;
      pace?: number;
      comment?: string;
      wouldPlayAgain?: boolean;
    },
  ): Promise<{ ok: true }> {
    const row = await this.prisma.playerRatingReview.findUnique({ where: { id }, select: { id: true } });
    if (!row) {
      throw new NotFoundException('Player rating review not found');
    }
    const data: Prisma.PlayerRatingReviewUncheckedUpdateInput = {
      reviewedByAdminId: adminUserId,
      reviewedAt: new Date(),
    };
    if (payload.overallRating !== undefined) data.overallRating = payload.overallRating;
    if (payload.handicapAccuracy !== undefined) data.handicapAccuracy = payload.handicapAccuracy;
    if (payload.sportsmanship !== undefined) data.sportsmanship = payload.sportsmanship;
    if (payload.pace !== undefined) data.paceOfPlay = payload.pace;
    if (payload.comment !== undefined) data.comment = payload.comment.trim();
    if (payload.wouldPlayAgain !== undefined) data.wouldPlayAgain = payload.wouldPlayAgain;
    await this.prisma.playerRatingReview.update({ where: { id }, data });
    await this.log(adminUserId, AdminActionType.REPORT_REVIEW, null, {
      playerRatingId: id,
      adjusted: true,
    });
    return { ok: true };
  }

  async savePlayerRatingNote(adminUserId: string, id: string, adminNotes: string): Promise<{ ok: true }> {
    const existing = await this.prisma.playerRatingReview.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('Player rating review not found');
    }
    await this.prisma.playerRatingReview.update({
      where: { id },
      data: {
        adminNotes: adminNotes.trim() || null,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
      },
    });
    await this.log(adminUserId, AdminActionType.REPORT_REVIEW, null, {
      playerRatingId: id,
      noteSaved: true,
    });
    return { ok: true };
  }

  async subscriptionsSummary(): Promise<{
    total: number;
    active: number;
    trialing: number;
    canceled: number;
    expired: number;
  }> {
    const expiredIn: SubscriptionStatus[] = [
      SubscriptionStatus.INCOMPLETE_EXPIRED,
      SubscriptionStatus.INCOMPLETE,
      SubscriptionStatus.UNPAID,
    ];
    const [total, active, trialing, canceled, expired] = await Promise.all([
      this.prisma.subscription.count(),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.TRIALING } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.CANCELED } }),
      this.prisma.subscription.count({ where: { status: { in: expiredIn } } }),
    ]);
    return { total, active, trialing, canceled, expired };
  }

  async subscriptionDetail(id: string): Promise<unknown> {
    const row = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: { select: { displayName: true } },
            profilePhotos: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { imageUrl: true } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Subscription not found');
    }
    const paymentEvents = await this.prisma.paymentEvent.findMany({
      where: {
        subscriptionId: id,
        OR: [{ eventType: 'invoice.payment_succeeded' }, { eventType: 'iap.entitlement.sync' }],
      },
      orderBy: { createdAt: 'desc' },
      take: 36,
      select: { createdAt: true, payloadJson: true, eventType: true },
    });
    const paymentHistory: {
      createdAt: string;
      amountCents: number;
      currency: string;
      invoiceId: string;
      status: string;
      provider: string | null;
    }[] = [];
    let totalRevenueCents = 0;
    for (const ev of paymentEvents) {
      const parsed =
        ev.eventType === 'iap.entitlement.sync'
          ? extractIapEntitlementListItem(ev.payloadJson)
          : extractBillingEventListItem(ev.payloadJson);
      if (!parsed) continue;
      totalRevenueCents += parsed.amountPaidCents;
      paymentHistory.push({
        createdAt: ev.createdAt.toISOString(),
        amountCents: parsed.amountPaidCents,
        currency: parsed.currency,
        invoiceId: parsed.invoiceId,
        status: 'Succeeded',
        provider: parsed.provider ?? row.provider,
      });
    }
    const { user, ...sub } = row;
    const { profilePhotos, ...userSafe } = user;
    const providerDashboardSubscription = null;
    return {
      ...sub,
      user: { ...userSafe, primaryProfilePhoto: profilePhotos[0] ?? null },
      paymentHistory,
      stats: {
        totalRevenueCents,
        successfulPaymentCount: paymentHistory.length,
      },
      providerDashboardSubscription,
    };
  }

  async listSubscriptions(query: AdminSubscriptionsQueryDto): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const skip = page * pageSize;
    const andClauses: Prisma.SubscriptionWhereInput[] = [];
    if (query.filter && query.filter !== 'all') {
      if (query.filter === 'EXPIRED') {
        andClauses.push({
          status: {
            in: [
              SubscriptionStatus.INCOMPLETE_EXPIRED,
              SubscriptionStatus.INCOMPLETE,
              SubscriptionStatus.UNPAID,
            ],
          },
        });
      } else {
        andClauses.push({ status: query.filter as SubscriptionStatus });
      }
    } else if (query.status) {
      andClauses.push({ status: query.status });
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      andClauses.push({
        OR: [
          { planCode: { contains: s, mode: 'insensitive' } },
          { storeExternalId: { contains: s, mode: 'insensitive' } },
          { storeProductId: { contains: s, mode: 'insensitive' } },
          { user: { is: { username: { contains: s, mode: 'insensitive' } } } },
          { user: { is: { email: { contains: s, mode: 'insensitive' } } } },
          { user: { is: { profile: { is: { displayName: { contains: s, mode: 'insensitive' } } } } } },
        ],
      });
    }
    const where: Prisma.SubscriptionWhereInput = andClauses.length ? { AND: andClauses } : {};
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';
    const userSelect = {
      id: true,
      email: true,
      username: true,
      profile: { select: { displayName: true } },
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortDir },
        include: { user: { select: userSelect } },
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  private readonly auditCategoryActions: Record<
    'user' | 'verification' | 'settings' | 'report' | 'billing' | 'system',
    AdminActionType[]
  > = {
    user: [AdminActionType.USER_SUSPEND, AdminActionType.USER_RESTORE, AdminActionType.USER_DELETE],
    verification: [AdminActionType.GHIN_APPROVE, AdminActionType.GHIN_REJECT],
    settings: [AdminActionType.APP_SETTINGS_UPDATE],
    report: [AdminActionType.REPORT_REVIEW, AdminActionType.REPORT_RESOLVE],
    billing: [AdminActionType.SUBSCRIPTION_OVERRIDE],
    system: [AdminActionType.ADMIN_LOGIN],
  };

  private auditLogCreatedAtFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const f: Prisma.DateTimeFilter = {};
    if (from) {
      f.gte = new Date(from);
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      f.lte = end;
    }
    return f;
  }

  async auditLogsSummary(query: AdminAuditLogsSummaryQueryDto): Promise<unknown> {
    const createdAt = this.auditLogCreatedAtFilter(query.from, query.to);
    const base: Prisma.AdminAuditLogWhereInput = createdAt ? { createdAt } : {};
    const c = this.auditCategoryActions;
    const [total, user, verification, settings, report, billing, system] = await Promise.all([
      this.prisma.adminAuditLog.count({ where: base }),
      this.prisma.adminAuditLog.count({
        where: { ...base, actionType: { in: c.user } },
      }),
      this.prisma.adminAuditLog.count({
        where: { ...base, actionType: { in: c.verification } },
      }),
      this.prisma.adminAuditLog.count({
        where: { ...base, actionType: { in: c.settings } },
      }),
      this.prisma.adminAuditLog.count({
        where: { ...base, actionType: { in: c.report } },
      }),
      this.prisma.adminAuditLog.count({
        where: { ...base, actionType: { in: c.billing } },
      }),
      this.prisma.adminAuditLog.count({
        where: { ...base, actionType: { in: c.system } },
      }),
    ]);
    return { total, user, verification, settings, report, billing, system };
  }

  private auditListSeverity(
    action: AdminActionType,
    meta: Record<string, unknown> | null,
  ): 'success' | 'warning' | 'info' | 'error' {
    if (action === AdminActionType.GHIN_APPROVE || action === AdminActionType.USER_RESTORE) {
      return 'success';
    }
    if (action === AdminActionType.REPORT_RESOLVE) {
      return 'success';
    }
    if (action === AdminActionType.GHIN_REJECT || action === AdminActionType.USER_DELETE) {
      return 'error';
    }
    if (action === AdminActionType.USER_SUSPEND || action === AdminActionType.SUBSCRIPTION_OVERRIDE) {
      return 'warning';
    }
    if (action === AdminActionType.REPORT_REVIEW && meta?.status === 'DISMISSED') {
      return 'info';
    }
    return 'info';
  }

  private auditListActionLabel(action: AdminActionType, meta: Record<string, unknown> | null): string {
    if (action === AdminActionType.REPORT_REVIEW) {
      const st = meta?.status;
      if (st === 'DISMISSED') return 'Dismissed report';
      if (st === 'RESOLVED') return 'Resolved report';
      if (st === 'REVIEWED') return 'Reviewed report';
      return 'Report updated';
    }
    const labels: Record<AdminActionType, string> = {
      [AdminActionType.USER_SUSPEND]: 'Suspended user',
      [AdminActionType.USER_RESTORE]: 'Restored user',
      [AdminActionType.USER_DELETE]: 'Deleted user',
      [AdminActionType.GHIN_APPROVE]: 'Approved GHIN verification',
      [AdminActionType.GHIN_REJECT]: 'Rejected GHIN verification',
      [AdminActionType.REPORT_REVIEW]: 'Report updated',
      [AdminActionType.REPORT_RESOLVE]: 'Resolved report',
      [AdminActionType.SUBSCRIPTION_OVERRIDE]: 'Subscription override',
      [AdminActionType.APP_SETTINGS_UPDATE]: 'Changed app settings',
      [AdminActionType.ADMIN_LOGIN]: 'Admin login',
    };
    return labels[action] ?? action;
  }

  private humanizeSettingKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .trim();
  }

  private auditListDetails(action: AdminActionType, meta: Record<string, unknown> | null): string {
    if (!meta) {
      return '';
    }
    if (action === AdminActionType.GHIN_APPROVE) {
      const id = meta.requestId;
      return typeof id === 'string' ? `Verification ${id}` : '';
    }
    if (action === AdminActionType.GHIN_REJECT) {
      const reason = meta.reason;
      if (typeof reason === 'string' && reason.trim()) {
        return reason.length > 200 ? `${reason.slice(0, 197)}…` : reason;
      }
      const id = meta.requestId;
      return typeof id === 'string' ? `Request ${id}` : '';
    }
    if (action === AdminActionType.REPORT_REVIEW || action === AdminActionType.REPORT_RESOLVE) {
      const reportId = meta.reportId;
      const status = meta.status;
      if (typeof reportId === 'string') {
        const tail = reportId.length > 6 ? reportId.slice(-6) : reportId;
        return `Report #${tail}${typeof status === 'string' ? ` → ${status}` : ''}`;
      }
      return '';
    }
    if (action === AdminActionType.APP_SETTINGS_UPDATE && typeof meta.key === 'string') {
      const label = this.humanizeSettingKey(meta.key);
      if (meta.valueJson !== undefined) {
        try {
          const shown = JSON.stringify(meta.valueJson);
          const clipped = shown.length > 120 ? `${shown.slice(0, 117)}…` : shown;
          return `${label}: ${clipped}`;
        } catch {
          return label;
        }
      }
      return label;
    }
    if (action === AdminActionType.ADMIN_LOGIN && typeof meta.email === 'string') {
      return meta.email;
    }
    return '';
  }

  async listAuditLogs(query: AdminAuditLogsQueryDto): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = page * pageSize;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const and: Prisma.AdminAuditLogWhereInput[] = [];
    const createdAt = this.auditLogCreatedAtFilter(query.from, query.to);
    if (createdAt) {
      and.push({ createdAt });
    }
    if (query.actionType) {
      and.push({ actionType: query.actionType });
    } else if (query.category && query.category !== 'all') {
      const actions = this.auditCategoryActions[query.category];
      if (actions?.length) {
        and.push({ actionType: { in: actions } });
      }
    }
    const search = query.search?.trim();
    if (search) {
      and.push({
        OR: [
          { adminUser: { email: { contains: search, mode: 'insensitive' } } },
          { adminUser: { username: { contains: search, mode: 'insensitive' } } },
          {
            adminUser: {
              profile: { is: { displayName: { contains: search, mode: 'insensitive' } } },
            },
          },
          { targetUserId: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.AdminAuditLogWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: pageSize,
        include: {
          adminUser: {
            select: {
              email: true,
              username: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    const targetIds = [...new Set(rows.map((r) => r.targetUserId).filter((id): id is string => Boolean(id)))];
    const targets =
      targetIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: targetIds } },
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true } },
            },
          })
        : [];
    const targetLabelById = new Map(
      targets.map((u) => [
        u.id,
        (u.profile?.displayName?.trim() || u.username || u.id) as string,
      ]),
    );

    const items = rows.map((row) => {
      const meta = row.metadataJson as Record<string, unknown> | null;
      const action = row.actionType;
      const adminDisplayName =
        row.adminUser.profile?.displayName?.trim() ||
        row.adminUser.username ||
        row.adminUser.email;
      const tid = row.targetUserId;
      let targetLabel = '—';
      if (tid) {
        targetLabel = targetLabelById.get(tid) ?? tid;
      } else if (action === AdminActionType.APP_SETTINGS_UPDATE && meta && typeof meta.key === 'string') {
        targetLabel = this.humanizeSettingKey(meta.key);
      } else if (
        (action === AdminActionType.REPORT_REVIEW || action === AdminActionType.REPORT_RESOLVE) &&
        meta &&
        typeof meta.reportId === 'string'
      ) {
        const rid = meta.reportId as string;
        targetLabel = `Report #${rid.length > 6 ? rid.slice(-6) : rid}`;
      }
      return {
        id: row.id,
        adminUserId: row.adminUserId,
        adminEmail: row.adminUser.email,
        adminUsername: row.adminUser.username,
        adminDisplayName,
        actionType: row.actionType,
        actionLabel: this.auditListActionLabel(row.actionType, meta),
        severity: this.auditListSeverity(row.actionType, meta),
        targetUserId: row.targetUserId,
        targetLabel,
        details: this.auditListDetails(row.actionType, meta),
        metadataJson: row.metadataJson,
        createdAt: row.createdAt.toISOString(),
      };
    });
    return { items, total, page, pageSize };
  }

  async adminSearch(q: string): Promise<unknown> {
    const term = q.trim();
    if (term.length < 2) {
      return { users: [], reports: [], ghinRequests: [], subscriptions: [] };
    }
    const [users, reports, ghinRequests, subscriptions] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...this.notDeletedUser,
          OR: [
            { email: { contains: term, mode: 'insensitive' } },
            { username: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 8,
        select: { id: true, email: true, username: true, membershipType: true },
      }),
      this.prisma.report.findMany({
        where: {
          OR: [
            { reason: { contains: term, mode: 'insensitive' } },
            { id: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 8,
        select: { id: true, reason: true, status: true, targetUserId: true },
      }),
      this.prisma.gHINVerificationRequest.findMany({
        where: {
          OR: [
            { ghinNumber: { contains: term, mode: 'insensitive' } },
            { userId: { contains: term, mode: 'insensitive' } },
            { id: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 8,
        select: { id: true, userId: true, ghinNumber: true, status: true },
      }),
      this.prisma.subscription.findMany({
        where: {
          OR: [
            { planCode: { contains: term, mode: 'insensitive' } },
            { userId: { contains: term, mode: 'insensitive' } },
            { id: { contains: term, mode: 'insensitive' } },
            { storeExternalId: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 8,
        select: { id: true, userId: true, planCode: true, status: true, billingCycle: true },
      }),
    ]);
    return { users, reports, ghinRequests, subscriptions };
  }

  async dashboardActivity(limit: number): Promise<unknown> {
    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.adminAuditLog.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: { adminUser: { select: { email: true, username: true } } },
    });
    const billingStoreByRowId = await this.resolveBillingStoreProvidersForActivity(rows);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: this.activityTypeForAction(row.actionType),
        iconVariant: this.activityIconVariant(row.actionType),
        action: this.activityTitle(row.actionType),
        description: this.activityDescription(row),
        at: row.createdAt.toISOString(),
        admin: row.adminUser.username ?? row.adminUser.email,
        severity: this.activitySeverity(row.actionType),
        storeProvider:
          row.actionType === AdminActionType.SUBSCRIPTION_OVERRIDE
            ? (billingStoreByRowId.get(row.id) ?? null)
            : undefined,
      })),
    };
  }

  /** App Store / Play provider for subscription audit rows (metadata or Subscription lookup). */
  private async resolveBillingStoreProvidersForActivity(
    rows: { id: string; actionType: AdminActionType; metadataJson: unknown }[],
  ): Promise<Map<string, SubscriptionProvider>> {
    const out = new Map<string, SubscriptionProvider>();
    const subscriptionIds = new Set<string>();
    for (const row of rows) {
      if (row.actionType !== AdminActionType.SUBSCRIPTION_OVERRIDE) continue;
      const fromMeta = parseBillingStoreFromMeta(row.metadataJson);
      if (fromMeta) {
        out.set(row.id, fromMeta);
        continue;
      }
      const m = row.metadataJson as Record<string, unknown> | null;
      const sid = m && typeof m.subscriptionId === 'string' ? m.subscriptionId : null;
      if (sid) subscriptionIds.add(sid);
    }
    if (subscriptionIds.size === 0) return out;
    const subs = await this.prisma.subscription.findMany({
      where: { id: { in: [...subscriptionIds] } },
      select: { id: true, provider: true },
    });
    const subById = new Map(subs.map((s) => [s.id, s.provider]));
    for (const row of rows) {
      if (row.actionType !== AdminActionType.SUBSCRIPTION_OVERRIDE || out.has(row.id)) continue;
      const m = row.metadataJson as Record<string, unknown> | null;
      const sid = m && typeof m.subscriptionId === 'string' ? m.subscriptionId : null;
      if (!sid) continue;
      const p = subById.get(sid);
      if (p === SubscriptionProvider.APPLE_APP_STORE || p === SubscriptionProvider.GOOGLE_PLAY) {
        out.set(row.id, p);
      }
    }
    return out;
  }

  async adminNotifications(): Promise<unknown> {
    const [pendingGhin, openReports, pastDue] = await Promise.all([
      this.prisma.gHINVerificationRequest.count({ where: { status: VerificationStatus.PENDING } }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
    ]);
    const items: Array<{
      id: string;
      type: 'verification' | 'report' | 'billing' | 'system';
      title: string;
      message: string;
      at: string;
      read: boolean;
      link: string;
    }> = [];
    const now = new Date().toISOString();
    if (pendingGhin > 0) {
      items.push({
        id: 'sys-pending-ghin',
        type: 'verification',
        title: 'GHIN verification queue',
        message: `${pendingGhin} pending request(s) need review`,
        at: now,
        read: false,
        link: '/verification',
      });
    }
    if (openReports > 0) {
      items.push({
        id: 'sys-open-reports',
        type: 'report',
        title: 'Open safety reports',
        message: `${openReports} open report(s)`,
        at: now,
        read: false,
        link: '/reports',
      });
    }
    if (pastDue > 0) {
      items.push({
        id: 'sys-past-due-subs',
        type: 'billing',
        title: 'Past-due subscriptions',
        message: `${pastDue} subscription(s) are past due`,
        at: now,
        read: false,
        link: '/subscriptions',
      });
    }
    return { items };
  }

  private activityIconVariant(
    action: AdminActionType,
  ):
    | 'ghin-approve'
    | 'ghin-reject'
    | 'user-suspend'
    | 'user-restore'
    | 'user-delete'
    | 'report-review'
    | 'report-resolve'
    | 'subscription'
    | 'settings'
    | 'admin-login'
    | 'system' {
    switch (action) {
      case AdminActionType.GHIN_APPROVE:
        return 'ghin-approve';
      case AdminActionType.GHIN_REJECT:
        return 'ghin-reject';
      case AdminActionType.USER_SUSPEND:
        return 'user-suspend';
      case AdminActionType.USER_RESTORE:
        return 'user-restore';
      case AdminActionType.USER_DELETE:
        return 'user-delete';
      case AdminActionType.REPORT_REVIEW:
        return 'report-review';
      case AdminActionType.REPORT_RESOLVE:
        return 'report-resolve';
      case AdminActionType.SUBSCRIPTION_OVERRIDE:
        return 'subscription';
      case AdminActionType.APP_SETTINGS_UPDATE:
        return 'settings';
      case AdminActionType.ADMIN_LOGIN:
        return 'admin-login';
      default:
        return 'system';
    }
  }

  private activityTypeForAction(
    action: AdminActionType,
  ): 'verification' | 'user' | 'report' | 'billing' | 'settings' | 'system' {
    if (action === AdminActionType.GHIN_APPROVE || action === AdminActionType.GHIN_REJECT) {
      return 'verification';
    }
    if (action === AdminActionType.USER_SUSPEND || action === AdminActionType.USER_RESTORE || action === AdminActionType.USER_DELETE) {
      return 'user';
    }
    if (action === AdminActionType.REPORT_REVIEW || action === AdminActionType.REPORT_RESOLVE) {
      return 'report';
    }
    if (action === AdminActionType.SUBSCRIPTION_OVERRIDE) {
      return 'billing';
    }
    if (action === AdminActionType.APP_SETTINGS_UPDATE) {
      return 'settings';
    }
    return 'system';
  }

  private activityTitle(action: AdminActionType): string {
    const labels: Record<AdminActionType, string> = {
      [AdminActionType.USER_SUSPEND]: 'User suspended',
      [AdminActionType.USER_RESTORE]: 'User restored',
      [AdminActionType.USER_DELETE]: 'User deleted',
      [AdminActionType.GHIN_APPROVE]: 'GHIN approved',
      [AdminActionType.GHIN_REJECT]: 'GHIN rejected',
      [AdminActionType.REPORT_REVIEW]: 'Report reviewed',
      [AdminActionType.REPORT_RESOLVE]: 'Report resolved',
      [AdminActionType.SUBSCRIPTION_OVERRIDE]: 'Subscription override',
      [AdminActionType.APP_SETTINGS_UPDATE]: 'App settings updated',
      [AdminActionType.ADMIN_LOGIN]: 'Admin signed in',
    };
    return labels[action] ?? action;
  }

  private activitySeverity(action: AdminActionType): 'success' | 'warning' | 'error' | 'info' {
    if (action === AdminActionType.USER_SUSPEND || action === AdminActionType.GHIN_REJECT) {
      return 'warning';
    }
    if (action === AdminActionType.USER_DELETE) {
      return 'error';
    }
    if (action === AdminActionType.GHIN_APPROVE || action === AdminActionType.USER_RESTORE) {
      return 'success';
    }
    return 'info';
  }

  private activityDescription(row: {
    actionType: AdminActionType;
    targetUserId: string | null;
    metadataJson: unknown;
  }): string {
    const meta = row.metadataJson as Record<string, unknown> | null;
    if (row.actionType === AdminActionType.GHIN_APPROVE || row.actionType === AdminActionType.GHIN_REJECT) {
      const requestId = meta?.requestId;
      return typeof requestId === 'string' ? `Request ${requestId}` : 'GHIN verification request';
    }
    if (row.actionType === AdminActionType.REPORT_REVIEW || row.actionType === AdminActionType.REPORT_RESOLVE) {
      const reportId = meta?.reportId;
      const status = meta?.status;
      return typeof reportId === 'string'
        ? `Report ${reportId}${typeof status === 'string' ? ` → ${status}` : ''}`
        : 'Report updated';
    }
    if (row.actionType === AdminActionType.APP_SETTINGS_UPDATE && meta?.key) {
      return `Key: ${String(meta.key)}`;
    }
    if (row.actionType === AdminActionType.SUBSCRIPTION_OVERRIDE) {
      const sid = meta?.subscriptionId;
      if (typeof sid === 'string' && sid.length > 0) {
        return `Subscription ${sid}`;
      }
    }
    if (row.targetUserId) {
      return `Target user ${row.targetUserId}`;
    }
    return '';
  }

  getAppSettings(): Promise<unknown> {
    return this.prisma.appSettings.findMany({ orderBy: { key: 'asc' } });
  }

  async updateAppSettings(adminUserId: string, key: string, valueJson: unknown): Promise<{ ok: true }> {
    const json = valueJson as Prisma.InputJsonValue;
    await this.prisma.appSettings.upsert({
      where: { key },
      update: { valueJson: json },
      create: { key, valueJson: json },
    });
    await this.log(adminUserId, AdminActionType.APP_SETTINGS_UPDATE, null, { key, valueJson });
    return { ok: true };
  }

  async adminLogin(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    const tokenClaims = {
      sub: user.id,
      role: user.role,
      refreshTokenVersion: user.refreshTokenVersion,
      email: user.email,
      username: user.username,
    };
    const accessToken = await this.jwtService.signAsync(tokenClaims, {
      expiresIn: '15m',
      secret: process.env.JWT_ACCESS_SECRET,
    });
    const refreshToken = await this.jwtService.signAsync(tokenClaims, {
      expiresIn: '30d',
      secret: process.env.JWT_REFRESH_SECRET,
    });
    await this.log(user.id, AdminActionType.ADMIN_LOGIN, null, { email: user.email });
    return { accessToken, refreshToken };
  }

  private async log(
    adminUserId: string,
    actionType: AdminActionType,
    targetUserId: string | null,
    metadataJson: unknown,
  ): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: { adminUserId, actionType, targetUserId: targetUserId ?? undefined, metadataJson: metadataJson as never },
    });
  }
}

function mapPlayerRatingStatusInput(status: 'approved' | 'flagged' | 'pending' | 'removed'): PlayerRatingStatus {
  if (status === 'approved') return PlayerRatingStatus.APPROVED;
  if (status === 'flagged') return PlayerRatingStatus.FLAGGED;
  if (status === 'removed') return PlayerRatingStatus.REMOVED;
  return PlayerRatingStatus.PENDING;
}

function mapPlayerRatingStatusOutput(status: PlayerRatingStatus): 'approved' | 'flagged' | 'pending' | 'removed' {
  if (status === PlayerRatingStatus.APPROVED) return 'approved';
  if (status === PlayerRatingStatus.FLAGGED) return 'flagged';
  if (status === PlayerRatingStatus.REMOVED) return 'removed';
  return 'pending';
}

function mapPlayerRatingRow(row: {
  id: string;
  revieweeUserId: string;
  reviewerUserId: string;
  roundDate: Date;
  submittedAt: Date;
  course: string;
  overallRating: number;
  handicapAccuracy: number;
  sportsmanship: number;
  paceOfPlay: number;
  wouldPlayAgain: boolean;
  comment: string;
  status: PlayerRatingStatus;
  reportedReason: string | null;
  adminNotes: string | null;
  reviewer: { id: string; username: string; profile: { displayName: string } | null };
  reviewee: { id: string; username: string; profile: { displayName: string } | null };
}) {
  return {
    id: row.id,
    profileId: row.revieweeUserId,
    reviewerName: row.reviewer.profile?.displayName || row.reviewer.username,
    reviewerHandle: row.reviewer.username,
    reviewerId: row.reviewer.id,
    revieweeName: row.reviewee.profile?.displayName || row.reviewee.username,
    revieweeHandle: row.reviewee.username,
    revieweeId: row.reviewee.id,
    roundDate: row.roundDate.toISOString().slice(0, 10),
    submittedDate: row.submittedAt.toISOString().slice(0, 10),
    course: row.course,
    overallRating: row.overallRating,
    handicapAccuracy: row.handicapAccuracy,
    sportsmanship: row.sportsmanship,
    pace: row.paceOfPlay,
    wouldPlayAgain: row.wouldPlayAgain,
    comment: row.comment,
    status: mapPlayerRatingStatusOutput(row.status),
    reportedReason: row.reportedReason ?? undefined,
    adminNotes: row.adminNotes ?? undefined,
  };
}

/** Reads amount in cents from a stored successful billing event payload. */
function extractBillingEventAmountPaidCents(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== 'object') return null;
  const obj = (data as Record<string, unknown>).object;
  if (!obj || typeof obj !== 'object') return null;
  const inv = obj as Record<string, unknown>;
  const ap = inv.amount_paid;
  if (typeof ap === 'number' && Number.isFinite(ap)) return ap;
  return null;
}

function parseBillingStoreFromMeta(metadataJson: unknown): SubscriptionProvider | null {
  if (!metadataJson || typeof metadataJson !== 'object') return null;
  const m = metadataJson as Record<string, unknown>;
  const p = m.provider ?? m.subscriptionProvider ?? m.storeProvider;
  if (p === SubscriptionProvider.APPLE_APP_STORE || p === 'APPLE_APP_STORE') {
    return SubscriptionProvider.APPLE_APP_STORE;
  }
  if (p === SubscriptionProvider.GOOGLE_PLAY || p === 'GOOGLE_PLAY') {
    return SubscriptionProvider.GOOGLE_PLAY;
  }
  return null;
}

function extractIapEntitlementListItem(
  payload: unknown,
): { invoiceId: string; amountPaidCents: number; currency: string; provider: string | null } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const productId = typeof p.productId === 'string' ? p.productId : 'iap';
  const ext = typeof p.externalSubscriptionId === 'string' ? p.externalSubscriptionId : '';
  const invoiceId = ext ? `iap:${productId}:${ext}` : `iap:${productId}`;
  const rawProv = p.provider;
  const provider =
    rawProv === 'APPLE_APP_STORE' || rawProv === 'GOOGLE_PLAY'
      ? rawProv
      : typeof rawProv === 'string' && rawProv.length > 0
        ? rawProv
        : null;
  return { invoiceId, amountPaidCents: 0, currency: 'usd', provider };
}

function extractBillingEventListItem(
  payload: unknown,
): { invoiceId: string; amountPaidCents: number; currency: string; provider: null } | null {
  const amountPaidCents = extractBillingEventAmountPaidCents(payload);
  if (amountPaidCents == null || amountPaidCents <= 0) return null;
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== 'object') return null;
  const obj = (data as Record<string, unknown>).object as Record<string, unknown> | undefined;
  if (!obj || typeof obj !== 'object') return null;
  const id = typeof obj.id === 'string' ? obj.id : null;
  if (!id) return null;
  const currency = typeof obj.currency === 'string' ? obj.currency : 'usd';
  return { invoiceId: id, amountPaidCents, currency, provider: null };
}

/** Display-only severity for admin UI (no DB column). */
function inferReportSeverity(reason: string, details: string | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' {
  const t = `${reason} ${details ?? ''}`.toLowerCase();
  if (/\b(harassment|threat|violence|abuse|danger|stalking)\b/.test(t)) {
    return 'HIGH';
  }
  if (/\b(spam|scam|fake|bot)\b/.test(t)) {
    return 'LOW';
  }
  return 'MEDIUM';
}
