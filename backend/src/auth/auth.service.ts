import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, UserLifecycleStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppleLoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  MagicLinkConsumeDto,
  MagicLinkRequestDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';

type TokenPair = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private readonly appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { id: true },
    });
    if (exists) {
      throw new BadRequestException('Email or username already in use');
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username,
        passwordHash: await argon2.hash(dto.password),
        authProvider: AuthProvider.EMAIL,
      },
    });
    await this.prisma.profile.create({
      data: {
        userId: user.id,
        displayName: dto.username,
        profileCompletionPercent: 10,
      },
    });
    await this.prisma.privacySettings.create({ data: { userId: user.id } });
    await this.prisma.userSettings.create({ data: { userId: user.id } });
    return this.issueTokens(user.id, UserRole.USER, user.refreshTokenVersion);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (
      user.isSuspended ||
      !user.isActive ||
      user.lifecycleStatus === UserLifecycleStatus.DELETED
    ) {
      throw new UnauthorizedException('Account unavailable');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), authProvider: AuthProvider.EMAIL },
    });
    return this.issueTokens(user.id, user.role, user.refreshTokenVersion);
  }

  async googleLogin(dto: GoogleLoginDto): Promise<TokenPair> {
    const rawToken = dto.idToken?.trim();
    if (!rawToken) {
      throw new BadRequestException('Google idToken is required');
    }
    const audience = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID')?.trim();
    if (!audience) {
      throw new ServiceUnavailableException('Google sign-in is not available right now. Please use email login.');
    }
    const ticket = await this.verifyGoogleIdToken(rawToken, audience);
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Google sign-in did not return an email address.');
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const localPart = email.split('@')[0] || 'golfer';
      const base = sanitizeUsername(localPart);
      const username = await this.buildAvailableUsername(base);
      user = await this.prisma.user.create({
        data: {
          email,
          username,
          passwordHash: await argon2.hash(randomBytes(24).toString('hex')),
          isEmailVerified: Boolean(payload?.email_verified),
          authProvider: AuthProvider.GOOGLE,
        },
      });
      await this.prisma.profile.create({
        data: {
          userId: user.id,
          displayName: (payload?.name?.trim() || username).slice(0, 80),
          profileCompletionPercent: 10,
        },
      });
      await this.prisma.privacySettings.create({ data: { userId: user.id } });
      await this.prisma.userSettings.create({ data: { userId: user.id } });
    }

    if (user.isSuspended || !user.isActive || user.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new UnauthorizedException('Account unavailable');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        authProvider: AuthProvider.GOOGLE,
        isEmailVerified: user.isEmailVerified || Boolean(payload?.email_verified),
      },
    });
    return this.issueTokens(user.id, user.role, user.refreshTokenVersion);
  }

  async appleLogin(dto: AppleLoginDto): Promise<TokenPair> {
    const rawToken = dto.idToken?.trim();
    if (!rawToken) {
      throw new BadRequestException('Apple idToken is required');
    }
    const audienceRaw =
      this.config.get<string>('APPLE_OAUTH_AUDIENCE') ??
      this.config.get<string>('APPLE_IAP_BUNDLE_ID') ??
      '';
    const audiences = audienceRaw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (!audiences.length) {
      throw new ServiceUnavailableException('Apple sign-in is not available right now. Please use email login.');
    }

    let claimsEmail: string | null = null;
    let verifiedEmail = false;
    let matchedAudience = false;
    for (const aud of audiences) {
      try {
        const { payload } = await jwtVerify(rawToken, this.appleJwks, {
          issuer: 'https://appleid.apple.com',
          audience: aud,
        });
        matchedAudience = true;
        claimsEmail = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
        verifiedEmail = payload.email_verified === true || payload.email_verified === 'true';
        break;
      } catch {
        // Try next configured audience.
      }
    }
    if (!matchedAudience) {
      throw new UnauthorizedException('Apple sign-in failed. Please try again.');
    }

    const fallbackEmail = dto.email?.trim().toLowerCase() || null;
    const email = claimsEmail || fallbackEmail;
    if (!email) {
      throw new UnauthorizedException('Apple sign-in did not return an email address.');
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const localPart = email.split('@')[0] || 'golfer';
      const base = sanitizeUsername(localPart);
      const username = await this.buildAvailableUsername(base);
      user = await this.prisma.user.create({
        data: {
          email,
          username,
          passwordHash: await argon2.hash(randomBytes(24).toString('hex')),
          isEmailVerified: verifiedEmail,
          authProvider: AuthProvider.APPLE,
        },
      });
      await this.prisma.profile.create({
        data: {
          userId: user.id,
          displayName: username,
          profileCompletionPercent: 10,
        },
      });
      await this.prisma.privacySettings.create({ data: { userId: user.id } });
      await this.prisma.userSettings.create({ data: { userId: user.id } });
    }

    if (user.isSuspended || !user.isActive || user.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new UnauthorizedException('Account unavailable');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        authProvider: AuthProvider.APPLE,
        isEmailVerified: user.isEmailVerified || verifiedEmail,
      },
    });
    return this.issueTokens(user.id, user.role, user.refreshTokenVersion);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.jwtService.verifyAsync<{ sub: string; role: UserRole; refreshTokenVersion: number }>(
      refreshToken,
      { secret: process.env.JWT_REFRESH_SECRET },
    );
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.refreshTokenVersion !== payload.refreshTokenVersion) {
      throw new UnauthorizedException('Refresh token invalidated');
    }
    if (
      user.isSuspended ||
      !user.isActive ||
      user.lifecycleStatus === UserLifecycleStatus.DELETED
    ) {
      throw new UnauthorizedException('Account unavailable');
    }
    return this.issueTokens(user.id, user.role, user.refreshTokenVersion);
  }

  async logout(userId: string): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true; resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, isActive: true, isSuspended: true },
    });
    if (!user || !user.isActive || user.isSuspended) {
      return { ok: true };
    }
    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    await this.prisma.forgotPasswordToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });
    const baseUrl =
      this.config.get<string>('APP_WEB_URL') ??
      this.config.get<string>('APP_PUBLIC_URL') ??
      'http://localhost:5173';
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const sent = await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
    const exposeDevToken = this.config.get<string>('EMAIL_DEV_EXPOSE_RESET_TOKEN') === 'true';
    if (!sent && exposeDevToken) {
      return { ok: true, resetToken };
    }
    return { ok: true };
  }

  async requestMagicLink(dto: MagicLinkRequestDto): Promise<{ ok: true; magicToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, isActive: true, isSuspended: true },
    });
    if (!user || !user.isActive || user.isSuspended) {
      return { ok: true };
    }
    const magicToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(magicToken).digest('hex');
    await this.prisma.forgotPasswordToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      },
    });

    const baseUrl =
      this.config.get<string>('APP_MOBILE_URL') ??
      this.config.get<string>('APP_WEB_URL') ??
      this.config.get<string>('APP_PUBLIC_URL') ??
      'http://localhost:5173';
    const magicUrl = `${baseUrl.replace(/\/$/, '')}/login?magicToken=${encodeURIComponent(magicToken)}`;
    const sent = await this.mailService.sendMagicLoginEmail(user.email, magicUrl);
    const exposeDevToken = this.config.get<string>('EMAIL_DEV_EXPOSE_RESET_TOKEN') === 'true';
    if (!sent && exposeDevToken) {
      return { ok: true, magicToken };
    }
    return { ok: true };
  }

  async consumeMagicLink(dto: MagicLinkConsumeDto): Promise<TokenPair> {
    if (!dto.token?.trim()) {
      throw new BadRequestException('Token required');
    }
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.forgotPasswordToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Magic link invalid or expired');
    }
    const user = record.user;
    if (!user || user.isSuspended || !user.isActive || user.lifecycleStatus === UserLifecycleStatus.DELETED) {
      throw new UnauthorizedException('Account unavailable');
    }

    await this.prisma.$transaction([
      this.prisma.forgotPasswordToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);
    return this.issueTokens(user.id, user.role, user.refreshTokenVersion);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    if (!dto.token) {
      throw new BadRequestException('Token required');
    }
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.forgotPasswordToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Reset token invalid or expired');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await argon2.hash(dto.newPassword),
          refreshTokenVersion: { increment: 1 },
        },
      }),
      this.prisma.forgotPasswordToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const validOldPassword = await argon2.verify(user.passwordHash, dto.oldPassword);
    if (!validOldPassword) {
      throw new UnauthorizedException('Current password is wrong');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(dto.newPassword),
        refreshTokenVersion: { increment: 1 },
      },
    });
    return { ok: true };
  }

  async me(userId: string): Promise<unknown> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        membershipType: true,
        membershipStatus: true,
        isSuspended: true,
        lifecycleStatus: true,
        authProvider: true,
      },
    });
  }

  private async issueTokens(
    userId: string,
    role: UserRole,
    refreshTokenVersion: number,
  ): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, role, refreshTokenVersion },
      { expiresIn: '15m', secret: process.env.JWT_ACCESS_SECRET },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, role, refreshTokenVersion },
      { expiresIn: '30d', secret: process.env.JWT_REFRESH_SECRET },
    );
    return { accessToken, refreshToken };
  }

  private async buildAvailableUsername(baseInput: string): Promise<string> {
    const base = sanitizeUsername(baseInput);
    let candidate = base;
    let i = 1;
    while (true) {
      const existing = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      i += 1;
      candidate = `${base}${i}`;
    }
  }

  private async verifyGoogleIdToken(rawToken: string, audience: string) {
    try {
      return await this.googleClient.verifyIdToken({
        idToken: rawToken,
        audience,
      });
    } catch {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
  }
}

function sanitizeUsername(input: string): string {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (cleaned.length >= 3) return cleaned.slice(0, 24);
  return `golfer${cleaned}`.slice(0, 24).padEnd(3, '1');
}
