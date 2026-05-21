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

  async upsert(params: {
    telegramId: string | number;
    firstName: string;
    phonePrimary: string;
    phoneSecondary?: string | null;
  }): Promise<Client> {
    const tg = String(params.telegramId);
    let client = await this.clients.findOne({ where: { telegramId: tg } });
    if (!client) {
      client = this.clients.create({
        telegramId: tg,
        firstName: params.firstName,
        phonePrimary: params.phonePrimary,
        phoneSecondary: params.phoneSecondary ?? null,
      });
    } else {
      client.firstName = params.firstName;
      client.phonePrimary = params.phonePrimary;
      if (params.phoneSecondary !== undefined) {
        client.phoneSecondary = params.phoneSecondary;
      }
    }
    return this.clients.save(client);
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
