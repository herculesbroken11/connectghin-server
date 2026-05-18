import { BadRequestException, Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_SUBDIR = path.join('uploads', 'profile-photos');

@Controller('uploads')
export class UploadsController {
  @Get('profile-photos/:filename')
  getProfilePhoto(@Param('filename') filename: string, @Res() res: Response): void {
    const safe = path.basename(filename);
    if (!safe || safe !== filename) {
      throw new BadRequestException('Invalid filename');
    }
    const filePath = path.join(process.cwd(), UPLOAD_SUBDIR, safe);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new NotFoundException('File not found');
    }
    res.sendFile(filePath);
  }
}
