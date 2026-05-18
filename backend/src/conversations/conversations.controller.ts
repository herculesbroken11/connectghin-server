import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { ConversationsService } from './conversations.service';

class StartConversationDto {
  @IsString()
  otherUserId!: string;
}

class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

type AuthedRequest = Request & { user: { sub: string } };

@Controller('conversations')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@Req() req: AuthedRequest): Promise<unknown> {
    return this.conversationsService.list(req.user.sub);
  }

  @Get(':id/messages')
  messages(@Req() req: AuthedRequest, @Param('id') id: string): Promise<unknown> {
    return this.conversationsService.messages(req.user.sub, id);
  }

  @Post('start')
  start(@Req() req: AuthedRequest, @Body() dto: StartConversationDto): Promise<unknown> {
    return this.conversationsService.startConversation(req.user.sub, dto.otherUserId);
  }

  @Post(':id/messages')
  send(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.conversationsService.sendMessage(req.user.sub, id, dto.body);
  }

  @Patch(':id/read')
  read(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.conversationsService.markRead(req.user.sub, id);
  }
}
