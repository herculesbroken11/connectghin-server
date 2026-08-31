import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FoursomePostStatus,
  ReportTargetType,
  UserLifecycleStatus,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

import { normalizeProfilePhotoUrl } from '../common/utils/profile-photo-url';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const FEED_REPORT_REASONS = new Set([
  'HARASSMENT',
  'HATE',
  'SEXUAL',
  'SPAM',
  'DANGEROUS',
  'OTHER',
]);

const MAX_REPORT_DETAILS = 2000;
const WEB_DELETION_TOKEN_TTL_MS = 1000 * 60 * 60;
const WEB_DELETION_GENERIC_MESSAGE =
  'If an account exists for that email, we sent a confirmation link. Check your inbox and spam folder.';

@Injectable()
export class PrivacySafetyService {
  private readonly logger = new Logger(PrivacySafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  getPrivacy(userId: string): Promise<unknown> {
    return this.prisma.privacySettings.findUnique({ where: { userId } });
  }

  updatePrivacy(userId: string, data: Record<string, boolean>): Promise<unknown> {
    const allowed = [
      'showInDiscovery',
      'showDistance',
      'showOnlineStatus',
      'showLastActive',
      'allowMessagesFromMatches',
      'showReadReceipts',
      'showLocation',
      'publicProfile',
    ] as const;
    const patch: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof data[key] === 'boolean') {
        patch[key] = data[key];
      }
    }
    return this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    });
  }

  async report(
    reportedByUserId: string,
    targetUserId: string,
    reason: string,
    details?: string,
  ): Promise<unknown> {
    if (reportedByUserId === targetUserId) {
      throw new BadRequestException({
        code: 'INVALID_REPORT_TARGET',
        message: 'You cannot report yourself',
      });
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, lifecycleStatus: true },
    });
    if (!target || target.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    const trimmedDetails =
      details?.trim() && details.trim().length > 0
        ? details.trim().slice(0, MAX_REPORT_DETAILS)
        : undefined;
    const created = await this.prisma.report.create({
      data: {
        reportedByUserId,
        targetUserId,
        targetType: ReportTargetType.USER,
        reason: reason.trim().slice(0, 120),
        details: trimmedDetails,
      },
    });
    return {
      success: true,
      reportId: created.id,
      status: created.status.toLowerCase() === 'open' ? 'pending' : created.status,
    };
  }

  block(blockerUserId: string, blockedUserId: string): Promise<unknown> {
    if (blockerUserId === blockedUserId) {
      throw new BadRequestException('Cannot block yourself');
    }
    return this.prisma.block.upsert({
      where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
      update: {},
      create: { blockerUserId, blockedUserId },
    });
  }

  async listBlocks(userId: string): Promise<
    Array<{
      blockedUserId: string;
      createdAt: string;
      displayName: string;
      username: string;
      photoUrl: string | null;
    }>
  > {
    const rows = await this.prisma.block.findMany({
      where: { blockerUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: {
            username: true,
            profile: { select: { displayName: true } },
            profilePhotos: {
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
              select: { imageUrl: true },
            },
          },
        },
      },
    });
    return rows.map((r) => {
      const u = r.blocked;
      const displayName = u.profile?.displayName?.trim() || u.username;
      return {
        blockedUserId: r.blockedUserId,
        createdAt: r.createdAt.toISOString(),
        displayName,
        username: u.username,
        photoUrl: normalizeProfilePhotoUrl(u.profilePhotos[0]?.imageUrl),
      };
    });
  }

  async unblock(blockerUserId: string, blockedUserId: string): Promise<{ ok: true }> {
    await this.prisma.block.deleteMany({ where: { blockerUserId, blockedUserId } });
    return { ok: true };
  }

  /**
   * Creates/updates a deletion request and processes it immediately (anonymize + soft-delete).
   * Does not cancel Google Play / App Store billing.
   */
  async deleteRequest(userId: string, reason?: string): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        lifecycleStatus: true,
        accountDeletionRequest: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        code: 'ADMIN_DELETE_FORBIDDEN',
        message: 'Admin accounts cannot be deleted through this flow',
      });
    }
    if (user.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new ConflictException({
        code: 'ALREADY_DELETED',
        message: 'Account is already deleted',
      });
    }
    const existing = user.accountDeletionRequest;
    if (existing?.status === 'COMPLETED') {
      throw new ConflictException({
        code: 'ALREADY_DELETED',
        message: 'Account deletion already completed',
      });
    }
    if (existing?.status === 'PROCESSING') {
      return {
        success: true,
        status: 'PROCESSING',
        message: 'Account deletion is already in progress',
      };
    }

    await this.prisma.accountDeletionRequest.upsert({
      where: { userId },
      update: {
        reason: reason?.trim() || null,
        requestedAt: new Date(),
        status: 'PENDING',
        failureReason: null,
        processedAt: null,
      },
      create: { userId, reason: reason?.trim() || null, status: 'PENDING' },
    });

    try {
      return await this.processAccountDeletion(userId, user.email);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deletion failed';
      this.logger.error(`Account deletion failed for ${userId}: ${message}`);
      await this.prisma.accountDeletionRequest.update({
        where: { userId },
        data: { status: 'FAILED', failureReason: message.slice(0, 500) },
      });
      throw new BadRequestException({
        code: 'DELETION_FAILED',
        message: 'Account deletion could not be completed. Please contact support.',
      });
    }
  }

  /**
   * Public web flow: request a one-time email confirmation link.
   * Never reveals whether the email exists; never deletes by email alone.
   */
  async requestWebDeletion(email: string): Promise<{ ok: true; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isSuspended: true,
        lifecycleStatus: true,
      },
    });

    if (
      user &&
      user.isActive &&
      !user.isSuspended &&
      user.lifecycleStatus !== UserLifecycleStatus.DELETED &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      const confirmToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(confirmToken).digest('hex');
      await this.prisma.accountDeletionConfirmToken.deleteMany({ where: { userId: user.id } });
      await this.prisma.accountDeletionConfirmToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + WEB_DELETION_TOKEN_TTL_MS),
        },
      });

      const baseUrl = this.publicWebBaseUrl();
      const confirmUrl = `${baseUrl}/delete-account/confirm?token=${encodeURIComponent(confirmToken)}`;
      const sent = await this.mail.sendAccountDeletionConfirmLinkEmail(user.email, confirmUrl);
      if (!sent) {
        this.logger.warn(
          `Web deletion confirm email not delivered for userId=${user.id} (mail may be misconfigured)`,
        );
      }
    }

    return { ok: true, message: WEB_DELETION_GENERIC_MESSAGE };
  }

  /**
   * Public web flow: confirm deletion via emailed one-time token.
   * Reuses the same deleteRequest() path as the authenticated in-app flow.
   */
  async confirmWebDeletion(token: string, reason?: string): Promise<unknown> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new BadRequestException({
        code: 'INVALID_DELETION_TOKEN',
        message: 'Invalid or expired confirmation link',
      });
    }
    const tokenHash = createHash('sha256').update(trimmed).digest('hex');
    const row = await this.prisma.accountDeletionConfirmToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            lifecycleStatus: true,
          },
        },
      },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_DELETION_TOKEN',
        message: 'Invalid or expired confirmation link',
      });
    }

    await this.prisma.accountDeletionConfirmToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    const deletionReason =
      reason?.trim() && reason.trim().length > 0
        ? `web-deletion — ${reason.trim().slice(0, 500)}`
        : 'web-deletion';

    return this.deleteRequest(row.userId, deletionReason);
  }

  async getDeletionStatus(userId: string): Promise<unknown> {
    const row = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId },
    });
    if (!row) {
      return { status: null };
    }
    return {
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      failureReason: row.status === 'FAILED' ? row.failureReason : null,
    };
  }

  /**
   * Anonymizes personal data and soft-deletes the account.
   * Retains structural rows (matches, reports, subscription records) with anonymized identity.
   */
  private async processAccountDeletion(
    userId: string,
    originalEmail: string,
  ): Promise<{
    success: true;
    status: 'COMPLETED';
    processedAt: string;
    billingNote: string;
  }> {
    await this.prisma.accountDeletionRequest.update({
      where: { userId },
      data: { status: 'PROCESSING' },
    });

    const stamp = Date.now();
    const archivedEmail = `archived+${userId}+${stamp}@user-deleted.invalid`;
    const archivedUsername = `deleted_${userId}_${stamp}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.forgotPasswordToken.deleteMany({ where: { userId } });
      await tx.accountDeletionConfirmToken.deleteMany({ where: { userId } });
      await tx.profilePhoto.deleteMany({ where: { userId } });
      await tx.profilePost.deleteMany({ where: { userId } });

      await tx.foursomeFeedPost.updateMany({
        where: { posterUserId: userId, status: FoursomePostStatus.OPEN },
        data: {
          status: FoursomePostStatus.CANCELED,
          notes: null,
          feeLabel: null,
          handicapPreference: null,
        },
      });

      await tx.profile.updateMany({
        where: { userId },
        data: {
          displayName: 'Deleted User',
          bio: null,
          homeCourse: null,
          city: null,
          state: null,
          country: null,
          addressLine1: null,
          postalCode: null,
          locationLat: null,
          locationLng: null,
          lookingFor: null,
          skillLevel: null,
          playFrequency: null,
          drinkingPreference: null,
          smokingPreference: null,
          musicPreference: null,
          gender: null,
          age: null,
          handicap: null,
          isGHINVerified: false,
        },
      });

      await tx.gHINVerificationRequest.updateMany({
        where: { userId },
        data: {
          ghinNumber: 'REDACTED',
          submittedFirstName: null,
          submittedLastName: null,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          lifecycleStatus: UserLifecycleStatus.DELETED,
          deletedAt: new Date(),
          isActive: false,
          isSuspended: false,
          email: archivedEmail,
          username: archivedUsername,
          appleUserId: null,
          termsAcceptedAt: null,
          termsVersion: null,
          premiumOverride: false,
          premiumOverrideExpiresAt: null,
          premiumOverrideReason: null,
          refreshTokenVersion: { increment: 1 },
          passwordHash: `deleted:${stamp}`,
        },
      });

      await tx.accountDeletionRequest.update({
        where: { userId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          failureReason: null,
        },
      });
    });

    try {
      await this.mail.sendAccountDeletionConfirmationEmail(originalEmail);
    } catch (e) {
      this.logger.warn(
        `Deletion confirmation email failed for ${userId}: ${e instanceof Error ? e.message : e}`,
      );
    }

    const processedAt = new Date().toISOString();
    return {
      success: true,
      status: 'COMPLETED',
      processedAt,
      billingNote:
        'ConnectGHIN account data was deleted or anonymized. Active Google Play or App Store subscriptions must be managed in the store.',
    };
  }

  private publicWebBaseUrl(): string {
    const configured =
      this.config.get<string>('APP_PUBLIC_URL') ??
      this.config.get<string>('APP_WEB_URL') ??
      'https://connectghin.com';
    return configured.replace(/\/$/, '');
  }
}

/** Shared Feed report reason validation for foursome-feed module. */
export function normalizeFeedReportReason(reason: string): string {
  const code = reason.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    HARASSMENT_OR_BULLYING: 'HARASSMENT',
    HARASSMENT: 'HARASSMENT',
    HATE_OR_ABUSIVE_CONTENT: 'HATE',
    HATE: 'HATE',
    SEXUAL_INAPPROPRIATE_CONTENT: 'SEXUAL',
    SEXUAL: 'SEXUAL',
    SPAM_OR_SCAM: 'SPAM',
    SPAM: 'SPAM',
    DANGEROUS_OR_ILLEGAL_ACTIVITY: 'DANGEROUS',
    DANGEROUS: 'DANGEROUS',
    OTHER: 'OTHER',
  };
  const normalized = aliases[code] ?? code;
  if (!FEED_REPORT_REASONS.has(normalized)) {
    throw new BadRequestException({
      code: 'INVALID_REPORT_REASON',
      message: 'Invalid report reason',
      allowed: [...FEED_REPORT_REASONS],
    });
  }
  return normalized;
}

export function clampReportDetails(details?: string): string | undefined {
  if (!details?.trim()) return undefined;
  return details.trim().slice(0, MAX_REPORT_DETAILS);
}

export { FEED_REPORT_REASONS, MAX_REPORT_DETAILS, WEB_DELETION_GENERIC_MESSAGE };
export { ReportStatus, ReportTargetType } from '@prisma/client';
