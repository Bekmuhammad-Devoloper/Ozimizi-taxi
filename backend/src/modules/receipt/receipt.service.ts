import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import * as QRCode from 'qrcode';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Order, OrderStatus } from '../order/order.entity';

/** What the client-facing receipt (PNG + web page) is built from. */
export interface ReceiptData {
  orderId: string;
  receiptNo: string;
  date: Date;
  driverName: string;
  car: string;
  plate: string;
  clientName: string;
  from: string;
  to: string;
  distanceKm: number;
  durationMin: number | null;
  waitingMinutes: number;
  waitingFee: number;
  fare: number; // price without waiting fee
  outsideKm: number;
  outsideFee: number;
  price: number; // total fare
  discount: number;
  bonusUsed: number;
  cashDue: number;
  url: string;
  imageUrl: string;
}

const W = 720;
const PAD = 44;

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);
  private fontsReady = false;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly config: ConfigService,
  ) {}

  private siteUrl(): string {
    return (this.config.get<string>('DRIVER_APP_URL') ?? 'https://moviytaxi.uz').replace(/\/+$/, '');
  }

  private ensureFonts() {
    if (this.fontsReady) return;
    const dir = join(process.cwd(), 'assets', 'fonts');
    for (const [file, weight] of [
      ['Inter-Regular.ttf', 'Inter'],
      ['Inter-SemiBold.ttf', 'Inter SemiBold'],
      ['Inter-Bold.ttf', 'Inter Bold'],
    ]) {
      const p = join(dir, file);
      if (existsSync(p)) GlobalFonts.registerFromPath(p, weight);
      else this.logger.warn(`Font missing: ${p}`);
    }
    this.fontsReady = true;
  }

  /** Collect the receipt fields for a completed order. */
  async dataFor(orderId: string): Promise<ReceiptData> {
    const o = await this.orders.findOne({
      where: { id: orderId },
      relations: { driver: true, client: true },
    });
    if (!o || o.status !== OrderStatus.COMPLETED) throw new NotFoundException('Chek topilmadi');
    const price = Number(o.price ?? 0);
    const waitingFee = Number(o.waitingFee ?? 0);
    const discount = Number(o.discount ?? 0);
    const bonusUsed = Number(o.bonusUsed ?? 0);
    const durationMin =
      o.acceptedAt && o.completedAt
        ? Math.max(1, Math.round((new Date(o.completedAt).getTime() - new Date(o.acceptedAt).getTime()) / 60_000))
        : null;
    const coord = (lat: number | null, lng: number | null) =>
      lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—';
    return {
      orderId: o.id,
      receiptNo: o.receiptNo ? String(o.receiptNo) : o.id.slice(0, 8).toUpperCase(),
      date: new Date(o.completedAt ?? o.createdAt),
      driverName: o.driver?.fullName ?? '—',
      car: [o.driver?.carModel, o.driver?.carColor].filter(Boolean).join(', ') || '—',
      plate: o.driver?.carPlate ?? '—',
      clientName: o.client?.firstName ?? 'Mijoz',
      from: o.pickupAddress || coord(o.pickupLat, o.pickupLng),
      to: o.destinationAddress || coord(o.destinationLat, o.destinationLng),
      distanceKm: Number(o.distanceKm ?? 0),
      durationMin,
      waitingMinutes: Number(o.waitingMinutes ?? 0),
      waitingFee,
      fare: Math.max(0, price - waitingFee),
      outsideKm: Number((o as any).outsideKm ?? 0),
      outsideFee: Number((o as any).outsideFee ?? 0),
      price,
      discount,
      bonusUsed,
      cashDue: Math.max(0, price - discount - bonusUsed),
      url: `${this.siteUrl()}/receipt/${o.id}`,
      imageUrl: `/uploads/receipts/${o.id}.png`,
    };
  }

  /** Render the receipt PNG, save it under uploads/receipts and return it. */
  async render(orderId: string): Promise<{ png: Buffer; data: ReceiptData }> {
    const data = await this.dataFor(orderId);
    this.ensureFonts();
    const money = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
    const date = formatDate(data.date);

    // Rows first so the canvas height fits the content.
    const rows: Array<[string, string] | 'line' | 'gap'> = [
      ['Chek raqami', `№ ${data.receiptNo}`],
      ['Sana', date],
      'line',
      ['Haydovchi', data.driverName],
      ['Mashina', data.car],
      ['Davlat raqami', data.plate],
      'line',
      ['Qayerdan', data.from],
      ['Qayerga', data.to],
      ['Masofa', `${data.distanceKm.toFixed(1)} km`],
    ];
    if (data.durationMin != null) rows.push(['Davomiylik', `${data.durationMin} daqiqa`]);
    rows.push('line', ['Yo‘l haqi', `${money(data.fare)} so‘m`]);
    if (data.outsideFee > 0) {
      rows.push([`Shu jumladan hududdan tashqari (${data.outsideKm.toFixed(1)} km)`, `${money(data.outsideFee)} so‘m`]);
    }
    if (data.waitingMinutes > 0 || data.waitingFee > 0) {
      rows.push([`Kutish (${data.waitingMinutes} daq)`, `${money(data.waitingFee)} so‘m`]);
    }
    if (data.discount > 0) rows.push(['Promo chegirma', `− ${money(data.discount)} so‘m`]);
    if (data.bonusUsed > 0) rows.push(['Bonusdan to‘landi', `− ${money(data.bonusUsed)} so‘m`]);

    const lineH = 46;
    const headerH = 230;
    const totalBlockH = 130;
    const qrSize = 190;
    const footerH = qrSize + 130;
    const bodyH = rows.reduce((h, r) => h + (r === 'line' ? 26 : r === 'gap' ? 14 : lineH), 0);
    const H = headerH + bodyH + totalBlockH + footerH;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Header band
    ctx.fillStyle = '#0f0f10';
    ctx.fillRect(0, 0, W, 150);
    try {
      const logoPath = join(process.cwd(), 'img', 'logo.jpg');
      if (existsSync(logoPath)) {
        const img = await loadImage(logoPath);
        roundImage(ctx, img, PAD, 35, 80, 80, 18);
      }
    } catch {
      /* no logo */
    }
    ctx.fillStyle = '#3b9bff';
    ctx.font = '34px "Inter Bold"';
    ctx.fillText('MOVIY TAXI', PAD + 100, 75);
    ctx.fillStyle = '#d4d4d8';
    ctx.font = '19px "Inter"';
    ctx.fillText('Yo‘lovchi tashish xizmati · elektron chek', PAD + 100, 108);

    ctx.fillStyle = '#0f0f10';
    ctx.font = '26px "Inter Bold"';
    ctx.textAlign = 'center';
    ctx.fillText('SAFAR CHEKI', W / 2, 200);
    ctx.textAlign = 'left';

    let y = headerH;
    for (const r of rows) {
      if (r === 'line') {
        dashed(ctx, PAD, y + 10, W - PAD);
        y += 26;
        continue;
      }
      if (r === 'gap') {
        y += 14;
        continue;
      }
      const [k, v] = r;
      ctx.fillStyle = '#71717a';
      ctx.font = '19px "Inter"';
      ctx.fillText(k, PAD, y + 28);
      ctx.fillStyle = '#0f0f10';
      ctx.font = '20px "Inter SemiBold"';
      ctx.textAlign = 'right';
      fitText(ctx, v, W - PAD, y + 28, W - 2 * PAD - 190);
      ctx.textAlign = 'left';
      y += lineH;
    }

    // Total block
    y += 10;
    ctx.fillStyle = '#fef9c3';
    roundRect(ctx, PAD, y, W - 2 * PAD, 104, 18);
    ctx.fill();
    ctx.fillStyle = '#713f12';
    ctx.font = '18px "Inter SemiBold"';
    ctx.fillText('JAMI', PAD + 24, y + 38);
    ctx.fillStyle = '#0f0f10';
    ctx.font = '40px "Inter Bold"';
    ctx.textAlign = 'right';
    ctx.fillText(`${money(data.price)} so‘m`, W - PAD - 24, y + 48);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#713f12';
    ctx.font = '18px "Inter"';
    ctx.fillText(
      data.cashDue < data.price ? `Naqd / karta bilan to‘lanadi: ${money(data.cashDue)} so‘m` : 'Naqd yoki karta bilan to‘lanadi',
      PAD + 24,
      y + 80,
    );
    y += totalBlockH;

    // QR + footer
    const qrPng = await QRCode.toBuffer(data.url, { width: qrSize, margin: 1, errorCorrectionLevel: 'M' });
    const qrImg = await loadImage(qrPng);
    ctx.drawImage(qrImg, (W - qrSize) / 2, y + 10, qrSize, qrSize);
    ctx.fillStyle = '#71717a';
    ctx.font = '16px "Inter"';
    ctx.textAlign = 'center';
    ctx.fillText('Chekni tekshirish: QR kodni skanerlang', W / 2, y + qrSize + 45);
    ctx.fillText(data.url.replace(/^https?:\/\//, ''), W / 2, y + qrSize + 70);
    ctx.fillStyle = '#0f0f10';
    ctx.font = '18px "Inter SemiBold"';
    ctx.fillText('Moviy Taxi’dan foydalanganingiz uchun rahmat!', W / 2, y + qrSize + 108);
    ctx.textAlign = 'left';

    const png = canvas.toBuffer('image/png');
    try {
      const dir = join(process.cwd(), 'uploads', 'receipts');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${data.orderId}.png`), png);
    } catch (e) {
      this.logger.warn(`Receipt save failed: ${(e as Error).message}`);
    }
    return { png, data };
  }
}

function formatDate(d: Date): string {
  const tz = new Date(d.getTime() + 5 * 3600 * 1000); // Asia/Tashkent (UTC+5)
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(tz.getUTCDate())}.${p(tz.getUTCMonth() + 1)}.${tz.getUTCFullYear()} ${p(tz.getUTCHours())}:${p(tz.getUTCMinutes())}`;
}

function dashed(ctx: SKRSContext2D, x1: number, y: number, x2: number) {
  ctx.save();
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundImage(ctx: SKRSContext2D, img: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

/** Right-aligned text that shrinks (then truncates) to fit `maxW`. */
function fitText(ctx: SKRSContext2D, text: string, x: number, y: number, maxW: number) {
  let t = text;
  if (ctx.measureText(t).width <= maxW) {
    ctx.fillText(t, x, y);
    return;
  }
  ctx.save();
  ctx.font = '17px "Inter SemiBold"';
  while (t.length > 3 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  ctx.fillText(t.length < text.length ? t.trimEnd() + '…' : t, x, y);
  ctx.restore();
}
