import { Injectable } from '@nestjs/common';
import { Prisma, UserLifecycleStatus } from '@prisma/client';

import { DiscoveryQueryDto } from '../common/dto/pagination.dto';
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
            membershipType: true,
            profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
      take: pageSize,
      skip,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => {
      const lat = toNumber(row.locationLat);
      const lng = toNumber(row.locationLng);
      const distanceMiles =
        viewerLat != null && viewerLng != null && lat != null && lng != null
          ? Number(haversineMiles(viewerLat, viewerLng, lat, lng).toFixed(1))
          : null;
      return { ...row, distanceMiles };
    });
  }
}
