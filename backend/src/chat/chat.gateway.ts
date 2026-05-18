import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { JwtPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

type SocketData = { userId?: string };

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (typeof client.handshake.query?.token === 'string' ? client.handshake.query.token : undefined);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const userId = payload.sub;
      (client.data as SocketData).userId = userId;
      await client.join(this.userRoomName(userId));
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: true } | { error: string }> {
    const userId = (client.data as SocketData).userId;
    if (!userId) {
      return { error: 'Unauthorized' };
    }
    const conversationId = body?.conversationId;
    if (!conversationId) {
      return { error: 'conversationId required' };
    }
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!participant) {
      return { error: 'Forbidden' };
    }
    await client.join(this.roomName(conversationId));
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: true }> {
    const conversationId = body?.conversationId;
    if (conversationId) {
      await client.leave(this.roomName(conversationId));
    }
    return { ok: true };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string; isTyping?: boolean },
  ): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId || !body?.conversationId) {
      return;
    }
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId: body.conversationId, userId },
      select: { id: true },
    });
    if (!participant) {
      return;
    }
    client.to(this.roomName(body.conversationId)).emit('typing', {
      conversationId: body.conversationId,
      userId,
      isTyping: body.isTyping ?? true,
    });
  }

  emitNewMessage(
    conversationId: string,
    payload: {
      id: string;
      conversationId: string;
      senderId: string;
      body: string;
      createdAt: string;
      isRead: boolean;
    },
  ): void {
    this.server.to(this.roomName(conversationId)).emit('message', payload);
  }

  /** Peer opened / marked the thread read — update read receipts for senders still in the chat. */
  emitConversationMessagesRead(conversationId: string, readByUserId: string): void {
    this.server.to(this.roomName(conversationId)).emit('messagesRead', {
      conversationId,
      readByUserId,
    });
  }

  /** Lets clients refresh Matches / Messages lists without joining every conversation room. */
  emitInboxUpdate(
    userIds: string[],
    payload: {
      conversationId: string;
      messageId: string;
      senderId: string;
      body: string;
      createdAt: string;
    },
  ): void {
    const seen = new Set<string>();
    for (const uid of userIds) {
      if (seen.has(uid)) {
        continue;
      }
      seen.add(uid);
      this.server.to(this.userRoomName(uid)).emit('inbox', payload);
    }
  }

  /** Notifies this user's sockets (e.g. other tabs) to refresh unread after mark-read. */
  emitInboxRead(userId: string, conversationId: string): void {
    this.server.to(this.userRoomName(userId)).emit('inbox', {
      conversationId,
      kind: 'read' as const,
    });
  }

  private roomName(conversationId: string): string {
    return `conv:${conversationId}`;
  }

  private userRoomName(userId: string): string {
    return `user:${userId}`;
  }
}
