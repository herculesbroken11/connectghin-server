import { Injectable, NotFoundException } from '@nestjs/common';
import { Profile } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './profiles.dto';

const ownProfileInclude = {
  user: {
    select: {
      email: true,
      username: true,
      membershipType: true,
      membershipStatus: true,
      profilePhotos: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
} as const;

/** Aligns with mobile onboarding: basic → golf → preferences → photos. Capped at 100. */
export function computeProfileCompletionPercent(profile: Profile, photoCount: number): number {
  let s = 5;
  if (profile.displayName?.trim()) s += 5;
  if (profile.age != null && profile.age >= 18) s += 10;
  if (profile.city?.trim() || profile.state?.trim()) s += 8;
  if (profile.gender?.trim()) s += 4;
  if (profile.bio?.trim()) s += 6;
  if (profile.handicap != null) s += 6;
  if (profile.homeCourse?.trim()) s += 6;
  if (profile.skillLevel?.trim()) s += 6;
  if (profile.playFrequency?.trim()) s += 6;
  if (profile.lookingFor?.trim()) s += 10;
  if (profile.drinkingPreference?.trim()) s += 4;
  if (profile.smokingPreference?.trim()) s += 4;
  if (profile.musicPreference?.trim()) s += 4;
  if (photoCount >= 1) s += 8;
  if (photoCount >= 2) s += 8;
  return Math.min(100, s);
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicProfile(userId: string): Promise<unknown> {
    const row = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            membershipType: true,
            membershipStatus: true,
            createdAt: true,
            profilePhotos: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Profile not found');
    }
    return row;
  }

  async getOwnProfile(userId: string): Promise<unknown> {
    const existing = await this.prisma.profile.findUnique({ where: { userId }, include: ownProfileInclude });
    if (existing) {
      return existing;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) {
      return null;
    }
    await this.prisma.profile.create({
      data: {
        userId,
        displayName: user.username,
        profileCompletionPercent: 10,
      },
    });
    return this.prisma.profile.findUniqueOrThrow({ where: { userId }, include: ownProfileInclude });
  }

  async updateOwnProfile(userId: string, dto: UpdateProfileDto): Promise<unknown> {
    const partial = stripUndefined(dto as unknown as Record<string, unknown>) as Partial<UpdateProfileDto>;
    const displayName = partial.displayName ?? 'Golfer';
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, displayName, ...partial },
      update: { ...partial },
    });
    await this.recomputeAndPersistCompletion(userId);
    return this.prisma.profile.findUniqueOrThrow({
      where: { userId },
      include: ownProfileInclude,
    });
  }

  /** Call after any change that affects onboarding completion (profile fields or photos). */
  async recomputeAndPersistCompletion(userId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return;
    const photoCount = await this.prisma.profilePhoto.count({ where: { userId } });
    const pct = computeProfileCompletionPercent(profile, photoCount);
    if (pct !== profile.profileCompletionPercent) {
      await this.prisma.profile.update({
        where: { userId },
        data: { profileCompletionPercent: pct },
      });
    }
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
