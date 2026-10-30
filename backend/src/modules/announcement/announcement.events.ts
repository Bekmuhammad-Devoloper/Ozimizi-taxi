import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Announcement } from './announcement.entity';

/** Client-side delivery happens in the (optional) Telegram bot module. */
@Injectable()
export class AnnouncementEvents {
  private readonly bus = new EventEmitter();

  emitToClients(a: Announcement) {
    this.bus.emit('to_clients', a);
  }

  onToClients(listener: (a: Announcement) => void) {
    this.bus.on('to_clients', listener);
  }
}
