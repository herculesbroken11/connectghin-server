import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipType, NotificationType } from '@prisma/client';

import { ChatGateway } from '../chat/chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(userId: string): Promise<unknown> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            messages: { take: 1, orderBy: { createdAt: 'desc' } },
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: true,
                    profilePhotos: { orderBy: { sortOrder: 'asc' }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const convIds = rows.map((r) => r.conversation.id);
    if (convIds.length === 0) {
      return rows;
    }

    const unreadAgg = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: convIds },
        senderId: { not: userId },
        isRead: false,
      },
      _count: { _all: true },
    });
    const unreadMap = new Map(
      unreadAgg.map((u) => [u.conversationId, u._count._all]),
    );

    return rows.map((r) => ({
      ...r,
      unreadCount: unreadMap.get(r.conversation.id) ?? 0,
    }));
  }

  messages(userId: string, conversationId: string): Promise<unknown> {
    return this.prisma.message.findMany({
      where: {
        conversationId,
        conversation: { participants: { some: { userId } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async startConversation(currentUserId: string, otherUserId: string): Promise<unknown> {
    if (currentUserId === otherUserId) {
      throw new ForbiddenException('Cannot start conversation with self');
    }
    const existingBlock = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerUserId: currentUserId, blockedUserId: otherUserId },
          { blockerUserId: otherUserId, blockedUserId: currentUserId },
        ],
      },
      select: { id: true },
    });
    if (existingBlock) {
      throw new ForbiddenException('Conversation blocked by privacy/safety rules');
    }

    const [u1, u2] = [currentUserId, otherUserId].sort();
    const existingMatch = await this.prisma.match.findUnique({
      where: { userOneId_userTwoId: { userOneId: u1, userTwoId: u2 } },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { membershipType: true },
    });
    const premiumMessagingEnabled = await this.prisma.appSettings.findUnique({
      where: { key: 'premium_direct_message_enabled' },
    });
    const premiumDmAllowed = premiumMessagingEnabled?.valueJson === true;
    const canDirectMessage =
      user?.membershipType === MembershipType.PREMIUM &&
      premiumDmAllowed &&
      (!existingMatch || !existingMatch.isActive);

    if ((!existingMatch || !existingMatch.isActive) && !canDirectMessage) {
      throw new ForbiddenException('Match required to start conversation');
    }

    const existingConversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId: currentUserId },
        },
      },
      include: { participants: true },
    });
    const existingConversation = existingConversations.find((conversation) => {
      const ids = conversation.participants.map((p) => p.userId);
      return ids.length === 2 && ids.includes(currentUserId) && ids.includes(otherUserId);
    });
    if (existingConversation) return existingConversation;

    return this.prisma.conversation.create({
      data: {
        participants: {
          createMany: { data: [{ userId: currentUserId }, { userId: otherUserId }] },
        },
      },
    });
  }

  async sendMessage(userId: string, conversationId: string, body: string): Promise<unknown> {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!participant) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    const message = await this.prisma.message.create({
      data: { conversationId, senderId: userId, body },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    this.chatGateway.emitNewMessage(conversationId, {
      id: message.id,
      conversationId,
      senderId: userId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isRead: message.isRead,
    });

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    this.chatGateway.emitInboxUpdate(
      participants.map((p) => p.userId),
      {
        conversationId,
        messageId: message.id,
        senderId: userId,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    );

    const recipients = participants.filter((p) => p.userId !== userId);
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    const dataJson = { conversationId, messageId: message.id };
    for (const { userId: recipientId } of recipients) {
      void this.notificationsService.createInAppAndPush(
        recipientId,
        NotificationType.NEW_MESSAGE,
        sender?.username ?? 'New message',
        preview,
        dataJson,
      );
    }

    return message;
  }

  async markRead(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.chatGateway.emitInboxRead(userId, conversationId);
    this.chatGateway.emitConversationMessagesRead(conversationId, userId);
    return { ok: true };
  }
}
