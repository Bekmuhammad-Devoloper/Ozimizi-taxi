import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderMessage } from './order-message.entity';
import { ChatEvents } from './chat.events';
import { Order, OrderStatus } from '../order/order.entity';
import { Driver } from '../driver/driver.entity';
import { RealtimeService } from '../realtime/realtime.service';

const ACTIVE = [
  OrderStatus.ACCEPTED,
  OrderStatus.ON_THE_WAY,
  OrderStatus.ARRIVED,
  OrderStatus.IN_PROGRESS,
];

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(OrderMessage)
    private readonly messages: Repository<OrderMessage>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    private readonly realtime: RealtimeService,
    private readonly events: ChatEvents,
  ) {}

  async listForDriver(driverId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.driverId !== driverId) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    return this.messages.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }

  async listForClient(clientId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.clientId !== clientId) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    return this.messages.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }

  /** Client app → driver (same path as the bot, but for a given order). */
  async sendFromClientToOrder(clientId: string, orderId: string, rawText: string) {
    const text = (rawText ?? '').trim().slice(0, 500);
    if (!text) throw new BadRequestException('Xabar bo‘sh');
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.clientId !== clientId) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    if (!ACTIVE.includes(order.status) || !order.driverId) {
      throw new BadRequestException('Bu buyurtma bo‘yicha chat yopilgan');
    }
    const message = await this.messages.save(
      this.messages.create({ orderId: order.id, sender: 'client', text }),
    );
    this.realtime.emitToDriver(order.driverId, 'order_message', {
      id: message.id,
      orderId: order.id,
      sender: 'client',
      text,
      createdAt: message.createdAt,
    });
    return message;
  }

  /** Driver app → passenger (delivered via the Telegram bot). */
  async sendFromDriver(driverId: string, orderId: string, rawText: string) {
    const text = (rawText ?? '').trim().slice(0, 500);
    if (!text) throw new BadRequestException('Xabar bo‘sh');
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.driverId !== driverId) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    if (!ACTIVE.includes(order.status)) {
      throw new BadRequestException('Bu buyurtma bo‘yicha chat yopilgan');
    }
    const message = await this.messages.save(
      this.messages.create({ orderId, sender: 'driver', text }),
    );
    const driver = await this.drivers.findOne({ where: { id: driverId } });
    this.events.emitDriverMessage({
      order,
      message,
      driverName: driver?.fullName ?? 'Haydovchi',
    });
    return message;
  }

  /**
   * Passenger typed in the bot while they have an active order: store it and
   * push to the driver's app. Returns null when there is no active order, so
   * the bot can treat the text as something else.
   */
  async sendFromClient(clientId: string, rawText: string) {
    const text = (rawText ?? '').trim().slice(0, 500);
    if (!text) return null;
    const order = await this.orders.findOne({
      where: { clientId, status: In(ACTIVE) },
      order: { createdAt: 'DESC' },
    });
    if (!order || !order.driverId) return null;
    const message = await this.messages.save(
      this.messages.create({ orderId: order.id, sender: 'client', text }),
    );
    this.realtime.emitToDriver(order.driverId, 'order_message', {
      id: message.id,
      orderId: order.id,
      sender: 'client',
      text,
      createdAt: message.createdAt,
    });
    return { order, message };
  }
}
