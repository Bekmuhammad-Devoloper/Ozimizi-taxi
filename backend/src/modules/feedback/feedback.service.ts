import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './feedback.entity';

export interface CreateFeedbackInput {
  telegramUserId: number | string;
  telegramUsername?: string | null;
  firstName?: string | null;
  phone?: string | null;
  text: string;
  photoUrl?: string | null;
  clientId?: string | null;
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly repo: Repository<Feedback>,
  ) {}

  create(input: CreateFeedbackInput): Promise<Feedback> {
    return this.repo.save(
      this.repo.create({
        telegramUserId: String(input.telegramUserId),
        telegramUsername: input.telegramUsername ?? null,
        firstName: input.firstName ?? null,
        phone: input.phone ?? null,
        text: input.text.slice(0, 4000),
        photoUrl: input.photoUrl ?? null,
        clientId: input.clientId ?? null,
      }),
    );
  }

  async findOne(id: string): Promise<Feedback> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Topilmadi');
    return row;
  }

  /** Store the admin's answer (delivery to Telegram happens in the caller). */
  async reply(id: string, text: string): Promise<Feedback> {
    const row = await this.findOne(id);
    row.replyText = text.slice(0, 4000);
    row.repliedAt = new Date();
    row.isRead = true;
    return this.repo.save(row);
  }

  list(filter: { unreadOnly?: boolean; limit?: number } = {}) {
    return this.repo.find({
      where: filter.unreadOnly ? { isRead: false } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(filter.limit ?? 100, 500),
    });
  }

  async unreadCount(): Promise<number> {
    return this.repo.count({ where: { isRead: false } });
  }

  async markRead(id: string): Promise<Feedback> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Topilmadi');
    if (row.isRead) return row;
    row.isRead = true;
    return this.repo.save(row);
  }

  async markAllRead(): Promise<{ updated: number }> {
    const res = await this.repo
      .createQueryBuilder()
      .update(Feedback)
      .set({ isRead: true })
      .where('is_read = false')
      .execute();
    return { updated: res.affected ?? 0 };
  }
}
