import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { diskStorage, MulterError } from 'multer';
import * as path from 'path';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { acceptImageUpload, storedImageFilename } from '../common/upload/image-upload';
import {
  PROFILE_POST_IMAGE_REQUIRED,
  profilePostUploadError,
  unsupportedProfileImageException,
} from './profile-post-upload';
import { normalizePostImageUrl, ProfilePostsService } from './profile-posts.service';

@Catch(MulterError)
class ProfilePostUploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const mapped = profilePostUploadError(exception)!;
    const response = host.switchToHttp().getResponse<Response>();
    response.status(mapped.statusCode).json({
      statusCode: mapped.statusCode,
      message: mapped.message,
    });
  }
}

const PROFILE_POSTS_DIR = path.join(process.cwd(), 'uploads', 'profile-posts');

function ensureProfilePostsDir(): void {
  fs.mkdirSync(PROFILE_POSTS_DIR, { recursive: true });
}

class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}

class CreateTextPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@UseGuards(JwtAuthGuard, SuspendedUserGuard)
@Controller('profile-posts')
export class ProfilePostsController {
  constructor(private readonly service: ProfilePostsService) {}

  @Get('users/:userId')
  list(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Query() query: ListQueryDto,
  ): Promise<unknown> {
    return this.service.listForUser(req.user.sub, userId, query.page ?? 0, query.pageSize ?? 20);
  }

  @Post()
  createText(@Req() req: AuthedRequest, @Body() dto: CreateTextPostDto): Promise<unknown> {
    return this.service.create(req.user.sub, { body: dto.body, imageUrl: dto.imageUrl });
  }

  @Post('upload')
  @UseFilters(ProfilePostUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureProfilePostsDir();
          cb(null, PROFILE_POSTS_DIR);
        },
        filename: (_req, file, cb) => {
          cb(null, storedImageFilename(file.originalname));
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (acceptImageUpload(file)) {
          cb(null, true);
          return;
        }
        cb(unsupportedProfileImageException(), false);
      },
    }),
  )
  async createWithImage(
    @Req() req: AuthedRequest,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: { body?: string },
  ): Promise<unknown> {
    if (!file?.filename) {
      throw new BadRequestException(PROFILE_POST_IMAGE_REQUIRED);
    }
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
    const imageUrl = normalizePostImageUrl(
      `${publicBase}/api/v1/uploads/profile-posts/${file.filename}`,
    )!;
    const caption = typeof body?.body === 'string' ? body.body : undefined;
    const storedPath = path.join(PROFILE_POSTS_DIR, file.filename);
    try {
      return await this.service.create(req.user.sub, { body: caption, imageUrl });
    } catch (error) {
      fs.unlink(storedPath, () => undefined);
      throw error;
    }
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.service.remove(req.user.sub, id);
  }
}
