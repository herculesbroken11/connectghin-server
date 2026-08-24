import { Injectable, Logger } from '@nestjs/common';
import { PrivacySettings, UserSettings } from '@prisma/client';

import { isEffectivePremium, PREMIUM_USER_SELECT } from '../common/premium/effective-premium';
import { normalizeProfilePhotoUrl } from '../common/utils/profile-photo-url';
import { PrismaService } from '../prisma/prisma.service';

const USER_SETTINGS_BOOL_KEYS = [
  'pushEnabled',
  'emailEnabled',
  'marketingEnabled',
  'notifyNewMatches',
  'notifyMessages',
  'notifyFoursomeFeed',
] as const;

type UserSettingsBoolKey = (typeof USER_SETTINGS_BOOL_KEYS)[number];

const DEFAULT_NOTIFICATIONS = {
  pushEnabled: true,
  emailEnabled: true,
  marketingEnabled: false,
  notifyNewMatches: true,
  notifyMessages: true,
  notifyFoursomeFeed: false,
} as const;

const DEFAULT_PRIVACY = {
  showInDiscovery: true,
  showDistance: true,
  showOnlineStatus: true,
  showLastActive: false,
  allowMessagesFromMatches: true,
  showReadReceipts: true,
  showLocation: true,
  publicProfile: true,
} as const;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<unknown> {
    return this.prisma.userSettings.findUnique({ where: { userId } });
  }

  update(userId: string, data: Record<string, boolean>): Promise<unknown> {
    const patch = pickBools(data, USER_SETTINGS_BOOL_KEYS);
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    });
  }

  /** Aggregate payload for the mobile Settings screen (all dynamic). */
  async overview(userId: string): Promise<{
    profile: {
      displayName: string;
      email: string;
      username: string;
      photoUrl: string | null;
      isPremium: boolean;
      membershipType: string;
      membershipStatus: string;
      premiumOverride: boolean;
      isGhinVerified: boolean;
    };
    notifications: {
      pushEnabled: boolean;
      emailEnabled: boolean;
      marketingEnabled: boolean;
      notifyNewMatches: boolean;
      notifyMessages: boolean;
      notifyFoursomeFeed: boolean;
    };
    privacy: {
      showInDiscovery: boolean;
      showDistance: boolean;
      showOnlineStatus: boolean;
      showLastActive: boolean;
      allowMessagesFromMatches: boolean;
      showReadReceipts: boolean;
      showLocation: boolean;
      publicProfile: boolean;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        username: true,
        ...PREMIUM_USER_SELECT,
        profile: { select: { displayName: true, isGHINVerified: true } },
        profilePhotos: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { imageUrl: true },
        },
      },
    });

    const settings = await this.loadUserSettings(userId);
    const privacy = await this.loadPrivacySettings(userId);

    const displayName =
      user?.profile?.displayName?.trim() || user?.username || 'Golfer';
    const isPremium = isEffectivePremium(user ?? {});

    return {
      profile: {
        displayName,
        email: user?.email ?? '',
        username: user?.username ?? '',
        photoUrl: normalizeProfilePhotoUrl(user?.profilePhotos?.[0]?.imageUrl),
        isPremium,
        membershipType: user?.membershipType ?? 'FREE',
        membershipStatus: user?.membershipStatus ?? 'NONE',
        premiumOverride: user?.premiumOverride === true,
        isGhinVerified: user?.profile?.isGHINVerified === true,
      },
      notifications: {
        pushEnabled: settings.pushEnabled,
        emailEnabled: settings.emailEnabled,
        marketingEnabled: settings.marketingEnabled,
        notifyNewMatches: settings.notifyNewMatches,
        notifyMessages: settings.notifyMessages,
        notifyFoursomeFeed: settings.notifyFoursomeFeed,
      },
      privacy: {
        showInDiscovery: privacy.showInDiscovery,
        showDistance: privacy.showDistance,
        showOnlineStatus: privacy.showOnlineStatus,
        showLastActive: privacy.showLastActive,
        allowMessagesFromMatches: privacy.allowMessagesFromMatches,
        showReadReceipts: privacy.showReadReceipts,
        showLocation: privacy.showLocation,
        publicProfile: privacy.publicProfile,
      },
    };
  }

  /**
   * Upsert notification prefs. If the DB is missing newer columns (migration not
   * deployed yet), fall back to defaults so Settings still loads.
   */
  private async loadUserSettings(userId: string): Promise<{
    pushEnabled: boolean;
    emailEnabled: boolean;
    marketingEnabled: boolean;
    notifyNewMatches: boolean;
    notifyMessages: boolean;
    notifyFoursomeFeed: boolean;
  }> {
    try {
      const row: UserSettings = await this.prisma.userSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      return {
        pushEnabled: row.pushEnabled,
        emailEnabled: row.emailEnabled,
        marketingEnabled: row.marketingEnabled,
        notifyNewMatches: row.notifyNewMatches,
        notifyMessages: row.notifyMessages,
        notifyFoursomeFeed: row.notifyFoursomeFeed,
      };
    } catch (err) {
      this.logger.error(
        `userSettings upsert failed for ${userId} — run: npx prisma migrate deploy. ${err instanceof Error ? err.message : err}`,
      );
      return { ...DEFAULT_NOTIFICATIONS };
    }
  }

  private async loadPrivacySettings(userId: string): Promise<{
    showInDiscovery: boolean;
    showDistance: boolean;
    showOnlineStatus: boolean;
    showLastActive: boolean;
    allowMessagesFromMatches: boolean;
    showReadReceipts: boolean;
    showLocation: boolean;
    publicProfile: boolean;
  }> {
    try {
      const row: PrivacySettings = await this.prisma.privacySettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      return {
        showInDiscovery: row.showInDiscovery,
        showDistance: row.showDistance,
        showOnlineStatus: row.showOnlineStatus,
        showLastActive: row.showLastActive,
        allowMessagesFromMatches: row.allowMessagesFromMatches,
        showReadReceipts: row.showReadReceipts,
        showLocation: row.showLocation,
        publicProfile: row.publicProfile,
      };
    } catch (err) {
      this.logger.error(
        `privacySettings upsert failed for ${userId} — run: npx prisma migrate deploy. ${err instanceof Error ? err.message : err}`,
      );
      return { ...DEFAULT_PRIVACY };
    }
  }

  /**
   * Non-secret legal/contact values for mobile Privacy/Terms screens.
   * Prefer in-app routes when URLs are empty.
   */
  async getPublicLegal(): Promise<{
    privacyEmail: string;
    supportEmail: string;
    companyDisplayName: string;
    businessMailingAddress: string;
    termsUrl: string;
    privacyUrl: string;
  }> {
    const keys = [
      'privacy_contact_email',
      'support_email',
      'support_contact_email',
      'company_display_name',
      'business_mailing_address',
      'terms_url',
      'privacy_url',
    ] as const;
    const rows = await this.prisma.appSettings.findMany({
      where: { key: { in: [...keys] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.valueJson]));

    const asString = (v: unknown, fallback: string): string => {
      if (typeof v === 'string') return v.trim();
      if (v == null) return fallback;
      return String(v).trim() || fallback;
    };

    const supportFallback = asString(map.support_contact_email ?? map.support_email, 'support@connectghin.com');

    return {
      privacyEmail: asString(map.privacy_contact_email, supportFallback),
      supportEmail: asString(map.support_email ?? map.support_contact_email, supportFallback),
      companyDisplayName: asString(map.company_display_name, 'Connectghin'),
      businessMailingAddress: asString(map.business_mailing_address, ''),
      termsUrl: asString(map.terms_url, ''),
      privacyUrl: asString(map.privacy_url, ''),
    };
  }
}

function pickBools(
  data: Record<string, boolean>,
  keys: readonly UserSettingsBoolKey[],
): Partial<Record<UserSettingsBoolKey, boolean>> {
  const out: Partial<Record<UserSettingsBoolKey, boolean>> = {};
  for (const key of keys) {
    if (typeof data[key] === 'boolean') {
      out[key] = data[key];
    }
  }
  return out;
}
