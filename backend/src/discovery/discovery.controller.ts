import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { DiscoveryQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuspendedUserGuard } from '../common/guards/suspended-user.guard';
import { DiscoveryService } from './discovery.service';

type AuthedRequest = Request & { user: { sub: string } };

@Controller('discovery')
@UseGuards(JwtAuthGuard, SuspendedUserGuard)
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('candidates')
  candidates(@Req() req: AuthedRequest, @Query() query: DiscoveryQueryDto): Promise<unknown> {
    return this.discoveryService.candidates(req.user.sub, query);
  }
}
