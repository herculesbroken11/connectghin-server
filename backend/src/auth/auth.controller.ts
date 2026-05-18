import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AppleLoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  MagicLinkConsumeDto,
  MagicLinkRequestDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthService } from './auth.service';

type AuthedRequest = Request & { user: { sub: string } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<unknown> {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<unknown> {
    return this.authService.login(dto);
  }

  @Post('google')
  googleLogin(@Body() dto: GoogleLoginDto): Promise<unknown> {
    return this.authService.googleLogin(dto);
  }

  @Post('apple')
  appleLogin(@Body() dto: AppleLoginDto): Promise<unknown> {
    return this.authService.appleLogin(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<unknown> {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: AuthedRequest): Promise<{ ok: true }> {
    return this.authService.logout(req.user.sub);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<unknown> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    return this.authService.resetPassword(dto);
  }

  @Post('magic-link/request')
  requestMagicLink(@Body() dto: MagicLinkRequestDto): Promise<{ ok: true; magicToken?: string }> {
    return this.authService.requestMagicLink(dto);
  }

  @Post('magic-link/consume')
  consumeMagicLink(@Body() dto: MagicLinkConsumeDto): Promise<unknown> {
    return this.authService.consumeMagicLink(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @Req() req: AuthedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    return this.authService.changePassword(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthedRequest): Promise<unknown> {
    return this.authService.me(req.user.sub);
  }
}
