import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FoursomeGameStyle,
  FoursomePostStatus,
  MembershipType,
  UserLifecycleStatus,
} from '@prisma/client';

import { ConversationsService } from '../conversations/conversations.service';
import { getRatingSummariesForUsers } from '../common/utils/rating-summary';
import { normalizeUserProfilePhotos } from '../common/utils/profile-photo-url';
import { PrismaService } from '../prisma/prisma.service';

const FREE_PREVIEW_LIMIT = 5;
const FORBIDDEN_WORDS = /\b(betting|wagering|gambling|money game|big money game)\b/i;

export type FoursomeFeedListQuery = {
  page?: number;
  pageSize?: number;
  gameStyle?: FoursomeGameStyle | 'ALL';
};

export type CreateFoursomeFeedPostDto = {
  courseName: string;
  city?: string;
  state?: string;
  roundDate: string;
  teeTime: string;
  spotsNeeded: number;
  gameStyle: FoursomeGameStyle;
  handicapPreference?: string;
  feeLabel?: string;
  notes?: string;
};

@Injectable()
export class FoursomeFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  private async assertPremium(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { membershipType: true },
    });
    if (user?.membershipType !== MembershipType.PREMIUM) {
      throw new ForbiddenException('Premium membership required');
    }
  }

  private assertSafeText(value: string | undefined, field: string): void {
    if (value == null || value.trim() === '') return;
    if (FORBIDDEN_WORDS.test(value)) {
      throw new BadRequestException(`${field} contains wording that is not allowed`);
    }
  }

  async listFeed(viewerId: string, query: FoursomeFeedListQuery): Promise<unknown> {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { membershipType: true },
    });
    const isPremium = viewer?.membershipType === MembershipType.PREMIUM;

    const blocked = await this.prisma.block.findMany({
      where: { OR: [{ blockerUserId: viewerId }, { blockedUserId: viewerId }] },
      select: { blockerUserId: true, blockedUserId: true },
    });
    const excludedIds = new Set<string>([viewerId]);
    blocked.forEach((b) => {
      excludedIds.add(b.blockerUserId);
      excludedIds.add(b.blockedUserId);
    });

    const page = query.page ?? 0;
    const requestedSize = Math.min(query.pageSize ?? 20, 50);
    const take = isPremium ? requestedSize : Math.min(requestedSize, FREE_PREVIEW_LIMIT);

    const where = {
      status: FoursomePostStatus.OPEN,
      posterUserId: { notIn: Array.from(excludedIds) },
      roundDate: { gte: new Date() },
      ...(query.gameStyle && query.gameStyle !== 'ALL'
        ? { gameStyle: query.gameStyle as FoursomeGameStyle }
        : {}),
      poster: {
        isSuspended: false,
        isActive: true,
        lifecycleStatus: UserLifecycleStatus.ACTIVE,
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.foursomeFeedPost.findMany({
        where,
        skip: page * take,
        take,
        orderBy: [{ roundDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          poster: {
            select: {
              id: true,
              username: true,
              membershipType: true,
              profile: true,
              profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          },
        },
      }),
      this.prisma.foursomeFeedPost.count({ where }),
    ]);

    const posterIds = rows.map((r) => r.posterUserId);
    const ratingMap = await getRatingSummariesForUsers(this.prisma, posterIds);

    return {
      items: rows.map((row) => this.mapPostRow(row, ratingMap.get(row.posterUserId))),
      total,
      page,
      pageSize: take,
      isPremiumViewer: isPremium,
      isPreviewOnly: !isPremium,
      previewLimit: FREE_PREVIEW_LIMIT,
    };
  }

  async getPost(viewerId: string, postId: string): Promise<unknown> {
    const row = await this.prisma.foursomeFeedPost.findUnique({
      where: { id: postId },
      include: {
        poster: {
          select: {
            id: true,
            username: true,
            membershipType: true,
            profile: true,
            profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Foursome feed post not found');
    }
    const ratingMap = await getRatingSummariesForUsers(this.prisma, [row.posterUserId]);
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { membershipType: true },
    });
    const mapped = this.mapPostRow(row, ratingMap.get(row.posterUserId)) as Record<string, unknown>;
    return {
      ...mapped,
      isPremiumViewer: viewer?.membershipType === MembershipType.PREMIUM,
    };
  }

  async createPost(userId: string, dto: CreateFoursomeFeedPostDto): Promise<unknown> {
    await this.assertPremium(userId);
    this.validateCreateDto(dto);

    const created = await this.prisma.foursomeFeedPost.create({
      data: {
        posterUserId: userId,
        courseName: dto.courseName.trim(),
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        roundDate: new Date(dto.roundDate),
        teeTime: dto.teeTime.trim(),
        spotsNeeded: dto.spotsNeeded,
        gameStyle: dto.gameStyle,
        handicapPreference: dto.handicapPreference?.trim() || null,
        feeLabel: dto.feeLabel?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        poster: {
          select: {
            id: true,
            username: true,
            membershipType: true,
            profile: true,
            profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });

    const ratingMap = await getRatingSummariesForUsers(this.prisma, [userId]);
    return this.mapPostRow(created, ratingMap.get(userId));
  }

  async contactPoster(viewerId: string, postId: string): Promise<unknown> {
    await this.assertPremium(viewerId);
    const post = await this.prisma.foursomeFeedPost.findUnique({
      where: { id: postId },
      select: { posterUserId: true, status: true },
    });
    if (!post) {
      throw new NotFoundException('Foursome feed post not found');
    }
    if (post.status !== FoursomePostStatus.OPEN) {
      throw new BadRequestException('This post is no longer open');
    }
    if (post.posterUserId === viewerId) {
      throw new BadRequestException('Cannot contact yourself');
    }
    const conversation = await this.conversationsService.startConversation(
      viewerId,
      post.posterUserId,
    );
    return { ok: true, conversation };
  }

  private validateCreateDto(dto: CreateFoursomeFeedPostDto): void {
    if (!dto.courseName?.trim()) {
      throw new BadRequestException('courseName is required');
    }
    if (!dto.roundDate) {
      throw new BadRequestException('roundDate is required');
    }
    if (!dto.teeTime?.trim()) {
      throw new BadRequestException('teeTime is required');
    }
    if (!Number.isInteger(dto.spotsNeeded) || dto.spotsNeeded < 1 || dto.spotsNeeded > 3) {
      throw new BadRequestException('spotsNeeded must be between 1 and 3');
    }
    if (!Object.values(FoursomeGameStyle).includes(dto.gameStyle)) {
      throw new BadRequestException('Invalid gameStyle');
    }
    const roundDate = new Date(dto.roundDate);
    if (Number.isNaN(roundDate.getTime())) {
      throw new BadRequestException('Invalid roundDate');
    }
    if (roundDate < new Date(new Date().setHours(0, 0, 0, 0))) {
      throw new BadRequestException('roundDate must be today or in the future');
    }
    this.assertSafeText(dto.courseName, 'courseName');
    this.assertSafeText(dto.handicapPreference, 'handicapPreference');
    this.assertSafeText(dto.feeLabel, 'feeLabel');
    this.assertSafeText(dto.notes, 'notes');
  }

  private mapPostRow(
    row: {
      id: string;
      posterUserId: string;
      courseName: string;
      city: string | null;
      state: string | null;
      roundDate: Date;
      teeTime: string;
      spotsNeeded: number;
      gameStyle: FoursomeGameStyle;
      handicapPreference: string | null;
      feeLabel: string | null;
      notes: string | null;
      status: FoursomePostStatus;
      createdAt: Date;
      updatedAt: Date;
      poster: {
        id: string;
        username: string;
        membershipType: MembershipType;
        profile: {
          displayName: string;
          handicap: unknown;
          isGHINVerified: boolean;
          city: string | null;
          state: string | null;
        } | null;
        profilePhotos: { imageUrl: string }[];
      };
    },
    rating?: { averageRating: number | null; reviewCount: number },
  ): unknown {
    const poster = normalizeUserProfilePhotos(row.poster) ?? row.poster;
    const profile = poster.profile;
    return {
      id: row.id,
      userId: row.posterUserId,
      posterId: row.posterUserId,
      courseName: row.courseName,
      city: row.city,
      state: row.state,
      location: [row.city, row.state].filter(Boolean).join(', ') || null,
      roundDate: row.roundDate.toISOString(),
      date: row.roundDate.toISOString(),
      teeTime: row.teeTime,
      spotsNeeded: row.spotsNeeded,
      gameStyle: row.gameStyle,
      handicapPreference: row.handicapPreference,
      feeLabel: row.feeLabel,
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      poster: {
        id: poster.id,
        username: poster.username,
        membershipType: poster.membershipType,
        isPremium: poster.membershipType === MembershipType.PREMIUM,
        displayName: profile?.displayName ?? poster.username,
        handicap: profile?.handicap ?? null,
        isGHINVerified: profile?.isGHINVerified ?? false,
        profilePhotos: poster.profilePhotos,
        ratingSummary: {
          averageRating: rating?.averageRating ?? null,
          reviewCount: rating?.reviewCount ?? 0,
        },
      },
    };
  }
}
