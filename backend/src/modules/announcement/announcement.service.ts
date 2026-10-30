import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Announcement, AnnouncementAudience } from './announcement.entity';
import { AnnouncementEvents } from './announcement.events';
import { RealtimeService } from '../realtime/realtime.service';
import { Driver } from '../driver/driver.entity';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(Announcement)
    private readonly repo: Repository<Announcement>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    private readonly realtime: RealtimeService,
    private readonly events: AnnouncementEvents,
  ) {}

  list() {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  /** Last few broadcasts addressed to drivers, for the app's home card. */
  latestForDrivers(limit = 5) {
    return this.repo.find({
      where: { audience: In(['drivers', 'all']) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async create(
    adminId: string,
    input: { title: string; text: string; audience: AnnouncementAudience },
  ) {
    const title = (input.title ?? '').trim();
    const text = (input.text ?? '').trim();
    if (!title) throw new BadRequestException('Sarlavha kerak');
    if (!text) throw new BadRequestException('Matn kerak');
    const audience: AnnouncementAudience = ['drivers', 'clients', 'all'].includes(
      input.audience,
    )
      ? input.audience
      : 'all';

    const saved = await this.repo.save(
      this.repo.create({ title, text, audience, createdBy: adminId }),
    );

    if (audience === 'drivers' || audience === 'all') {
      this.realtime.emitToAllDrivers('announcement', {
        id: saved.id,
        title: saved.title,
        text: saved.text,
        createdAt: saved.createdAt,
      });
      const n = await this.drivers.count({ where: { isActive: true } });
      await this.repo.update({ id: saved.id }, { sentDrivers: n });
    }
    if (audience === 'clients' || audience === 'all') {
      // The bot sends these out in the background and reports the count.
      this.events.emitToClients(saved);
    }
    return this.repo.findOneOrFail({ where: { id: saved.id } });
  }

  async markClientsSent(id: string, count: number) {
    await this.repo.update({ id }, { sentClients: count });
  }
}
