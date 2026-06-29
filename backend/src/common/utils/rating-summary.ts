import { PlayerRatingStatus, PrismaClient } from '@prisma/client';

export type RatingSummary = {
  averageRating: number | null;
  reviewCount: number;
};

export async function getRatingSummariesForUsers(
  prisma: PrismaClient,
  userIds: string[],
): Promise<Map<string, RatingSummary>> {
  const map = new Map<string, RatingSummary>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) {
    return map;
  }

  const grouped = await prisma.playerRatingReview.groupBy({
    by: ['revieweeUserId'],
    where: {
      revieweeUserId: { in: unique },
      status: PlayerRatingStatus.APPROVED,
    },
    _avg: { overallRating: true },
    _count: { _all: true },
  });

  for (const row of grouped) {
    const count = row._count._all;
    map.set(row.revieweeUserId, {
      averageRating: count > 0 ? Number((row._avg.overallRating ?? 0).toFixed(1)) : null,
      reviewCount: count,
    });
  }

  for (const id of unique) {
    if (!map.has(id)) {
      map.set(id, { averageRating: null, reviewCount: 0 });
    }
  }

  return map;
}

export async function getRatingSummaryForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<RatingSummary> {
  const map = await getRatingSummariesForUsers(prisma, [userId]);
  return map.get(userId) ?? { averageRating: null, reviewCount: 0 };
}
