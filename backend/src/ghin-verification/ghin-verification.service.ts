import { Injectable } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GHINVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  me(userId: string): Promise<unknown> {
    return this.prisma.gHINVerificationRequest.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  request(
    userId: string,
    ghinNumber: string,
    opts?: { submittedFirstName?: string; submittedLastName?: string },
  ): Promise<unknown> {
    // Manual flow (current): always PENDING until admin approves.
    // GHINder + official GHIN API: see `ghin-official-api.client.ts` — uncomment the Nest client,
    // register it in GHINVerificationModule, then after `create` await tryOfficialGhinVerify(...)
    // when OFFICIAL_GHIN_AUTO_VERIFY is set (example wiring is in a block comment in that file).
    return this.prisma.gHINVerificationRequest.create({
      data: {
        userId,
        ghinNumber,
        status: VerificationStatus.PENDING,
        submittedFirstName: opts?.submittedFirstName?.trim() || null,
        submittedLastName: opts?.submittedLastName?.trim() || null,
      },
    });

    /*
    // Example post-create hook (do not enable until USGA credentials and API routes are confirmed):
    const row = await this.prisma.gHINVerificationRequest.create({ ... });
    void this.officialGhin.tryAutoVerify({
      requestId: row.id,
      userId,
      ghinNumber,
      submittedFirstName: opts?.submittedFirstName ?? null,
      submittedLastName: opts?.submittedLastName ?? null,
    });
    return row;
    */
  }

  appeal(userId: string, appealNote: string): Promise<unknown> {
    return this.prisma.gHINVerificationRequest.create({
      data: { userId, ghinNumber: 'APPEAL', appealNote, status: VerificationStatus.APPEAL },
    });
  }
}
