import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  extractAppleOriginalTransactionIdFromNotificationPayload,
  verifyAppleStoreKitJws,
} from './apple-storekit-jws.verifier';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions/notifications')
export class SubscriptionsNotificationsController {
  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Post('apple')
  @HttpCode(200)
  async apple(
    @Body() body: Record<string, unknown>,
    @Headers('x-iap-signature') signature: string | undefined,
  ): Promise<{ received: true; processed: boolean }> {
    const secret = this.config.get<string>('APPLE_SERVER_NOTIFICATION_SECRET')?.trim();
    if (!secret || signature !== secret) {
      throw new UnauthorizedException('Invalid Apple notification signature');
    }
    const signedPayload = asString(body.signedPayload);
    if (!signedPayload) {
      return { received: true, processed: false };
    }
    const bundleId = this.config.get<string>('APPLE_IAP_BUNDLE_ID')?.trim() ?? null;
    let outerPayload: Record<string, unknown>;
    try {
      outerPayload = verifyAppleStoreKitJws(signedPayload, bundleId);
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid Apple signedPayload');
    }
    const originalTransactionId = extractAppleOriginalTransactionIdFromNotificationPayload(
      outerPayload,
      bundleId,
    );
    if (!originalTransactionId) {
      return { received: true, processed: false };
    }
    const res = await this.subscriptionsService.processAppleServerNotification(originalTransactionId);
    return { received: true, processed: res.processed };
  }

  @Post('google')
  @HttpCode(200)
  async google(
    @Body() body: Record<string, unknown>,
    @Headers('x-iap-signature') signature: string | undefined,
  ): Promise<{ received: true; processed: boolean }> {
    const secret = this.config.get<string>('GOOGLE_SERVER_NOTIFICATION_SECRET')?.trim();
    if (!secret || signature !== secret) {
      throw new UnauthorizedException('Invalid Google notification signature');
    }

    const message = (body.message ?? {}) as Record<string, unknown>;
    const data = asString(message.data);
    if (!data) return { received: true, processed: false };
    let decodedJson: Record<string, unknown> | null = null;
    try {
      decodedJson = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as Record<string, unknown>;
    } catch {
      return { received: true, processed: false };
    }
    const subN = (decodedJson.subscriptionNotification ?? {}) as Record<string, unknown>;
    const purchaseToken = asString(subN.purchaseToken);
    if (!purchaseToken) return { received: true, processed: false };
    const res = await this.subscriptionsService.processGoogleServerNotification(purchaseToken);
    return { received: true, processed: res.processed };
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

