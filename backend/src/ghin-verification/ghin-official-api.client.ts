/**
 * GHINder — planned integration with official USGA/GHIN APIs.
 *
 * Production today: verification stays manual (admin approve/reject). Nothing here performs
 * network calls unless you uncomment the blocks below and add credentials.
 *
 * When you enable this, you will typically need (exact names depend on USGA contract):
 * - OFFICIAL_GHIN_API_BASE_URL
 * - OFFICIAL_GHIN_OAUTH_TOKEN_URL (or client-credentials endpoint)
 * - OFFICIAL_GHIN_CLIENT_ID / OFFICIAL_GHIN_CLIENT_SECRET
 * - Optional: OFFICIAL_GHIN_AUTO_VERIFY=true to auto-approve on name+number match
 */

/** Shape of golfer data we would persist from an official lookup (e.g. handicap snapshot). */
export interface OfficialGhinGolferSnapshot {
  ghinNumber: string;
  firstName: string;
  lastName: string;
  /** Handicap index as returned by GHIN (string preserves decimals as in API). */
  handicapIndex?: string;
}

/** Strip non-digits for comparison and future API calls (GHIN display formats vary). */
export function normalizeGhinNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Conservative name check for a future auto-verify path. Returns false if the user did not
 * submit both names — manual review should handle that case.
 */
export function namesLikelyMatch(
  submitted: { first?: string | null; last?: string | null },
  official: Pick<OfficialGhinGolferSnapshot, 'firstName' | 'lastName'>,
): boolean {
  const sf = submitted.first?.trim().toLowerCase();
  const sl = submitted.last?.trim().toLowerCase();
  if (!sf || !sl) return false;
  const of = official.firstName.trim().toLowerCase();
  const ol = official.lastName.trim().toLowerCase();
  return sf === of && sl === ol;
}

/*
 * -----------------------------------------------------------------------------
 * FUTURE: OAuth client-credentials + golfer lookup (uncomment and adapt to your contract).
 * -----------------------------------------------------------------------------
 *
 * import { Injectable, Logger } from '@nestjs/common';
 * import { ConfigService } from '@nestjs/config';
 *
 * @Injectable()
 * export class OfficialGhinApiClient {
 *   private readonly logger = new Logger(OfficialGhinApiClient.name);
 *   private accessToken: string | null = null;
 *   private accessTokenExpiresAt = 0;
 *
 *   constructor(private readonly config: ConfigService) {}
 *
 *   private async getAccessToken(): Promise<string> {
 *     const now = Date.now();
 *     if (this.accessToken && now < this.accessTokenExpiresAt - 60_000) {
 *       return this.accessToken;
 *     }
 *     const base = this.config.get<string>('OFFICIAL_GHIN_OAUTH_TOKEN_URL');
 *     const clientId = this.config.get<string>('OFFICIAL_GHIN_CLIENT_ID');
 *     const clientSecret = this.config.get<string>('OFFICIAL_GHIN_CLIENT_SECRET');
 *     if (!base || !clientId || !clientSecret) {
 *       throw new Error('Official GHIN OAuth env not configured');
 *     }
 *     const body = new URLSearchParams({
 *       grant_type: 'client_credentials',
 *       client_id: clientId,
 *       client_secret: clientSecret,
 *       // scope: '...', // per USGA documentation
 *     });
 *     const res = await fetch(base, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
 *       body,
 *     });
 *     if (!res.ok) {
 *       this.logger.warn(`GHIN token failed: ${res.status}`);
 *       throw new Error('GHIN token request failed');
 *     }
 *     const json = (await res.json()) as { access_token: string; expires_in?: number };
 *     this.accessToken = json.access_token;
 *     this.accessTokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
 *     return this.accessToken;
 *   }
 *
 *   async fetchGolferByGhinNumber(ghinNumber: string): Promise<OfficialGhinGolferSnapshot | null> {
 *     const apiBase = this.config.get<string>('OFFICIAL_GHIN_API_BASE_URL');
 *     if (!apiBase) return null;
 *     const token = await this.getAccessToken();
 *     const normalized = normalizeGhinNumber(ghinNumber);
 *     // const path = `/golfers/${normalized}`; // replace with real route from USGA spec
 *     const url = `${apiBase.replace(/\/$/, '')}/golfers/${encodeURIComponent(normalized)}`;
 *     const res = await fetch(url, {
 *       headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
 *     });
 *     if (res.status === 404) return null;
 *     if (!res.ok) {
 *       this.logger.warn(`GHIN lookup failed: ${res.status}`);
 *       return null;
 *     }
 *     const data = (await res.json()) as Record<string, unknown>;
 *     // Map response fields to OfficialGhinGolferSnapshot per actual API schema.
 *     return {
 *       ghinNumber: normalized,
 *       firstName: String(data['firstName'] ?? ''),
 *       lastName: String(data['lastName'] ?? ''),
 *       handicapIndex: data['handicapIndex'] != null ? String(data['handicapIndex']) : undefined,
 *     };
 *   }
 * }
 *
 * -----------------------------------------------------------------------------
 * FUTURE: call from GHINVerificationService.request() after creating the PENDING row.
 * If match: set request VERIFIED, profile.isGHINVerified, handicapSnapshot from API.
 * If no match or API error: leave PENDING for admin (or set a distinct status if you add one).
 * -----------------------------------------------------------------------------
 *
 * async function tryOfficialGhinVerify(
 *   prisma: PrismaService,
 *   requestId: string,
 *   userId: string,
 *   ghinNumber: string,
 *   submittedFirstName: string | null,
 *   submittedLastName: string | null,
 *   client: OfficialGhinApiClient,
 * ): Promise<void> {
 *   const auto = process.env.OFFICIAL_GHIN_AUTO_VERIFY === 'true';
 *   if (!auto) return;
 *   const official = await client.fetchGolferByGhinNumber(ghinNumber);
 *   if (!official) return;
 *   const match = namesLikelyMatch(
 *     { first: submittedFirstName, last: submittedLastName },
 *     official,
 *   );
 *   if (!match) return;
 *   const handicap = official.handicapIndex != null ? new Prisma.Decimal(official.handicapIndex) : undefined;
 *   await prisma.$transaction([
 *     prisma.gHINVerificationRequest.update({
 *       where: { id: requestId },
 *       data: {
 *         status: VerificationStatus.VERIFIED,
 *         reviewedAt: new Date(),
 *         reviewedByAdminId: null,
 *         handicapSnapshot: handicap,
 *       },
 *     }),
 *     prisma.profile.updateMany({
 *       where: { userId },
 *       data: { isGHINVerified: true },
 *     }),
 *   ]);
 * }
 */
