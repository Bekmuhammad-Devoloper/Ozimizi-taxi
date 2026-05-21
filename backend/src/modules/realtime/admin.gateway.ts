import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({
  namespace: '/admin',
  cors: { origin: true, credentials: true },
})
export class AdminGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(AdminGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setAdminNamespace(server);
    this.logger.log('Admin namespace ready');
  }

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as
          | string
          | undefined);
      if (!token) throw new Error('Missing token');
      const payload = await this.auth.verifyJwt(token);
      if (payload.role !== 'admin') throw new Error('Wrong role');
    } catch (e) {
      this.logger.warn(`Admin socket rejected: ${(e as Error).message}`);
      socket.disconnect(true);
    }
  }
}
