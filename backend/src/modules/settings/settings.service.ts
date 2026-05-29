import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SETTING_KEYS,
  SettingKey,
  SiteSetting,
} from './site-setting.entity';

export type SettingsMap = Record<SettingKey, string>;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SiteSetting)
    private readonly repo: Repository<SiteSetting>,
  ) {}

  async getAll(): Promise<SettingsMap> {
    const rows = await this.repo.find();
    const map: Partial<SettingsMap> = {};
    for (const k of SETTING_KEYS) map[k] = '';
    for (const r of rows) {
      if ((SETTING_KEYS as string[]).includes(r.key)) {
        (map as any)[r.key] = r.value ?? '';
      }
    }
    return map as SettingsMap;
  }

  async get(key: SettingKey): Promise<string> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? '';
  }

  async setMany(patch: Partial<SettingsMap>): Promise<SettingsMap> {
    for (const [k, v] of Object.entries(patch)) {
      if (!(SETTING_KEYS as string[]).includes(k)) continue;
      const value = (v ?? '').toString();
      const existing = await this.repo.findOne({ where: { key: k } });
      if (existing) {
        existing.value = value;
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create({ key: k, value }));
      }
    }
    return this.getAll();
  }
}
