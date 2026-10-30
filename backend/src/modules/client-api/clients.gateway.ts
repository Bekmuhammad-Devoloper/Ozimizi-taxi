import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Client } from '../client/client.entity';
import { Driver } from '../driver/driver.entity';
import { OrderEvents, OrderEventName } from '../order/order.events';
import { ChatEvents } from '../chat/chat.events';
import { BonusEvents } from '../bonus/bonus.events';
import { orderForClient } from './client-api.controller';

interface ClientSocket extends Socket {
  data: { clientId?: string };
}

const EVENTS: OrderEventName[] = [
  'order.accepted',
  'order.on_the_way',
  'order.arrived',
  'order.in_progress',
  'order.completed',
  'order.cancelled',
  'order.requeued',
];

/**
 * Socket namespace for the client app: order status changes, driver chat
 * messages, bonus decisions and the driver's live position.
 */
@WebSocketGateway({ namespace: '/clients', cors: { origin: true, credentials: true } })
export class ClientsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ClientsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeService,
    private readonly orderEvents: OrderEvents,
    private readonly chatEvents: ChatEvents,
    private readonly bonusEvents: BonusEvents,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
  ) {}

  afterInit(server: Server) {
    this.realtime.setClientsNamespace(server);
    for (const name of EVENTS) {
      this.orderEvents.on(name, ({ order }) => {
        void (async () => {
          const driver = order.driverId ? await this.drivers.findOne({ where: { id: order.driverId } }) : null;
          this.realtime.emitToClient(order.clientId, 'order_update', {
            event: name,
            order: orderForClient(order, driver),
          });
        })().catch((e) => this.logger.warn(`order_update failed: ${(e as Error).message}`));
      });
    }
    this.chatEvents.onDriverMessage(({ order, message, driverName }) => {
      this.realtime.emitToClient(order.clientId, 'order_message', {
        id: message.id,
        orderId: order.id,
        sender: 'driver',
        text: message.text,
        driverName,
        createdAt: message.createdAt,
      });
    });
    this.bonusEvents.onDecided(({ payment, order, approved }) => {
      this.realtime.emitToClient(order.clientId, 'bonus_decided', {
        orderId: order.id,
        amount: Number(payment.amount),
        approved,
        bonusUsed: Number(order.bonusUsed ?? 0),
        price: Number(order.price ?? 0),
        discount: Number(order.discount ?? 0),
      });
    });
    this.logger.log('Clients namespace ready');
  }

  async handleConnection(socket: ClientSocket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as string | undefined);
      if (!token) throw new Error('Missing token');
      const payload = await this.auth.verifyJwt(token);
      if (payload.role !== 'client') throw new Error('Wrong role');
      const c = await this.clients.findOne({ where: { id: payload.sub }, select: { id: true, isBlocked: true } });
      if (!c || c.isBlocked) throw new Error('Client blocked');
      socket.data.clientId = payload.sub;
      socket.join(`client:${payload.sub}`);
    } catch (e) {
      this.logger.warn(`Rejected client socket: ${(e as Error).message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect() {
    /* nothing to clean up */
  }
}
