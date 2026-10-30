import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferralLinkInput, ReferralService } from './referral.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/referral-links')
export class ReferralController {
  private botUsername: string | null = null;

  constructor(
    private readonly referral: ReferralService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list() {
    return this.referral.list();
  }

  /** Client bot username, so the panel can show full t.me links. */
  @Get('bot')
  async bot() {
    if (!this.botUsername) {
      const token = this.config.get<string>('BOT_TOKEN');
      if (token) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
          const body = (await res.json()) as { result?: { username?: string } };
          this.botUsername = body.result?.username ?? null;
        } catch {
          /* offline — panel falls back to showing the bare code */
        }
      }
    }
    return { username: this.botUsername };
  }

  @Post()
  create(@Body() body: ReferralLinkInput) {
    return this.referral.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: ReferralLinkInput) {
    return this.referral.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.referral.remove(id);
  }

  @Get(':id/signups')
  signups(@Param('id') id: string) {
    return this.referral.signupsFor(id);
  }

  /** Mark every unpaid reward of this link as paid out in cash. */
  @Post(':id/pay-all')
  payAll(@Param('id') id: string) {
    return this.referral.markAllPaid(id);
  }

  @Post('signups/:signupId/pay')
  pay(@Param('signupId') signupId: string) {
    return this.referral.markPaid([signupId]);
  }

  @Post('signups/:signupId/unpay')
  unpay(@Param('signupId') signupId: string) {
    return this.referral.unmarkPaid(signupId);
  }
}
