import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AddPhotoDto, UpdateProfileDto } from './profiles.dto';
import { normalizeProfilePhotoUrl } from '../common/utils/profile-photo-url';
import { ProfilesService } from './profiles.service';

type AuthedRequest = Request & { user: { sub: string } };

const PROFILE_PHOTOS_DIR = path.join(process.cwd(), 'uploads', 'profile-photos');

function ensureProfilePhotosDir(): void {
  if (!fs.existsSync(PROFILE_PHOTOS_DIR)) {
    fs.mkdirSync(PROFILE_PHOTOS_DIR, { recursive: true });
  }
}

@Controller('profiles')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  async getMe(@Req() req: AuthedRequest): Promise<unknown> {
    const row = await this.profilesService.getOwnProfile(req.user.sub);
    if (!row) {
      throw new NotFoundException('Profile not found');
    }
    return row;
  }

  @Get(':userId')
  getPublic(@Param('userId') userId: string): Promise<unknown> {
    return this.profilesService.getPublicProfile(userId);
  }

  @Patch('me')
  updateMe(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto): Promise<unknown> {
    return this.profilesService.updateOwnProfile(req.user.sub, dto);
  }

  @Post('me/photos/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureProfilePhotosDir();
          cb(null, PROFILE_PHOTOS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
          const useExt = allowed.includes(ext) ? ext : '.jpg';
          cb(null, `${randomUUID()}${useExt}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const extOk = allowedExt.includes(ext);
        const mimeOk = file.mimetype.startsWith('image/');
        // Android / image_picker often send application/octet-stream; validate by extension too.
        const octetOk = file.mimetype === 'application/octet-stream' && extOk;
        if (mimeOk || octetOk) {
          cb(null, true);
          return;
        }
        // Never pass Error to cb — that becomes an unhandled 500. Reject file; handler returns 400.
        cb(null, false);
      },
    }),
  )
  async uploadPhoto(@Req() req: AuthedRequest, @UploadedFile() file?: Express.Multer.File): Promise<unknown> {
    if (!file?.filename) {
      throw new BadRequestException(
        'Image file is required (field name: file). Use a .jpg, .png, .webp, or .gif image.',
      );
    }
    const filename = file.filename;
    const forwarded = req.headers['x-forwarded-proto'];
    const proto =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]!.trim()
        : Array.isArray(forwarded)
          ? forwarded[0]!.trim()
          : req.protocol;
    const host = req.get('host');
    const fallbackBase = host ? `${proto}://${host}` : null;
    const publicBase =
      process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') ?? fallbackBase;
    if (!publicBase) {
      throw new BadRequestException('Cannot determine public API base URL for image');
    }
    const imageUrl = normalizeProfilePhotoUrl(
      `${publicBase}/api/v1/uploads/profile-photos/${filename}`,
    )!;
    const agg = await this.prisma.profilePhoto.aggregate({
      where: { userId: req.user.sub },
      _max: { sortOrder: true },
    });
    const nextSort = (agg._max.sortOrder ?? -1) + 1;
    const existingCount = await this.prisma.profilePhoto.count({ where: { userId: req.user.sub } });
    const created = await this.prisma.profilePhoto.create({
      data: {
        userId: req.user.sub,
        imageUrl,
        sortOrder: nextSort,
        isPrimary: existingCount === 0,
      },
    });
    await this.profilesService.recomputeAndPersistCompletion(req.user.sub);
    return { ...created, imageUrl: normalizeProfilePhotoUrl(created.imageUrl) ?? created.imageUrl };
  }

  @Post('me/photos')
  async addPhoto(@Req() req: AuthedRequest, @Body() body: AddPhotoDto): Promise<unknown> {
    const row = await this.prisma.profilePhoto.create({ data: { userId: req.user.sub, imageUrl: body.imageUrl } });
    await this.profilesService.recomputeAndPersistCompletion(req.user.sub);
    return row;
  }

  @Delete('me/photos/:photoId')
  async deletePhoto(
    @Req() req: AuthedRequest,
    @Param('photoId') photoId: string,
  ): Promise<{ ok: true }> {
    await this.prisma.profilePhoto.deleteMany({ where: { id: photoId, userId: req.user.sub } });
    await this.profilesService.recomputeAndPersistCompletion(req.user.sub);
    return { ok: true };
  }

  @Patch('me/photos/reorder')
  async reorderPhotos(
    @Req() req: AuthedRequest,
    @Body() body: { orderedPhotoIds: string[] },
  ): Promise<{ ok: true }> {
    await Promise.all(
      body.orderedPhotoIds.map((photoId, index) =>
        this.prisma.profilePhoto.updateMany({
          where: { id: photoId, userId: req.user.sub },
          data: { sortOrder: index },
        }),
      ),
    );
    return { ok: true };
  }

  @Patch('me/photos/:photoId/primary')
  async setPrimaryPhoto(
    @Req() req: AuthedRequest,
    @Param('photoId') photoId: string,
  ): Promise<{ ok: true }> {
    await this.prisma.profilePhoto.updateMany({
      where: { userId: req.user.sub },
      data: { isPrimary: false },
    });
    await this.prisma.profilePhoto.updateMany({
      where: { userId: req.user.sub, id: photoId },
      data: { isPrimary: true },
    });
    return { ok: true };
  }
}
