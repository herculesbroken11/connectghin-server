import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/** Bump when in-app Terms of Service content meaningfully changes. */
export const CURRENT_TERMS_VERSION = '2026-08-31';

@Injectable()
export class TermsAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { termsVersion: true, termsAcceptedAt: true },
    });
    return (
      Boolean(user?.termsAcceptedAt) && user?.termsVersion === CURRENT_TERMS_VERSION
    );
  }

  async assertAcceptedCurrentTerms(userId: string): Promise<void> {
    if (!(await this.hasAcceptedCurrentTerms(userId))) {
      throw new ForbiddenException({
        code: 'TERMS_ACCEPTANCE_REQUIRED',
        message: 'Accept the Terms of Service before creating content.',
        termsVersion: CURRENT_TERMS_VERSION,
      });
    }
  }

  async acceptCurrentTerms(userId: string): Promise<{
    ok: true;
    termsVersion: string;
    termsAcceptedAt: string;
  }> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
      select: { termsVersion: true, termsAcceptedAt: true },
    });
    return {
      ok: true,
      termsVersion: updated.termsVersion!,
      termsAcceptedAt: updated.termsAcceptedAt!.toISOString(),
    };
  }

  termsStatus(user: {
    termsVersion: string | null;
    termsAcceptedAt: Date | null;
  }): {
    termsVersion: string | null;
    termsAcceptedAt: string | null;
    currentTermsVersion: string;
    needsTermsAcceptance: boolean;
  } {
    const needs =
      !user.termsAcceptedAt || user.termsVersion !== CURRENT_TERMS_VERSION;
    return {
      termsVersion: user.termsVersion,
      termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
      currentTermsVersion: CURRENT_TERMS_VERSION,
      needsTermsAcceptance: needs,
    };
  }
}
