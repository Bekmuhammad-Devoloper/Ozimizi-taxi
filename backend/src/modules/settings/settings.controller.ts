import { Body, Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Public read-only settings — surfaced to the driver PWA and the Telegram
 * bot so they can render Instagram links, admin contact buttons, etc.
 * Admin-only mutation lives in AdminController to keep guard wiring simple.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }
}
