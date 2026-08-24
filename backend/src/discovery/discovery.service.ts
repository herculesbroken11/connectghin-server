import { Injectable } from '@nestjs/common';
import { Prisma, UserLifecycleStatus } from '@prisma/client';

import { DiscoveryQueryDto } from '../common/dto/pagination.dto';
import { isEffectivePremium, PREMIUM_USER_SELECT } from '../common/premium/effective-premium';
import { getRatingSummariesForUsers } from '../common/utils/rating-summary';
import { normalizeProfileRow } from '../common/utils/profile-photo-url';
import { PrismaService } from '../prisma/prisma.service';

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    const fn = (v as { toNumber?: () => number }).toNumber;
    if (typeof fn === 'function') {
      const n = fn.call(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const earthRadiusMiles = 3958.8;
  return earthRadiusMiles * c;
}

/** Keep unknown/empty values; match loosely when both sides are set. */
function softPrefMatch(stored: string | null | undefined, want: string | undefined): boolean {
  if (!want || want.trim() === '' || want.toLowerCase() === 'any') return true;
  if (stored == null || stored.trim() === '') return true;
  const a = stored.toLowerCase();
  const b = want.toLowerCase();
  return a.includes(b) || b.includes(a);
}

function smokingMatches(stored: string | null | undefined, want: string | undefined): boolean {
  if (!want || want.toLowerCase() === 'any') return true;
  if (stored == null || stored.trim() === '') return true;
  const a = stored.toLowerCase();
  if (want === 'No smoking') {
    return a.includes('no') || a.includes('never');
  }
  if (want === 'OK') {
    return !a.includes('no') && !a.includes('never');
  }
  return softPrefMatch(stored, want);
}

function friendly420Matches(
  smoking: string | null | undefined,
  bio: string | null | undefined,
  lookingFor: string | null | undefined,
  want: string | undefined,
): boolean {
  if (!want || want.toLowerCase() === 'any') return true;
  const blob = `${smoking ?? ''} ${bio ?? ''} ${lookingFor ?? ''}`.toLowerCase();
  const mentions = blob.includes('420') || blob.includes('cannabis') || blob.includes('weed');
  if (want.toLowerCase() === 'yes') {
    // Keep unknowns; only require a mention when the profile has related text.
    if (`${smoking ?? ''}${bio ?? ''}${lookingFor ?? ''}`.trim() === '') return true;
    return mentions;
  }
  if (want.toLowerCase() === 'no') return !mentions;
  return true;
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async candidates(viewerId: string, query: DiscoveryQueryDto): Promise<unknown> {
    const viewerProfile = await this.prisma.profile.findUnique({
      where: { userId: viewerId },
      select: { locationLat: true, locationLng: true },
    });
    const viewerLat = toNumber(viewerProfile?.locationLat);
    const viewerLng = toNumber(viewerProfile?.locationLng);

    const blocked = await this.prisma.block.findMany({
      where: { OR: [{ blockerUserId: viewerId }, { blockedUserId: viewerId }] },
      select: { blockerUserId: true, blockedUserId: true },
    });
    const excludedIds = new Set<string>();
    blocked.forEach((entry) => {
      excludedIds.add(entry.blockerUserId);
      excludedIds.add(entry.blockedUserId);
    });
    excludedIds.add(viewerId);
    if (query.excludeSwiped !== false) {
      const swiped = await this.prisma.swipe.findMany({
        where: { fromUserId: viewerId },
        select: { toUserId: true },
      });
      swiped.forEach((entry) => excludedIds.add(entry.toUserId));
    }

    const handicapFilter: Prisma.ProfileWhereInput = {};
    if (query.handicapMin !== undefined || query.handicapMax !== undefined) {
      handicapFilter.handicap = {};
      if (query.handicapMin !== undefined) {
        handicapFilter.handicap.gte = query.handicapMin;
      }
      if (query.handicapMax !== undefined) {
        handicapFilter.handicap.lte = query.handicapMax;
      }
    }

    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const skip = (query.page ?? 0) * pageSize;
    const maxDistance =
      query.maxDistanceMiles != null && Number.isFinite(query.maxDistanceMiles) && query.maxDistanceMiles < 100
        ? query.maxDistanceMiles
        : null;

    const hasSoftPrefs = Boolean(
      (query.skillLevel && query.skillLevel.toLowerCase() !== 'any') ||
        (query.playFrequency && query.playFrequency.toLowerCase() !== 'any') ||
        (query.musicPreference && query.musicPreference.toLowerCase() !== 'any') ||
        (query.drinkingPreference && query.drinkingPreference.toLowerCase() !== 'any') ||
        (query.smokingPreference && query.smokingPreference.toLowerCase() !== 'any') ||
        (query.friendly420 && query.friendly420.toLowerCase() !== 'any'),
    );

    // Over-fetch when post-filters (distance / prefs) are applied.
    const needsPostFilter = maxDistance != null || hasSoftPrefs;
    const fetchTake = needsPostFilter ? Math.min(Math.max(pageSize * 5, 100), 250) : pageSize;
    const fetchSkip = needsPostFilter ? 0 : skip;

    const rows = await this.prisma.profile.findMany({
      where: {
        userId: { notIn: Array.from(excludedIds) },
        ...(query.verifiedOnly ? { isGHINVerified: true } : {}),
        ...handicapFilter,
        user: {
          isSuspended: false,
          isActive: true,
          lifecycleStatus: UserLifecycleStatus.ACTIVE,
          privacySettings: { is: { showInDiscovery: true } },
        },
      },
      include: {
        user: {
          select: {
            ...PREMIUM_USER_SELECT,
            profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
      take: fetchTake,
      skip: fetchSkip,
      orderBy: { updatedAt: 'desc' },
    });

    const mapped = rows
      .map((row) => {
        const lat = toNumber(row.locationLat);
        const lng = toNumber(row.locationLng);
        const distanceMiles =
          viewerLat != null && viewerLng != null && lat != null && lng != null
            ? Number(haversineMiles(viewerLat, viewerLng, lat, lng).toFixed(1))
            : null;
        return { row, distanceMiles };
      })
      .filter(({ row, distanceMiles }) => {
        if (maxDistance != null) {
          if (distanceMiles == null || distanceMiles > maxDistance) return false;
        }
        if (!softPrefMatch(row.skillLevel, query.skillLevel)) return false;
        if (!softPrefMatch(row.playFrequency, query.playFrequency)) return false;
        if (!softPrefMatch(row.musicPreference, query.musicPreference)) return false;
        if (!softPrefMatch(row.drinkingPreference, query.drinkingPreference)) return false;
        if (!smokingMatches(row.smokingPreference, query.smokingPreference)) return false;
        if (
          !friendly420Matches(row.smokingPreference, row.bio, row.lookingFor, query.friendly420)
        ) {
          return false;
        }
        return true;
      });

    const pageRows = needsPostFilter ? mapped.slice(skip, skip + pageSize) : mapped;

    const userIds = pageRows.map((entry) => entry.row.userId);
    const ratingMap = await getRatingSummariesForUsers(this.prisma, userIds);

    return pageRows.map(({ row, distanceMiles }) => {
      const normalized = normalizeProfileRow(row);
      const rating = ratingMap.get(row.userId);
      return {
        ...normalized,
        distanceMiles,
        isPremium: isEffectivePremium(row.user ?? {}),
        ratingSummary: {
          averageRating: rating?.averageRating ?? null,
          reviewCount: rating?.reviewCount ?? 0,
        },
      };
    });
  }
}
