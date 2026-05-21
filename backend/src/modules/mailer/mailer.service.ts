import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private from = 'Tezkor Taxi <no-reply@tezkor.local>';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM');
    if (from) this.from = from;

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP not configured (SMTP_HOST/USER/PASS missing) — emails will be logged to console only',
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.logger.log(`SMTP ready: ${host}:${port}`);
  }

  async send(args: SendArgs): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MAIL FALLBACK] to=${args.to} subject="${args.subject}"\n${args.text}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      });
      this.logger.log(`Email sent to ${args.to}`);
    } catch (e) {
      this.logger.error(`Email send failed to ${args.to}: ${(e as Error).message}`);
      // Don't throw — never block business flow on email transport issues.
    }
  }
}
