import { Injectable } from '@nestjs/common';
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

  findById(id: string) {
    return this.clients.findOne({ where: { id } });
  }

  /** Idempotent: silently no-ops if the URL is the same as what's stored. */
  async updateAvatarUrl(id: string, url: string | null): Promise<void> {
    await this.clients.update(id, { avatarUrl: url });
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

  async ordersFor(clientId: string) {
    return this.orders.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }
}
