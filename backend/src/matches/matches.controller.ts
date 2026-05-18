import { Controller, Delete, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { MatchesService } from './matches.service';

type AuthedRequest = Request & { user: { sub: string } };

@Controller('matches')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  list(@Req() req: AuthedRequest): Promise<unknown> {
    return this.matchesService.list(req.user.sub);
  }

  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id') id: string): Promise<unknown> {
    return this.matchesService.detail(req.user.sub, id);
  }

  @Delete(':id')
  unmatch(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    return this.matchesService.unmatch(req.user.sub, id);
  }
}
