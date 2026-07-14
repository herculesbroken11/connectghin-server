import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    if (!host || !user || !pass) {
      return null;
    }
    const portRaw = this.config.get<string | number>('SMTP_PORT') ?? 587;
    const port = typeof portRaw === 'string' ? Number(portRaw) : portRaw;
    const secure =
      this.config.get<string>('SMTP_SECURE') === 'true' || Number(port) === 465;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? Number(port) : 587,
      secure,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async sendPasswordResetEmail(
    to: string,
    resetUrl: string,
    options?: { signedInWithGoogle?: boolean },
  ): Promise<boolean> {
    const from = this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_USER');
    if (!from) {
      this.logger.warn('MAIL_FROM not set; cannot send email');
      return false;
    }
    const transport = this.getTransporter();
    if (!transport) {
      this.logger.warn('SMTP not configured; password reset email not sent');
      return false;
    }
    const signedInWithGoogle = options?.signedInWithGoogle === true;
    const subject = signedInWithGoogle
      ? 'Set a ConnectGHIN password (Google account)'
      : 'Reset your ConnectGHIN password';
    const text = signedInWithGoogle
      ? `You signed in to ConnectGHIN with Google.\n\n` +
        `You can keep using Continue with Google, or set a password for email login using this link (valid 30 minutes):\n\n` +
        `${resetUrl}\n\nIf you did not request this, ignore this email.`
      : `You requested a password reset. Open this link (valid 30 minutes):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const html = signedInWithGoogle
      ? `<p>You signed in to ConnectGHIN with <strong>Google</strong>.</p>` +
        `<p>You can keep using <strong>Continue with Google</strong>, or ` +
        `<a href="${resetUrl}">set a password</a> for email login (valid 30 minutes).</p>` +
        `<p>If you did not request this, ignore this email.</p>`
      : `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset password</a> (valid 30 minutes)</p>` +
        `<p>If you did not request this, ignore this email.</p>`;
    await transport.sendMail({ from, to, subject, text, html });
    return true;
  }

  async sendMagicLoginEmail(to: string, magicUrl: string): Promise<boolean> {
    const from = this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_USER');
    if (!from) {
      this.logger.warn('MAIL_FROM not set; cannot send email');
      return false;
    }
    const transport = this.getTransporter();
    if (!transport) {
      this.logger.warn('SMTP not configured; magic login email not sent');
      return false;
    }
    await transport.sendMail({
      from,
      to,
      subject: 'Your ConnectGHIN magic sign-in link',
      text:
        `Use this sign-in link (valid 15 minutes):\n\n${magicUrl}\n\n` +
        'If you did not request this, ignore this email.',
      html:
        `<p>Use this sign-in link (valid 15 minutes):</p><p><a href="${magicUrl}">Sign in to ConnectGHIN</a></p>` +
        '<p>If you did not request this, ignore this email.</p>',
    });
    return true;
  }
}
