import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlayerRatingStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayerRatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRating(
    reviewerUserId: string,
    dto: {
      revieweeUserId: string;
      roundDate: string;
      course: string;
      overallRating: number;
      handicapAccuracy: number;
      sportsmanship: number;
      paceOfPlay: number;
      wouldPlayAgain: boolean;
      comment: string;
    },
  ): Promise<unknown> {
    if (reviewerUserId === dto.revieweeUserId) {
      throw new BadRequestException('You cannot rate yourself');
    }
    this.assertRatingRange(dto.overallRating, 'overallRating');
    this.assertRatingRange(dto.handicapAccuracy, 'handicapAccuracy');
    this.assertRatingRange(dto.sportsmanship, 'sportsmanship');
    this.assertRatingRange(dto.paceOfPlay, 'paceOfPlay');

    const [reviewer, reviewee] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: reviewerUserId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: dto.revieweeUserId }, select: { id: true } }),
    ]);
    if (!reviewer || !reviewee) {
      throw new BadRequestException('Reviewer or reviewee not found');
    }

    const created = await this.prisma.playerRatingReview.create({
      data: {
        reviewerUserId,
        revieweeUserId: dto.revieweeUserId,
        roundDate: new Date(dto.roundDate),
        course: dto.course.trim(),
        overallRating: dto.overallRating,
        handicapAccuracy: dto.handicapAccuracy,
        sportsmanship: dto.sportsmanship,
        paceOfPlay: dto.paceOfPlay,
        wouldPlayAgain: dto.wouldPlayAgain,
        comment: dto.comment.trim(),
        status: PlayerRatingStatus.PENDING,
      },
      include: {
        reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
    });
    return mapRatingRow(created);
  }

  async listForUser(
    revieweeUserId: string,
    viewerUserId: string,
    query: { status?: 'all' | 'approved' | 'flagged' | 'pending' | 'removed'; page?: number; pageSize?: number },
  ): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const status = query.status ?? 'all';
    const viewingOwnProfile = viewerUserId === revieweeUserId;

    const where = viewingOwnProfile
      ? buildWhereRevieweeSelf(revieweeUserId, status)
      : buildWherePublicRevieweeProfile(revieweeUserId, viewerUserId, status);

    const summaryWhere = viewingOwnProfile
      ? { revieweeUserId, status: { not: PlayerRatingStatus.REMOVED } as const }
      : { revieweeUserId, status: PlayerRatingStatus.APPROVED };

    const [rows, total, aggregate] = await Promise.all([
      this.prisma.playerRatingReview.findMany({
        where,
        skip: page * pageSize,
        take: pageSize,
        orderBy: { submittedAt: 'desc' },
        include: {
          reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
          reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        },
      }),
      this.prisma.playerRatingReview.count({ where }),
      this.prisma.playerRatingReview.aggregate({
        where: summaryWhere,
        _avg: { overallRating: true },
        _count: { _all: true },
      }),
    ]);
    return {
      items: rows.map(mapRatingRow),
      total,
      page,
      pageSize,
      profileSummary: {
        averageRating: Number((aggregate._avg.overallRating ?? 0).toFixed(1)),
        totalRatings: aggregate._count._all,
      },
    };
  }

  async listMineGiven(
    reviewerUserId: string,
    query: { page?: number; pageSize?: number },
  ): Promise<unknown> {
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.playerRatingReview.findMany({
        where: { reviewerUserId },
        skip: page * pageSize,
        take: pageSize,
        orderBy: { submittedAt: 'desc' },
        include: {
          reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
          reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        },
      }),
      this.prisma.playerRatingReview.count({ where: { reviewerUserId } }),
    ]);
    return { items: rows.map(mapRatingRow), total, page, pageSize };
  }

  async detail(id: string, viewerUserId: string): Promise<unknown> {
    const row = await this.prisma.playerRatingReview.findUnique({
      where: { id },
      include: {
        reviewer: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        reviewee: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
    });
    if (!row) {
      throw new NotFoundException('Player rating not found');
    }
    const isParticipant = row.reviewerUserId === viewerUserId || row.revieweeUserId === viewerUserId;
    if (!isParticipant && row.status !== PlayerRatingStatus.APPROVED) {
      throw new NotFoundException('Player rating not found');
    }
    return mapRatingRow(row);
  }

  private assertRatingRange(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new BadRequestException(`${field} must be an integer between 1 and 5`);
    }
  }
}

/** Ratings about me (signed-in user === reviewee): same visibility as admin profile — all except removed. */
function buildWhereRevieweeSelf(
  revieweeUserId: string,
  status: 'all' | 'approved' | 'flagged' | 'pending' | 'removed',
): Prisma.PlayerRatingReviewWhereInput {
  const base: Prisma.PlayerRatingReviewWhereInput = { revieweeUserId };
  if (status === 'all') {
    return { ...base, status: { not: PlayerRatingStatus.REMOVED } };
  }
  return { ...base, status: mapStatusIn(status) };
}

/**
 * Someone else's profile: show approved public reviews, plus this viewer's own
 * pending/flagged (and removed when filtered) submissions about this golfer.
 */
function buildWherePublicRevieweeProfile(
  revieweeUserId: string,
  viewerUserId: string,
  status: 'all' | 'approved' | 'flagged' | 'pending' | 'removed',
): Prisma.PlayerRatingReviewWhereInput {
  const base: Prisma.PlayerRatingReviewWhereInput = { revieweeUserId };
  if (status === 'all') {
    return {
      ...base,
      OR: [
        { status: PlayerRatingStatus.APPROVED },
        {
          reviewerUserId: viewerUserId,
          status: { in: [PlayerRatingStatus.PENDING, PlayerRatingStatus.FLAGGED] },
        },
      ],
    };
  }
  if (status === 'approved') {
    return { ...base, status: PlayerRatingStatus.APPROVED };
  }
  if (status === 'pending') {
    return { ...base, reviewerUserId: viewerUserId, status: PlayerRatingStatus.PENDING };
  }
  if (status === 'flagged') {
    return { ...base, reviewerUserId: viewerUserId, status: PlayerRatingStatus.FLAGGED };
  }
  if (status === 'removed') {
    return { ...base, reviewerUserId: viewerUserId, status: PlayerRatingStatus.REMOVED };
  }
  return { ...base, status: PlayerRatingStatus.APPROVED };
}

function mapStatusIn(status: 'approved' | 'flagged' | 'pending' | 'removed'): PlayerRatingStatus {
  if (status === 'approved') return PlayerRatingStatus.APPROVED;
  if (status === 'flagged') return PlayerRatingStatus.FLAGGED;
  if (status === 'removed') return PlayerRatingStatus.REMOVED;
  return PlayerRatingStatus.PENDING;
}

function mapStatusOut(status: PlayerRatingStatus): 'approved' | 'flagged' | 'pending' | 'removed' {
  if (status === PlayerRatingStatus.APPROVED) return 'approved';
  if (status === PlayerRatingStatus.FLAGGED) return 'flagged';
  if (status === PlayerRatingStatus.REMOVED) return 'removed';
  return 'pending';
}

function mapRatingRow(row: {
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
    status: mapStatusOut(row.status),
    reportedReason: row.reportedReason ?? undefined,
    adminNotes: row.adminNotes ?? undefined,
  };
}
