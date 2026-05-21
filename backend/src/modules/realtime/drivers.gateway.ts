import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { OrderService } from '../order/order.service';
import { RealtimeService } from './realtime.service';
import { Driver } from '../driver/driver.entity';

interface AuthedSocket extends Socket {
  data: {
    driverId?: string;
  };
}

@WebSocketGateway({
  namespace: '/drivers',
  cors: { origin: true, credentials: true },
})
export class DriversGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DriversGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly orderService: OrderService,
    private readonly realtime: RealtimeService,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
  ) {}

  afterInit(server: Server) {
    this.realtime.setDriversNamespace(server);
    this.logger.log('Drivers namespace ready');
  }

  async handleConnection(socket: AuthedSocket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as
          | string
          | undefined);
      if (!token) throw new Error('Missing token');
      const payload = await this.auth.verifyJwt(token);
      if (payload.role !== 'driver') throw new Error('Wrong role');
      socket.data.driverId = payload.sub;
      socket.join(`driver:${payload.sub}`);
      this.logger.log(`Driver connected ${payload.sub}`);
    } catch (e) {
      this.logger.warn(`Rejected socket: ${(e as Error).message}`);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthedSocket) {
    const id = socket.data.driverId;
    if (!id) return;
    this.logger.log(`Driver disconnected ${id}`);
  }

  @SubscribeMessage('location_update')
  async onLocation(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { lat: number; lng: number },
  ) {
    const id = socket.data.driverId;
    if (!id) return;
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') return;
    await this.drivers.update(id, {
      currentLat: body.lat,
      currentLng: body.lng,
    });
  }

  @SubscribeMessage('accept_order')
  async onAccept(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { orderId: string },
  ) {
    const id = socket.data.driverId;
    if (!id || !body?.orderId) return { ok: false };
    try {
      const order = await this.orderService.accept(id, body.orderId);
      return { ok: true, order };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
