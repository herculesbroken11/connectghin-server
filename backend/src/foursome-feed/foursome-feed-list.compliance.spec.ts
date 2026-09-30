import { FoursomeGameStyle, FoursomePostStatus, UserLifecycleStatus } from '@prisma/client';

import {
  buildFoursomeFeedListWhere,
  persistableFoursomeGameStyle,
  resolveFeedExcludedPosterIds,
} from './foursome-feed.service';

describe('Foursome Feed list filters', () => {
  const viewerId = 'viewer-1';
  const otherId = 'other-2';
  const blockedId = 'blocked-3';
  const now = new Date('2026-09-21T16:00:00.000Z');

  it('does not exclude the viewer — own OPEN posts remain visible', () => {
    const excluded = resolveFeedExcludedPosterIds(viewerId, []);
    expect(excluded).not.toContain(viewerId);
    expect(excluded).toEqual([]);

    const where = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [],
      gameStyle: 'CASUAL',
      now,
    });
    expect(where.posterUserId).toBeUndefined();
    expect(where.status).toBe(FoursomePostStatus.OPEN);
    expect(where.roundDate.gte).toEqual(now);
    expect(where.gameStyle).toBe(FoursomeGameStyle.CASUAL);
  });

  it('excludes blocked users in either direction but keeps viewer', () => {
    const asBlocker = resolveFeedExcludedPosterIds(viewerId, [
      { blockerUserId: viewerId, blockedUserId: blockedId },
    ]);
    expect(asBlocker).toContain(blockedId);
    expect(asBlocker).not.toContain(viewerId);

    const asBlocked = resolveFeedExcludedPosterIds(viewerId, [
      { blockerUserId: otherId, blockedUserId: viewerId },
    ]);
    expect(asBlocked).toContain(otherId);
    expect(asBlocked).not.toContain(viewerId);

    const where = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [{ blockerUserId: viewerId, blockedUserId: blockedId }],
      now,
    });
    expect(where.posterUserId?.notIn).toEqual([blockedId]);
  });

  it('requires status OPEN (excludes CANCELED / FILLED)', () => {
    const where = buildFoursomeFeedListWhere({ viewerId, blocks: [], now });
    expect(where.status).toBe(FoursomePostStatus.OPEN);
    expect(where.status).not.toBe(FoursomePostStatus.CANCELED);
    expect(where.status).not.toBe(FoursomePostStatus.FILLED);
  });

  it('requires roundDate >= now (expired posts excluded)', () => {
    const where = buildFoursomeFeedListWhere({ viewerId, blocks: [], now });
    expect(where.roundDate).toEqual({ gte: now });
  });

  it('applies gameStyle filter when not ALL', () => {
    const casual = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [],
      gameStyle: 'CASUAL',
      now,
    });
    expect(casual.gameStyle).toBe(FoursomeGameStyle.CASUAL);

    const all = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [],
      gameStyle: 'ALL',
      now,
    });
    expect(all.gameStyle).toBeUndefined();
  });

  it('keeps Casual, Serious, and Tournament on separate filters', () => {
    const casual = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [],
      gameStyle: 'CASUAL',
      now,
    });
    const serious = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [],
      gameStyle: 'SERIOUS',
      now,
    });
    const tournament = buildFoursomeFeedListWhere({
      viewerId,
      blocks: [],
      gameStyle: 'TOURNAMENT',
      now,
    });

    expect(casual.gameStyle).toBe(FoursomeGameStyle.CASUAL);
    expect(serious.gameStyle).toBe(FoursomeGameStyle.SERIOUS);
    expect(tournament.gameStyle).toBe(FoursomeGameStyle.TOURNAMENT);
    expect(casual.gameStyle).not.toBe(serious.gameStyle);
    expect(casual.gameStyle).not.toBe(tournament.gameStyle);
    expect(serious.gameStyle).not.toBe(tournament.gameStyle);
  });

  it('keeps legacy COMPETITIVE posts out of Casual, Serious, and Tournament filters', () => {
    expect(persistableFoursomeGameStyle('COMPETITIVE')).toBe(FoursomeGameStyle.COMPETITIVE);
    expect(persistableFoursomeGameStyle('competitive')).toBe(FoursomeGameStyle.COMPETITIVE);

    for (const style of ['CASUAL', 'SERIOUS', 'TOURNAMENT'] as const) {
      const where = buildFoursomeFeedListWhere({
        viewerId,
        blocks: [],
        gameStyle: style,
        now,
      });
      expect(where.gameStyle).toBe(style);
      expect(where.gameStyle).not.toBe(FoursomeGameStyle.COMPETITIVE);
    }
  });

  it('persists Serious and Tournament without rewriting them to Casual', () => {
    expect(persistableFoursomeGameStyle('SERIOUS')).toBe(FoursomeGameStyle.SERIOUS);
    expect(persistableFoursomeGameStyle('serious')).toBe(FoursomeGameStyle.SERIOUS);
    expect(persistableFoursomeGameStyle('TOURNAMENT')).toBe(FoursomeGameStyle.TOURNAMENT);
    expect(persistableFoursomeGameStyle('CASUAL')).toBe(FoursomeGameStyle.CASUAL);
    expect(() => persistableFoursomeGameStyle(undefined)).toThrow('Invalid gameStyle');
    expect(() => persistableFoursomeGameStyle('')).toThrow('Invalid gameStyle');
    expect(() => persistableFoursomeGameStyle('FUN')).toThrow('Invalid gameStyle');
  });

  it('requires active non-suspended posters', () => {
    const where = buildFoursomeFeedListWhere({ viewerId, blocks: [], now });
    expect(where.poster).toEqual({
      isSuspended: false,
      isActive: true,
      lifecycleStatus: UserLifecycleStatus.ACTIVE,
    });
  });
});
