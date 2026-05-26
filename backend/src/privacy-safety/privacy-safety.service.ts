import { Injectable } from '@nestjs/common';

import { normalizeProfilePhotoUrl } from '../common/utils/profile-photo-url';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrivacySafetyService {
  constructor(private readonly prisma: PrismaService) {}

  getPrivacy(userId: string): Promise<unknown> {
    return this.prisma.privacySettings.findUnique({ where: { userId } });
  }

  updatePrivacy(userId: string, data: Record<string, boolean>): Promise<unknown> {
    return this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  report(reportedByUserId: string, targetUserId: string, reason: string, details?: string): Promise<unknown> {
    return this.prisma.report.create({ data: { reportedByUserId, targetUserId, reason, details } });
  }

  block(blockerUserId: string, blockedUserId: string): Promise<unknown> {
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

  deleteRequest(userId: string, reason?: string): Promise<unknown> {
    return this.prisma.accountDeletionRequest.upsert({
      where: { userId },
      update: { reason, requestedAt: new Date(), status: 'PENDING' },
      create: { userId, reason },
    });
  }
}
