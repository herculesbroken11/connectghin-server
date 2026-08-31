import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';

import { PrivacySafetyService } from './privacy-safety.service';

class WebDeletionRequestDto {
  @IsEmail()
  email!: string;
}

class WebDeletionConfirmDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/** Public (unauthenticated) web deletion endpoints for connectghin.com/delete-account. */
@Controller('account')
export class AccountDeletionPublicController {
  constructor(private readonly service: PrivacySafetyService) {}

  @Post('deletion-web-request')
  requestWebDeletion(@Body() dto: WebDeletionRequestDto): Promise<{ ok: true; message: string }> {
    return this.service.requestWebDeletion(dto.email);
  }

  @Post('deletion-web-confirm')
  confirmWebDeletion(@Body() dto: WebDeletionConfirmDto): Promise<unknown> {
    return this.service.confirmWebDeletion(dto.token, dto.reason);
  }
}
