import { randomUUID } from 'crypto';
import * as path from 'path';

const STORE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const ACCEPT_EXTS = [...STORE_EXTS, '.heic', '.heif'];

export function storedImageFilename(originalName?: string): string {
  const ext = path.extname(originalName || '').toLowerCase();
  const useExt = STORE_EXTS.includes(ext) ? ext : '.jpg';
  return `${randomUUID()}${useExt}`;
}

/** Accept iOS Simulator / PHPicker files that often have no extension or HEIC names. */
export function acceptImageUpload(file: { originalname?: string; mimetype?: string }): boolean {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (mime === 'application/octet-stream' || mime === 'application/heic' || mime === 'application/heif' || !mime) {
    return !ext || ACCEPT_EXTS.includes(ext);
  }
  return ACCEPT_EXTS.includes(ext);
}
