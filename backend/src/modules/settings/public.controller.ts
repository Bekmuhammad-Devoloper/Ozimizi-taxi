import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { SettingsService } from './settings.service';
import { DEFAULT_DRIVER_CONTRACT } from './driver-contract.default';
import { Order, OrderStatus } from '../order/order.entity';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';

/** Unauthenticated reads needed before login (register page, landing, bot). */
@Controller('public')
export class PublicSettingsController {
  private statsCache: { at: number; data: any } | null = null;

  constructor(
    private readonly settings: SettingsService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
  ) {}

  /**
   * QR image for any short text/URL (invite links, referral links, bot link).
   * /public/qr.png?text=https://t.me/...&size=360
   */
  @Get('qr.png')
  async qr(@Query('text') text: string, @Query('size') size: string, @Res() res: Response) {
    const t = (text ?? '').trim();
    if (!t || t.length > 512) throw new BadRequestException('text 1–512 belgi');
    const px = Math.min(1024, Math.max(96, Number(size) || 360));
    const png = await QRCode.toBuffer(t, { width: px, margin: 2, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  }

  @Get('driver-contract')
  async driverContract() {
    const custom = (await this.settings.get('driver_contract_text')).trim();
    return { text: custom || DEFAULT_DRIVER_CONTRACT, custom: !!custom };
  }

  /** Landing page numbers + contact links. Cached for a minute. */
  @Get('stats')
  async stats() {
    if (this.statsCache && Date.now() - this.statsCache.at < 60_000) return this.statsCache.data;
    const [rides, drivers, clients, all] = await Promise.all([
      this.orders.count({ where: { status: OrderStatus.COMPLETED } }),
      this.drivers.count({ where: { isActive: true, isApproved: true } }),
      this.clients.count(),
      this.settings.getAll(),
    ]);
    const data = {
      rides,
      drivers,
      clients,
      adminContactUrl: all.admin_contact_url || null,
      instagram: [all.instagram_url_1, all.instagram_url_2, all.instagram_url_3].map((u) => (u || '').trim()).filter(Boolean),
    };
    this.statsCache = { at: Date.now(), data };
    return data;
  }
}
