import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export function normalizePostImageUrl(stored: string | null | undefined): string | null {
  if (stored == null || stored.trim() === '') return null;
  const trimmed = stored.trim();
  const publicBase = process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const match = trimmed.match(/\/uploads\/profile-posts\/([^/?#]+)$/i);
  if (match?.[1] && publicBase) {
    return `${publicBase}/api/v1/uploads/profile-posts/${match[1]}`;
  }
  if (trimmed.startsWith('/api/v1/uploads/profile-posts/') && publicBase) {
    return `${publicBase}${trimmed}`;
  }
  return trimmed;
}

@Injectable()
export class ProfilePostsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    viewerId: string,
    userId: string,
    page = 0,
    pageSize = 20,
  ): Promise<unknown> {
    const take = Math.min(Math.max(pageSize, 1), 50);
    const skip = Math.max(page, 0) * take;

    const [items, total] = await Promise.all([
      this.prisma.profilePost.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.profilePost.count({ where: { userId } }),
    ]);

    return {
      items: items.map((row) => this.mapRow(row, viewerId)),
      total,
      page,
      pageSize: take,
      canPost: viewerId === userId,
    };
  }

  async create(
    userId: string,
    input: { body?: string; imageUrl?: string },
  ): Promise<unknown> {
    const body = input.body?.trim() || null;
    const imageUrl = input.imageUrl?.trim() ? normalizePostImageUrl(input.imageUrl.trim()) : null;
    if (!body && !imageUrl) {
      throw new BadRequestException('Add a caption or a photo to post');
    }
    if (body && body.length > 2000) {
      throw new BadRequestException('Caption must be 2000 characters or less');
    }

    const created = await this.prisma.profilePost.create({
      data: { userId, body, imageUrl },
    });
    return this.mapRow(created, userId);
  }

  async remove(userId: string, postId: string): Promise<{ ok: true }> {
    const post = await this.prisma.profilePost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }
    await this.prisma.profilePost.delete({ where: { id: postId } });
    return { ok: true };
  }

  private mapRow(
    row: {
      id: string;
      userId: string;
      body: string | null;
      imageUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    viewerId: string,
  ): unknown {
    return {
      id: row.id,
      userId: row.userId,
      body: row.body,
      imageUrl: row.imageUrl ? normalizePostImageUrl(row.imageUrl) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isOwn: row.userId === viewerId,
    };
  }
}
