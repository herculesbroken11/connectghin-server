import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type PeerChatInfo = {
  conversationId: string;
  preview: string | null;
  lastAt: Date;
  unread: number;
};

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active matches + per-peer chat preview and unread counts for the Matches inbox UI. */
  async list(userId: string): Promise<unknown> {
    const matches = await this.prisma.match.findMany({
      where: {
        isActive: true,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      orderBy: { matchedAt: 'desc' },
      include: {
        userOne: {
          select: {
            id: true,
            username: true,
            profile: true,
            profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
        userTwo: {
          select: {
            id: true,
            username: true,
            profile: true,
            profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });

    const peerIndex = await this.buildPeerChatIndex(userId);

    return matches.map((m) => {
      const peerId = m.userOneId === userId ? m.userTwoId : m.userOneId;
      const chat = peerIndex.get(peerId);
      return {
        ...m,
        chatPreview: {
          conversationId: chat?.conversationId ?? null,
          lastMessagePreview: chat?.preview ?? null,
          lastMessageAt: chat?.lastAt.toISOString() ?? null,
          unreadCount: chat?.unread ?? 0,
        },
      };
    });
  }

  private async buildPeerChatIndex(viewerId: string): Promise<Map<string, PeerChatInfo>> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { userId: viewerId },
      include: {
        conversation: {
          include: {
            participants: { select: { userId: true } },
            messages: { take: 1, orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    const map = new Map<string, PeerChatInfo>();
    const convIds: string[] = [];

    for (const row of rows) {
      const c = row.conversation;
      const ids = c.participants.map((p) => p.userId);
      if (ids.length !== 2) continue;
      const peer = ids.find((id) => id !== viewerId);
      if (!peer) continue;

      const last = c.messages[0];
      const preview = last?.body ?? null;
      const lastAt = last?.createdAt ?? c.updatedAt;
      map.set(peer, {
        conversationId: c.id,
        preview,
        lastAt,
        unread: 0,
      });
      convIds.push(c.id);
    }

    if (convIds.length === 0) {
      return map;
    }

    const unreadAgg = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: convIds },
        senderId: { not: viewerId },
        isRead: false,
      },
      _count: { _all: true },
    });
    const unreadByConv = new Map(
      unreadAgg.map((u) => [u.conversationId, u._count._all]),
    );

    for (const info of map.values()) {
      info.unread = unreadByConv.get(info.conversationId) ?? 0;
    }

    return map;
  }

  detail(userId: string, id: string): Promise<unknown> {
    return this.prisma.match.findFirst({
      where: { id, isActive: true, OR: [{ userOneId: userId }, { userTwoId: userId }] },
    });
  }

  async unmatch(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.match.updateMany({
      where: { id, OR: [{ userOneId: userId }, { userTwoId: userId }] },
      data: { isActive: false, unmatchedAt: new Date() },
    });
    return { ok: true };
  }
}
