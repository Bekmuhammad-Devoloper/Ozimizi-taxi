import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

interface InboxEvent {
  id: number;
  at: number;
  event: string;
  payload: unknown;
}

interface Inbox {
  seq: number;
  events: InboxEvent[];
  waiters: Set<() => void>;
  lastPoll: number;
}

/** Driver events the background service on the phone must also receive. */
const INBOX_EVENTS = new Set([
  'new_order',
  'order_offer_expired',
  'order_taken',
  'order_cancelled',
  'bonus_request',
  'order_message',
  'announcement',
]);
const INBOX_TTL_MS = 3 * 60_000;
const INBOX_MAX = 40;

/**
 * Shared singleton holding references to gateway servers, so services
 * outside of the gateway classes can emit without circular imports.
 *
 * Driver events are ALSO queued in a small per-driver inbox: the Android
 * background service long-polls it (GET /driver/inbox), so an online driver
 * gets the order alarm even when the app itself is closed and its socket is
 * gone.
 */
@Injectable()
export class RealtimeService {
  private driversNs: Server | null = null;
  private adminNs: Server | null = null;
  private clientsNs: Server | null = null;
  private readonly inboxes = new Map<string, Inbox>();

  setDriversNamespace(server: Server) {
    this.driversNs = server;
  }
  setAdminNamespace(server: Server) {
    this.adminNs = server;
  }
  setClientsNamespace(server: Server) {
    this.clientsNs = server;
  }

  /** Client (passenger) app sockets — see ClientsGateway. */
  emitToClient(clientId: string | null, event: string, payload: unknown) {
    if (!clientId) return;
    this.clientsNs?.to(`client:${clientId}`).emit(event, payload);
  }

  emitToDriver(driverId: string, event: string, payload: unknown) {
    this.driversNs?.to(`driver:${driverId}`).emit(event, payload);
    if (INBOX_EVENTS.has(event)) this.pushInbox(driverId, event, payload);
  }

  emitToAllDrivers(event: string, payload: unknown) {
    this.driversNs?.emit(event, payload);
    if (!INBOX_EVENTS.has(event)) return;
    const now = Date.now();
    for (const [driverId, box] of this.inboxes) {
      if (now - box.lastPoll < INBOX_TTL_MS) this.pushInbox(driverId, event, payload);
    }
  }

  emitToAdmin(event: string, payload: unknown) {
    this.adminNs?.emit(event, payload);
  }

  // --- driver inbox (long-poll for the phone's background service) ---------

  private box(driverId: string): Inbox {
    let b = this.inboxes.get(driverId);
    if (!b) {
      b = { seq: 0, events: [], waiters: new Set(), lastPoll: 0 };
      this.inboxes.set(driverId, b);
    }
    return b;
  }

  private pushInbox(driverId: string, event: string, payload: unknown) {
    const b = this.box(driverId);
    const now = Date.now();
    b.events.push({ id: ++b.seq, at: now, event, payload });
    b.events = b.events.filter((e) => now - e.at < INBOX_TTL_MS).slice(-INBOX_MAX);
    for (const w of b.waiters) w();
    b.waiters.clear();
  }

  /** Has the driver's phone service polled recently (≈ alive in background)? */
  isPolling(driverId: string): boolean {
    const b = this.inboxes.get(driverId);
    return !!b && Date.now() - b.lastPoll < 60_000;
  }

  /**
   * Events after `after`, waiting up to `timeoutMs` for the first one.
   * `after` missing or ahead of the counter (server restarted) → just the
   * current cursor, so the phone resyncs without replaying old alarms.
   */
  async waitInbox(
    driverId: string,
    after: number | null,
    timeoutMs: number,
  ): Promise<{ last: number; events: { id: number; event: string; payload: unknown }[] }> {
    const b = this.box(driverId);
    b.lastPoll = Date.now();
    const pick = () =>
      b.events
        .filter((e) => after != null && e.id > after && Date.now() - e.at < INBOX_TTL_MS)
        .map(({ id, event, payload }) => ({ id, event, payload }));
    if (after == null || after > b.seq) return { last: b.seq, events: [] };
    let ready = pick();
    if (!ready.length) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(done, timeoutMs);
        function done() {
          clearTimeout(t);
          b.waiters.delete(done);
          resolve();
        }
        b.waiters.add(done);
      });
      b.lastPoll = Date.now();
      ready = pick();
    }
    return { last: b.seq, events: ready };
  }
}
