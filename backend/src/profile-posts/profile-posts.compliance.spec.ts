import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { MulterError } from 'multer';
import { join } from 'path';

import {
  PROFILE_POST_IMAGE_TOO_LARGE,
  PROFILE_POST_IMAGE_UPLOAD_FAILED,
  profilePostUploadError,
} from './profile-post-upload';
import { prepareProfilePostFields } from './profile-posts.service';

describe('profile post rules', () => {
  it('accepts a caption without an image', () => {
    expect(prepareProfilePostFields({ body: '  Had a great day on the course.  ' })).toEqual({
      body: 'Had a great day on the course.',
      imageUrl: null,
    });
  });

  it('accepts an image without a caption', () => {
    expect(
      prepareProfilePostFields({
        imageUrl: 'https://api.example.com/api/v1/uploads/profile-posts/photo.jpg',
      }).imageUrl,
    ).toContain('/uploads/profile-posts/photo.jpg');
  });

  it('rejects an empty post', () => {
    expect(() => prepareProfilePostFields({ body: '   ' })).toThrow(BadRequestException);
  });

  it('rejects a caption over 2000 characters', () => {
    expect(() => prepareProfilePostFields({ body: 'a'.repeat(2001) })).toThrow(
      /2000 characters or less/,
    );
  });

  it('maps an oversized upload to a stable 413 message', () => {
    expect(profilePostUploadError(new MulterError('LIMIT_FILE_SIZE'))).toEqual({
      statusCode: 413,
      message: PROFILE_POST_IMAGE_TOO_LARGE,
    });
  });

  it('maps other upload failures to a stable 400 message', () => {
    expect(profilePostUploadError(new MulterError('LIMIT_UNEXPECTED_FILE'))).toEqual({
      statusCode: 400,
      message: PROFILE_POST_IMAGE_UPLOAD_FAILED,
    });
    expect(profilePostUploadError(new Error('disk'))).toBeNull();
  });

  it('requires current terms before the profile post is saved', () => {
    const src = readFileSync(join(__dirname, 'profile-posts.service.ts'), 'utf8');
    const createAt = src.indexOf('async create(');
    const removeAt = src.indexOf('async remove(');
    const createBody = src.slice(createAt, removeAt);
    expect(createBody.indexOf('assertAcceptedCurrentTerms')).toBeGreaterThan(-1);
    expect(createBody.indexOf('assertAcceptedCurrentTerms')).toBeLessThan(
      createBody.indexOf('profilePost.create'),
    );
  });

  it('requires auth on the profile post controller', () => {
    const src = readFileSync(join(__dirname, 'profile-posts.controller.ts'), 'utf8');
    expect(src).toContain('@UseGuards(JwtAuthGuard, SuspendedUserGuard)');
    expect(src).toContain("@Post('upload')");
    expect(src).toContain('PROFILE_POST_IMAGE_REQUIRED');
  });
});
