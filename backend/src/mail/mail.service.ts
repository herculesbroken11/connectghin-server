import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

type OutgoingMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Prefer Resend HTTPS API — many VPS hosts block outbound SMTP (465/587). */
  private resendApiKey(): string | null {
    const dedicated = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (dedicated) return dedicated;
    const smtpPass = this.config.get<string>('SMTP_PASS')?.trim();
    if (smtpPass?.startsWith('re_')) return smtpPass;
    return null;
  }

  private mailFrom(): string | null {
    return (
      this.config.get<string>('MAIL_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      null
    );
  }

  private useResendHttpApi(): boolean {
    const mode = this.config.get<string>('MAIL_TRANSPORT')?.trim().toLowerCase();
    if (mode === 'smtp') return false;
    if (mode === 'resend' || mode === 'resend_api') return true;
    // Default: Resend API when we have a re_ key (avoids blocked SMTP ports).
    return Boolean(this.resendApiKey());
  }

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
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 20_000,
    });
    return this.transporter;
  }

  private async sendViaResendApi(mail: OutgoingMail): Promise<boolean> {
    const apiKey = this.resendApiKey();
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY / SMTP_PASS (re_...) not set; cannot send via Resend API');
      return false;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Resend API failed status=${res.status} body=${body.slice(0, 500)}`);
      return false;
    }
    return true;
  }

  private async sendViaSmtp(mail: OutgoingMail): Promise<boolean> {
    const transport = this.getTransporter();
    if (!transport) {
      this.logger.warn('SMTP not configured; email not sent');
      return false;
    }
    await transport.sendMail(mail);
    return true;
  }

  private async sendMail(mail: OutgoingMail): Promise<boolean> {
    if (!mail.from) {
      this.logger.warn('MAIL_FROM not set; cannot send email');
      return false;
    }
    try {
      if (this.useResendHttpApi()) {
        return await this.sendViaResendApi(mail);
      }
      return await this.sendViaSmtp(mail);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Send email failed: ${msg}`);
      return false;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    resetUrl: string,
    options?: { signedInWithGoogle?: boolean },
  ): Promise<boolean> {
    const from = this.mailFrom();
    if (!from) {
      this.logger.warn('MAIL_FROM not set; cannot send email');
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
    return this.sendMail({ from, to, subject, text, html });
  }

  async sendMagicLoginEmail(to: string, magicUrl: string): Promise<boolean> {
    const from = this.mailFrom();
    if (!from) {
      this.logger.warn('MAIL_FROM not set; cannot send email');
      return false;
    }
    return this.sendMail({
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
  }
}
