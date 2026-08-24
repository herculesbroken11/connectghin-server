import { Injectable } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GHINVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<unknown> {
    const row = await this.prisma.gHINVerificationRequest.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });
    if (!row) {
      return {
        verification: {
          status: 'not_submitted',
          submittedAt: null,
          reviewedAt: null,
        },
      };
    }
    return {
      ...row,
      verification: {
        status: row.status.toLowerCase(),
        submittedAt: row.submittedAt?.toISOString?.() ?? row.submittedAt,
        reviewedAt: row.reviewedAt?.toISOString?.() ?? row.reviewedAt ?? null,
        ghinNumber: row.ghinNumber,
        submittedFirstName: row.submittedFirstName,
        submittedLastName: row.submittedLastName,
        rejectionReason: row.rejectionReason,
      },
    };
  }

  request(
    userId: string,
    ghinNumber: string,
    opts?: { submittedFirstName?: string; submittedLastName?: string },
  ): Promise<unknown> {
    // Manual flow (current): always PENDING until admin approves.
    return this.prisma.gHINVerificationRequest.create({
      data: {
        userId,
        ghinNumber,
        status: VerificationStatus.PENDING,
        submittedFirstName: opts?.submittedFirstName?.trim() || null,
        submittedLastName: opts?.submittedLastName?.trim() || null,
      },
    });
  }

  appeal(userId: string, appealNote: string): Promise<unknown> {
    return this.prisma.gHINVerificationRequest.create({
      data: { userId, ghinNumber: 'APPEAL', appealNote, status: VerificationStatus.APPEAL },
    });
  }
}
