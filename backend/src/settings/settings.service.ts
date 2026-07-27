import { Injectable } from '@nestjs/common';
import { MembershipType } from '@prisma/client';

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

@Injectable()
export class SettingsService {
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
    const [user, settings, privacy] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          username: true,
          membershipType: true,
          membershipStatus: true,
          profile: { select: { displayName: true, isGHINVerified: true } },
          profilePhotos: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            select: { imageUrl: true },
          },
        },
      }),
      this.prisma.userSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      this.prisma.privacySettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
    ]);

    const displayName =
      user?.profile?.displayName?.trim() || user?.username || 'Golfer';
    const isPremium = user?.membershipType === MembershipType.PREMIUM;

    return {
      profile: {
        displayName,
        email: user?.email ?? '',
        username: user?.username ?? '',
        photoUrl: normalizeProfilePhotoUrl(user?.profilePhotos?.[0]?.imageUrl),
        isPremium,
        membershipType: user?.membershipType ?? 'FREE',
        membershipStatus: user?.membershipStatus ?? 'NONE',
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
