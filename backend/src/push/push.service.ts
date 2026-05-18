import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevicePlatform } from '@prisma/client';
import * as admin from 'firebase-admin';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private firebaseReady = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!json) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set; push notifications disabled');
      return;
    }
    try {
      const credentials = JSON.parse(json) as admin.ServiceAccount;
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(credentials) });
      }
      this.firebaseReady = true;
      this.logger.log('Firebase Admin initialized for FCM');
    } catch (error) {
      this.logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', error);
    }
  }

  isEnabled(): boolean {
    return this.firebaseReady;
  }

  /** Sends FCM to iOS/Android device tokens for a user (skips WEB). */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseReady) {
      return;
    }
    const tokens = await this.prisma.deviceToken.findMany({
      where: {
        userId,
        platform: { in: [DevicePlatform.IOS, DevicePlatform.ANDROID] },
      },
      select: { token: true },
    });
    const tokenList = tokens.map((t) => t.token).filter(Boolean);
    if (!tokenList.length) {
      return;
    }
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { pushEnabled: true },
    });
    if (settings && !settings.pushEnabled) {
      return;
    }
    const message: admin.messaging.MulticastMessage = {
      tokens: tokenList,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };
    try {
      const result = await admin.messaging().sendEachForMulticast(message);
      if (result.failureCount > 0) {
        this.logger.warn(`FCM partial failure: ${result.failureCount}/${tokenList.length}`);
      }
    } catch (error) {
      this.logger.error('FCM send failed', error);
    }
  }
}
