import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './client.entity';
import { Order, OrderStatus } from '../order/order.entity';

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  findByTelegramId(telegramId: string | number) {
    return this.clients.findOne({ where: { telegramId: String(telegramId) } });
  }

  findById(id: string | null) {
    if (!id) return Promise.resolve(null);
    return this.clients.findOne({ where: { id } });
  }

  async upsert(params: {
    telegramId: string | number;
    firstName: string;
    phonePrimary: string;
    phoneSecondary?: string | null;
    refCodeUsed?: string | null;
  }): Promise<{ client: Client; isNew: boolean; referrer: Client | null }> {
    const tg = String(params.telegramId);
    let client = await this.clients.findOne({ where: { telegramId: tg } });
    const isNew = !client;
    let referrer: Client | null = null;
    if (!client) {
      // Try to resolve a referral, but only on the very first registration
      // and never to themselves (telegramId mismatch suffices).
      if (params.refCodeUsed) {
        referrer = await this.clients.findOne({
          where: { refCode: params.refCodeUsed },
        });
      }
      client = this.clients.create({
        telegramId: tg,
        firstName: params.firstName,
        phonePrimary: params.phonePrimary,
        phoneSecondary: params.phoneSecondary ?? null,
        refCode: await this.generateUniqueRefCode(),
        referredById: referrer?.id ?? null,
      });
    } else {
      client.firstName = params.firstName;
      client.phonePrimary = params.phonePrimary;
      if (params.phoneSecondary !== undefined) {
        client.phoneSecondary = params.phoneSecondary;
      }
      if (!client.refCode) {
        client.refCode = await this.generateUniqueRefCode();
      }
    }
    const saved = await this.clients.save(client);
    return { client: saved, isNew, referrer };
  }

  private async generateUniqueRefCode(): Promise<string> {
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += ALPHA[Math.floor(Math.random() * ALPHA.length)];
      }
      const existing = await this.clients.findOne({ where: { refCode: code } });
      if (!existing) return code;
    }
    // Astronomically unlikely; fall back to timestamp suffix.
    return 'R' + Date.now().toString(36).toUpperCase();
  }

  /** Telegram chat ids of every client — for admin broadcasts. */
  async allTelegramIds(): Promise<string[]> {
    const rows = await this.clients.find({ select: { telegramId: true } });
    return rows.map((r) => r.telegramId);
  }

  async listForAdmin() {
    const rows = await this.clients
      .createQueryBuilder('c')
      .leftJoin('orders', 'o', 'o.client_id = c.id')
      .select('c.*')
      .addSelect('COUNT(o.id)', 'orders_count')
      .addSelect('MAX(o.created_at)', 'last_order_at')
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.status = '${OrderStatus.COMPLETED}' THEN o.price ELSE 0 END), 0)`,
        'total_spent',
      )
      .groupBy('c.id')
      .orderBy('orders_count', 'DESC')
      .getRawMany();
    return rows;
  }

  async setBlocked(id: string, blocked: boolean, reason?: string | null) {
    const c = await this.clients.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Klient topilmadi');
    c.isBlocked = blocked;
    c.blockedReason = blocked ? (reason?.trim() || null) : null;
    return this.clients.save(c);
  }

  async ordersFor(clientId: string) {
    return this.orders.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Everything the admin may want to know about one client. */
  async detailForAdmin(id: string) {
    const client = await this.clients.findOne({
      where: { id },
      relations: { referredBy: true },
    });
    if (!client) throw new NotFoundException('Klient topilmadi');
    const orders = await this.orders.find({
      where: { clientId: id },
      relations: { driver: true },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const invited = await this.clients.find({
      where: { referredById: id },
      order: { createdAt: 'DESC' },
      select: { id: true, firstName: true, phonePrimary: true, createdAt: true },
    });
    let completed = 0;
    let cancelled = 0;
    let spent = 0;
    let bonusUsed = 0;
    for (const o of orders) {
      if (o.status === OrderStatus.COMPLETED) {
        completed++;
        spent += Number(o.price ?? 0);
        bonusUsed += Number(o.bonusUsed ?? 0);
      } else if (o.status === OrderStatus.CANCELLED) {
        cancelled++;
      }
    }
    return {
      client: {
        ...client,
        referredBy: client.referredBy
          ? { id: client.referredBy.id, firstName: client.referredBy.firstName, phonePrimary: client.referredBy.phonePrimary }
          : null,
      },
      stats: { total: orders.length, completed, cancelled, spent, bonusUsed },
      invited,
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        completedAt: (o as any).completedAt ?? null,
        status: o.status,
        price: o.price,
        bonusUsed: o.bonusUsed,
        distanceKm: o.distanceKm,
        waitingSeconds: (o as any).waitingSeconds ?? 0,
        cancelPenalty: (o as any).cancelPenalty ?? null,
        pickupLat: o.pickupLat,
        pickupLng: o.pickupLng,
        pickupAddress: o.pickupAddress,
        destinationLat: (o as any).destinationLat ?? null,
        destinationLng: (o as any).destinationLng ?? null,
        destinationAddress: (o as any).destinationAddress ?? null,
        receiptNo: (o as any).receiptNo ?? null,
        driver: o.driver
          ? { id: o.driver.id, fullName: o.driver.fullName, phone: o.driver.phone, carModel: o.driver.carModel, carPlate: o.driver.carPlate }
          : null,
      })),
    };
  }

  async setAvatar(clientId: string, url: string | null) {
    await this.clients.update(clientId, {
      avatarUrl: url,
      avatarFetchedAt: new Date(),
    });
  }

  findByPhone(phone: string) {
    return this.clients.findOne({ where: { phonePrimary: phone } });
  }

  findByWalletTelegramId(chatId: number | string) {
    return this.clients.findOne({
      where: { walletTelegramId: String(chatId) as any },
    });
  }

  async setWalletTelegramId(clientId: string, chatId: number | string) {
    // Unlink any other client that previously had this chat (cascade-like
    // ownership transfer when a Telegram user switches accounts).
    await this.clients
      .createQueryBuilder()
      .update()
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    await this.clients.update(clientId, {
      walletTelegramId: String(chatId) as any,
    });
  }

  /**
   * Avatar TTL: re-download when older than 7 days. Returns true if a
   * fresh fetch should be attempted.
   */
  shouldRefreshAvatar(client: { avatarUrl: string | null; avatarFetchedAt: Date | null }): boolean {
    if (!client.avatarUrl) return true;
    if (!client.avatarFetchedAt) return true;
    const ageMs = Date.now() - new Date(client.avatarFetchedAt).getTime();
    return ageMs > 7 * 24 * 60 * 60 * 1000;
  }
}
