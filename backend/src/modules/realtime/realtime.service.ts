import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Shared singleton holding references to gateway servers, so services
 * outside of the gateway classes can emit without circular imports.
 */
@Injectable()
export class RealtimeService {
  private driversNs: Server | null = null;
  private adminNs: Server | null = null;

  setDriversNamespace(server: Server) {
    this.driversNs = server;
  }
  setAdminNamespace(server: Server) {
    this.adminNs = server;
  }

  emitToDriver(driverId: string, event: string, payload: unknown) {
    this.driversNs?.to(`driver:${driverId}`).emit(event, payload);
  }

  emitToAllDrivers(event: string, payload: unknown) {
    this.driversNs?.emit(event, payload);
  }

  emitToAdmin(event: string, payload: unknown) {
    this.adminNs?.emit(event, payload);
  }

  // Driver Telegram callbacks need to go to clients, but the client side
  // lives in the Telegram bot — handled by bot service directly, not here.
}
