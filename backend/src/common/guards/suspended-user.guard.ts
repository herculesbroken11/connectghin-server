import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserLifecycleStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SuspendedUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const userId = request.user?.sub;
    if (!userId) {
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuspended: true, lifecycleStatus: true },
    });
    if (!user || user.isSuspended || user.lifecycleStatus !== UserLifecycleStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
    return true;
  }
}
