import { BadRequestException } from '@nestjs/common';
import { MulterError } from 'multer';

export const PROFILE_POST_IMAGE_REQUIRED =
  'Image file is required. Use a JPG, PNG, WEBP, or GIF image.';

export const PROFILE_POST_IMAGE_UNSUPPORTED =
  'Please choose a JPG, PNG, WEBP, or GIF image.';

export const PROFILE_POST_IMAGE_TOO_LARGE =
  'That photo is too large. Please choose a smaller image.';

export const PROFILE_POST_IMAGE_UPLOAD_FAILED =
  'That photo could not be uploaded. Please try another image.';

export function unsupportedProfileImageException(): BadRequestException {
  return new BadRequestException(PROFILE_POST_IMAGE_UNSUPPORTED);
}

/** Stable status and message for multer failures on the profile post upload. */
export function profilePostUploadError(error: unknown): { statusCode: number; message: string } | null {
  if (!(error instanceof MulterError)) return null;
  if (error.code === 'LIMIT_FILE_SIZE') {
    return { statusCode: 413, message: PROFILE_POST_IMAGE_TOO_LARGE };
  }
  return { statusCode: 400, message: PROFILE_POST_IMAGE_UPLOAD_FAILED };
}
