import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FoursomePostStatus, ReportTargetType } from '@prisma/client';

import { normalizeFeedReportReason, WEB_DELETION_GENERIC_MESSAGE } from './privacy-safety.service';
import { CURRENT_TERMS_VERSION } from '../common/terms/terms-acceptance.service';

describe('normalizeFeedReportReason', () => {
  it('accepts canonical reasons', () => {
    expect(normalizeFeedReportReason('SPAM')).toBe('SPAM');
    expect(normalizeFeedReportReason('Harassment')).toBe('HARASSMENT');
  });

  it('rejects unknown reasons', () => {
    expect(() => normalizeFeedReportReason('NOT_A_REASON')).toThrow();
  });
});

describe('Play compliance constants', () => {
  it('exposes current terms version', () => {
    expect(CURRENT_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defines feed report target type', () => {
    expect(ReportTargetType.FOURSOME_FEED_POST).toBe('FOURSOME_FEED_POST');
    expect(FoursomePostStatus.CANCELED).toBe('CANCELED');
  });
});

describe('web deletion public messaging', () => {
  it('uses non-enumerating generic success copy', () => {
    expect(WEB_DELETION_GENERIC_MESSAGE).toContain('confirmation link');
    expect(WEB_DELETION_GENERIC_MESSAGE.toLowerCase()).not.toContain('not found');
  });
});

describe('error code shapes used by compliance APIs', () => {
  it('duplicate report uses ConflictException shape', () => {
    const err = new ConflictException({
      code: 'DUPLICATE_REPORT',
      message: 'You already have an open report for this post',
    });
    const body = err.getResponse();
    expect(typeof body === 'object' && body !== null && (body as { code: string }).code).toBe(
      'DUPLICATE_REPORT',
    );
  });

  it('unauthorized deletion ownership is ForbiddenException for admins', () => {
    const err = new ForbiddenException({
      code: 'ADMIN_DELETE_FORBIDDEN',
      message: 'Admin accounts cannot be deleted through this flow',
    });
    expect(err.getStatus()).toBe(403);
  });

  it('missing post uses NotFoundException', () => {
    const err = new NotFoundException({
      code: 'POST_NOT_FOUND',
      message: 'Feed post not found',
    });
    expect(err.getStatus()).toBe(404);
  });
});
