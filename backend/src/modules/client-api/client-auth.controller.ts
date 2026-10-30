import { Body, Controller, Post } from '@nestjs/common';
import { ClientAuthService } from './client-auth.service';

/** Public: phone → one-time code via the Telegram bot → JWT. */
@Controller('client/auth')
export class ClientAuthController {
  constructor(private readonly auth: ClientAuthService) {}

  @Post('request-code')
  requestCode(@Body() body: { phone: string }) {
    return this.auth.requestCode(body?.phone ?? '');
  }

  /** Opened inside Telegram (bot Mini App button) — no SMS/code needed. */
  @Post('telegram-webapp')
  telegramWebApp(@Body() body: { initData: string }) {
    return this.auth.telegramWebApp(body?.initData ?? '');
  }

  @Post('verify')
  verify(@Body() body: { phone: string; code: string }) {
    return this.auth.verify(body?.phone ?? '', body?.code ?? '');
  }
}
