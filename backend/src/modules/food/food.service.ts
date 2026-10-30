import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  FoodOrder,
  FoodOrderEvent,
  FoodOrderItem,
  FoodOrderStatus,
  Kitchen,
  KitchenCourier,
  MenuCategory,
  MenuItem,
} from './food.entities';
import { TariffService } from '../tariff/tariff.service';
import { PromoService } from '../promo/promo.service';
import { computeFare } from '../../common/utils/fare';
import { FoodEvents } from './food.events';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';
import { haversineKm } from '../../common/utils/haversine';

export interface KitchenInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
  logoUrl?: string | null;
  description?: string | null;
  username?: string;
  password?: string;
  isActive?: boolean;
  isOpen?: boolean;
  prepMinutes?: number;
  minOrder?: number;
  commissionPercent?: number;
  sort?: number;
  needsCourier?: boolean;
  deliveryPricing?: 'custom' | 'taxi';
  deliveryBaseFee?: number | null;
  deliveryFreeKm?: number | null;
  deliveryPerKm?: number | null;
  courierMaxKm?: number | null;
}

export interface MenuItemInput {
  id?: string;
  name?: string;
  description?: string | null;
  price?: number;
  photoUrl?: string | null;
  categoryId?: string | null;
  isAvailable?: boolean;
  sort?: number;
  kind?: 'dish' | 'raw' | 'semi';
}

export interface CreateFoodOrderInput {
  kitchenId: string;
  items: { itemId: string; qty: number }[];
  lat: number;
  lng: number;
  address?: string | null;
  phone?: string | null;
  comment?: string | null;
  source?: 'app' | 'bot';
  /** 'pickup' = the client collects it at the kitchen (no delivery fee). */
  deliveryType?: 'delivery' | 'pickup';
  /** How much of the order to pay from the bonus balance (capped). */
  bonus?: number;
  /** Same id on the orders placed together from several kitchens. */
  groupId?: string | null;
}

export interface KitchenOrderInput {
  clientName?: string | null;
  phone?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  items?: { itemId: string; qty: number }[];
  /** Free-form lines (not on the menu): name, price, qty. */
  customItems?: { name: string; price: number; qty: number }[];
  deliveryType?: 'delivery' | 'pickup';
  needsCourier?: boolean;
  comment?: string | null;
  prepMinutes?: number;
}

const ACTIVE_COURIER: FoodOrderStatus[] = ['COOKING', 'READY', 'PICKED_UP'];
const FINAL: FoodOrderStatus[] = ['DELIVERED', 'REJECTED', 'CANCELLED'];
const ROAD = 1.3; // straight line → road distance

const money = (n: number) => Math.round(n * 100) / 100;

interface DispatchState {
  stage: 'own' | 'personal' | 'all';
  offeredTo: string | null;
  offeredAt: number;
  tried: Set<string>;
  timer: NodeJS.Timeout | null;
  retry: NodeJS.Timeout | null;
  rounds: number;
  offerSeconds: number;
  allAt: number | null;
  allDrivers: Set<string>;
  ringAt: Map<string, number>;
}

/**
 * Food delivery: kitchens + menu, client orders (bot Mini App / client app,
 * cash on delivery), kitchen panel workflow and courier dispatch.
 *
 * Courier dispatch mirrors the taxi one: when the kitchen accepts, the order
 * is offered personally to the nearest free courier / taxi driver (15 s
 * alarm), then the next one, then it "falls to the middle" and rings for
 * everyone; while still unassigned it re-rings every minute (up to 20 min).
 * Driver events reuse the taxi names (new_order / order_offer_expired /
 * order_taken) with `kind: 'delivery'`, so the phone's background service
 * rings for them too.
 */
@Injectable()
export class FoodService implements OnModuleInit {
  private readonly logger = new Logger(FoodService.name);
  private readonly dispatch = new Map<string, DispatchState>();

  constructor(
    @InjectRepository(Kitchen) private readonly kitchens: Repository<Kitchen>,
    @InjectRepository(MenuCategory) private readonly categories: Repository<MenuCategory>,
    @InjectRepository(MenuItem) private readonly items: Repository<MenuItem>,
    @InjectRepository(FoodOrder) private readonly orders: Repository<FoodOrder>,
    @InjectRepository(FoodOrderEvent) private readonly events: Repository<FoodOrderEvent>,
    @InjectRepository(KitchenCourier) private readonly kitchenCouriers: Repository<KitchenCourier>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
    private readonly balance: BalanceService,
    private readonly foodEvents: FoodEvents,
    private readonly tariff: TariffService,
    private readonly promo: PromoService,
    private readonly config: ConfigService,
    private readonly ds: DataSource,
  ) {}

  /** After a restart, unassigned cooking orders go straight to "everyone". */
  onModuleInit() {
    setTimeout(() => {
      void (async () => {
        const waiting = await this.orders.find({
          where: { status: In(['COOKING', 'READY']), courierId: IsNull() },
        });
        for (const o of waiting) this.startDispatch(o.id, 'all');
      })().catch((e) => this.logger.warn(`dispatch resume failed: ${(e as Error).message}`));
    }, 20_000).unref?.();
  }

  // ======================================================== kitchens (admin)

  async listKitchens() {
    const rows = await this.kitchens.find({ order: { sort: 'ASC', createdAt: 'ASC' } });
    const stats = (await this.ds.query(`
      SELECT k.id,
        (SELECT count(*)::int FROM menu_items m WHERE m.kitchen_id = k.id) AS items,
        (SELECT count(*)::int FROM food_orders f WHERE f.kitchen_id = k.id AND f.created_at > date_trunc('day', now())) AS today,
        (SELECT count(*)::int FROM food_orders f WHERE f.kitchen_id = k.id AND f.status NOT IN ('DELIVERED','REJECTED','CANCELLED')) AS active,
        (SELECT coalesce(sum(f.items_total),0)::float FROM food_orders f WHERE f.kitchen_id = k.id AND f.status = 'DELIVERED') AS sales,
        (SELECT coalesce(sum(f.kitchen_commission),0)::float FROM food_orders f WHERE f.kitchen_id = k.id AND f.status = 'DELIVERED') AS commission
      FROM kitchens k`)) as { id: string; items: number; today: number; active: number; sales: number; commission: number }[];
    const by = new Map(stats.map((s) => [s.id, s]));
    return rows.map((k) => ({ ...k, stats: by.get(k.id) ?? null }));
  }

  private async assertFreeUsername(username: string, selfId?: string) {
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
      throw new BadRequestException('Login 3–32 belgi: lotin harfi, raqam, _ . - (bo‘sh joysiz)');
    }
    const k = await this.kitchens.findOne({ where: { username } });
    if (k && k.id !== selfId) throw new BadRequestException('Bu login band');
    const [a] = (await this.ds.query(`SELECT id FROM admins WHERE lower(trim(username)) = $1 LIMIT 1`, [username])) as any[];
    if (a) throw new BadRequestException('Bu login admin/koordinatorda band');
  }

  async createKitchen(input: KitchenInput) {
    const name = (input.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Oshxona nomini kiriting');
    if (!Number.isFinite(Number(input.lat)) || !Number.isFinite(Number(input.lng))) {
      throw new BadRequestException('Oshxona joylashuvini (xaritada) belgilang');
    }
    const username = (input.username ?? '').trim().toLowerCase();
    await this.assertFreeUsername(username);
    if (!input.password || input.password.length < 6) throw new BadRequestException('Parol kamida 6 belgi');
    const row = this.kitchens.create({
      name,
      username,
      passwordHash: await bcrypt.hash(input.password, 10),
      lat: Number(input.lat),
      lng: Number(input.lng),
    });
    this.applyKitchen(row, input);
    const saved = await this.kitchens.save(row);
    const { passwordHash: _p, ...rest } = saved as any;
    return rest;
  }

  async updateKitchen(id: string, input: KitchenInput) {
    const row = await this.kitchens.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Oshxona topilmadi');
    if (input.name !== undefined) {
      const n = input.name.trim();
      if (n.length < 2) throw new BadRequestException('Oshxona nomini kiriting');
      row.name = n;
    }
    if (input.username !== undefined) {
      const u = input.username.trim().toLowerCase();
      await this.assertFreeUsername(u, id);
      row.username = u;
    }
    if (input.password) {
      if (input.password.length < 6) throw new BadRequestException('Parol kamida 6 belgi');
      row.passwordHash = await bcrypt.hash(input.password, 10);
      await this.kitchens.update(id, { passwordHash: row.passwordHash });
    }
    if (input.lat !== undefined && Number.isFinite(Number(input.lat))) row.lat = Number(input.lat);
    if (input.lng !== undefined && Number.isFinite(Number(input.lng))) row.lng = Number(input.lng);
    if (input.isActive !== undefined) row.isActive = !!input.isActive;
    this.applyKitchen(row, input);
    const { passwordHash: _p, ...toSave } = row as any;
    await this.kitchens.save(toSave);
    return this.kitchens.findOneOrFail({ where: { id } });
  }

  private applyKitchen(row: Kitchen, input: KitchenInput) {
    if (input.phone !== undefined) row.phone = (input.phone ?? '').trim() || null;
    if (input.address !== undefined) row.address = (input.address ?? '').trim() || null;
    if (input.logoUrl !== undefined) row.logoUrl = input.logoUrl || null;
    if (input.description !== undefined) row.description = (input.description ?? '').trim() || null;
    if (input.isOpen !== undefined) row.isOpen = !!input.isOpen;
    if (input.prepMinutes !== undefined) row.prepMinutes = Math.min(180, Math.max(1, Math.round(Number(input.prepMinutes) || 20)));
    if (input.minOrder !== undefined) row.minOrder = Math.max(0, Number(input.minOrder) || 0).toFixed(2);
    if (input.commissionPercent !== undefined) {
      const p = Number(input.commissionPercent);
      if (!Number.isFinite(p) || p < 0 || p > 100) throw new BadRequestException('Komissiya 0–100%');
      row.commissionPercent = p.toFixed(2);
    }
    if (input.sort !== undefined) row.sort = Math.round(Number(input.sort) || 0);
    if (input.needsCourier !== undefined) row.needsCourier = !!input.needsCourier;
    if (input.deliveryPricing !== undefined) {
      row.deliveryPricing = input.deliveryPricing === 'taxi' ? 'taxi' : 'custom';
    }
    const optNum = (v: number | null | undefined, max: number) => {
      if (v === null || (v as any) === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) throw new BadRequestException('Yetkazish sozlamasida noto‘g‘ri qiymat');
      return n.toFixed(2);
    };
    if (input.deliveryBaseFee !== undefined) row.deliveryBaseFee = optNum(input.deliveryBaseFee, 10_000_000);
    if (input.deliveryFreeKm !== undefined) row.deliveryFreeKm = optNum(input.deliveryFreeKm, 1000);
    if (input.deliveryPerKm !== undefined) row.deliveryPerKm = optNum(input.deliveryPerKm, 10_000_000);
    if (input.courierMaxKm !== undefined) row.courierMaxKm = optNum(input.courierMaxKm, 1000);
  }

  /** Kitchen login (called from the shared admin login). */
  async verifyKitchenLogin(username: string, password: string): Promise<Kitchen | null> {
    const k = await this.kitchens
      .createQueryBuilder('k')
      .addSelect('k.passwordHash')
      .where('LOWER(TRIM(k.username)) = :u', { u: (username ?? '').trim().toLowerCase() })
      .getOne();
    if (!k || !k.isActive) return null;
    return (await bcrypt.compare(password ?? '', k.passwordHash)) ? k : null;
  }

  // ==================================================================== menu

  async getMenu(kitchenId: string) {
    const kitchen = await this.kitchens.findOne({ where: { id: kitchenId } });
    if (!kitchen) throw new NotFoundException('Oshxona topilmadi');
    const [categories, items] = await Promise.all([
      this.categories.find({ where: { kitchenId }, order: { sort: 'ASC', name: 'ASC' } }),
      this.items.find({ where: { kitchenId }, order: { sort: 'ASC', createdAt: 'ASC' } }),
    ]);
    return { kitchen, categories, items };
  }

  async upsertCategory(kitchenId: string, input: { id?: string; name?: string; sort?: number }) {
    const name = (input.name ?? '').trim();
    if (!name) throw new BadRequestException('Bo‘lim nomini kiriting');
    let row = input.id ? await this.categories.findOne({ where: { id: input.id, kitchenId } }) : null;
    if (input.id && !row) throw new NotFoundException('Bo‘lim topilmadi');
    row = row ?? this.categories.create({ kitchenId });
    row.name = name.slice(0, 80);
    if (input.sort !== undefined) row.sort = Math.round(Number(input.sort) || 0);
    return this.categories.save(row);
  }

  async deleteCategory(kitchenId: string, id: string) {
    await this.categories.delete({ id, kitchenId });
    return { ok: true };
  }

  async upsertItem(kitchenId: string, input: MenuItemInput) {
    let row = input.id ? await this.items.findOne({ where: { id: input.id, kitchenId } }) : null;
    if (input.id && !row) throw new NotFoundException('Taom topilmadi');
    row = row ?? this.items.create({ kitchenId, isAvailable: true });
    if (input.name !== undefined || !row.name) {
      const n = (input.name ?? '').trim();
      if (n.length < 2) throw new BadRequestException('Taom nomini kiriting');
      row.name = n.slice(0, 120);
    }
    if (input.price !== undefined || !row.price) {
      const p = Number(input.price);
      if (!Number.isFinite(p) || p <= 0) throw new BadRequestException('Narx musbat bo‘lsin');
      row.price = p.toFixed(2);
    }
    if (input.description !== undefined) row.description = (input.description ?? '').trim() || null;
    if (input.photoUrl !== undefined) row.photoUrl = input.photoUrl || null;
    if (input.categoryId !== undefined) {
      if (input.categoryId) {
        const c = await this.categories.findOne({ where: { id: input.categoryId, kitchenId } });
        if (!c) throw new BadRequestException('Bo‘lim topilmadi');
      }
      row.categoryId = input.categoryId || null;
    }
    if (input.isAvailable !== undefined) row.isAvailable = !!input.isAvailable;
    if (input.sort !== undefined) row.sort = Math.round(Number(input.sort) || 0);
    if (input.kind !== undefined) row.kind = ['raw', 'semi'].includes(input.kind) ? input.kind : 'dish';
    return this.items.save(row);
  }

  async deleteItem(kitchenId: string, id: string) {
    await this.items.delete({ id, kitchenId });
    return { ok: true };
  }

  // ============================================================ delivery fee

  private async feeSettings() {
    const n = async (k: 'delivery_base_fee' | 'delivery_free_km' | 'delivery_per_km' | 'delivery_commission_percent', d: number) => {
      const raw = (await this.settings.get(k)).trim();
      const v = raw === '' ? d : Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : d;
    };
    return {
      base: await n('delivery_base_fee', 8000),
      freeKm: await n('delivery_free_km', 2),
      perKm: await n('delivery_per_km', 2000),
      commissionPct: Math.min(100, await n('delivery_commission_percent', 10)),
    };
  }

  /** Road km between two points and the delivery fee (rounded to 1 000). */
  async quoteDelivery(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    const km = Math.round(haversineKm(fromLat, fromLng, toLat, toLng) * ROAD * 10) / 10;
    const s = await this.feeSettings();
    const raw = s.base + Math.max(0, km - s.freeKm) * s.perKm;
    return { km, fee: Math.ceil(raw / 1000) * 1000 };
  }

  /**
   * Delivery price for one kitchen. Admin may set per-kitchen km prices or
   * "same as taxi". Farther than the kitchen's courier limit → the order goes
   * to TAXI drivers and is priced by the taxi tariff.
   */
  async quoteFor(k: Kitchen, toLat: number, toLng: number): Promise<{ km: number; fee: number; mode: 'courier' | 'taxi' }> {
    const km = Math.round(haversineKm(k.lat, k.lng, toLat, toLng) * ROAD * 10) / 10;
    const taxiFare = async () => computeFare(km, await this.tariff.getCurrent());
    if (k.courierMaxKm != null && km > Number(k.courierMaxKm)) {
      return { km, fee: await taxiFare(), mode: 'taxi' };
    }
    if (k.deliveryPricing === 'taxi') return { km, fee: await taxiFare(), mode: 'courier' };
    const g = await this.feeSettings();
    const base = k.deliveryBaseFee != null ? Number(k.deliveryBaseFee) : g.base;
    const freeKm = k.deliveryFreeKm != null ? Number(k.deliveryFreeKm) : g.freeKm;
    const perKm = k.deliveryPerKm != null ? Number(k.deliveryPerKm) : g.perKm;
    const raw = base + Math.max(0, km - freeKm) * perKm;
    return { km, fee: Math.ceil(raw / 1000) * 1000, mode: 'courier' };
  }

  /** How much of a food order of this size the client may pay from bonus. */
  async bonusAllowance(clientId: string, total: number) {
    const client = await this.clients.findOne({ where: { id: clientId } });
    if (!client) return { max: 0, balance: 0, capPercent: 0, note: null as string | null };
    const balance = Number(client.balance);
    const pct = Number((await this.settings.get('bonus_max_percent_per_ride')) || '0');
    const cap = pct > 0 ? Math.floor((total * pct) / 100) : total;
    const promo = await this.promo.allowanceFor(clientId, total);
    const free = Math.max(0, balance - promo.locked);
    const spendable = free + Math.min(promo.allowed, balance);
    const max = Math.max(0, Math.floor(Math.min(spendable, cap, total)));
    const note = promo.rules.length
      ? promo.rules
          .map((r: any) => (r.unlocked === false ? `${r.code}: ${r.minRides} ta safardan keyin ochiladi` : `${r.code}: bu buyurtmada ${r.cap.toLocaleString('uz')} so‘m gacha`))
          .join('; ')
      : null;
    return { max, balance, capPercent: pct, note };
  }

  // ================================================================== client

  async kitchensForClient(lat?: number, lng?: number) {
    const rows = await this.kitchens.find({ where: { isActive: true }, order: { sort: 'ASC', name: 'ASC' } });
    const counts = (await this.ds.query(
      `SELECT kitchen_id, count(*)::int AS n FROM menu_items WHERE is_available GROUP BY kitchen_id`,
    )) as { kitchen_id: string; n: number }[];
    const byK = new Map(counts.map((c) => [c.kitchen_id, c.n]));
    const out: any[] = [];
    for (const k of rows) {
      const q = Number.isFinite(lat) && Number.isFinite(lng) ? await this.quoteFor(k, lat!, lng!) : null;
      out.push({
        id: k.id,
        name: k.name,
        description: k.description,
        logoUrl: k.logoUrl,
        address: k.address,
        isOpen: k.isOpen,
        prepMinutes: k.prepMinutes,
        minOrder: Number(k.minOrder),
        itemsCount: byK.get(k.id) ?? 0,
        distanceKm: q?.km ?? null,
        deliveryFee: q?.fee ?? null,
        courierMode: q?.mode ?? null,
      });
    }
    return out.filter((k) => k.itemsCount > 0).sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
  }

  async kitchenForClient(id: string, lat?: number, lng?: number) {
    const k = await this.kitchens.findOne({ where: { id, isActive: true } });
    if (!k) throw new NotFoundException('Oshxona topilmadi');
    const [categories, items] = await Promise.all([
      this.categories.find({ where: { kitchenId: id }, order: { sort: 'ASC', name: 'ASC' } }),
      this.items.find({ where: { kitchenId: id, isAvailable: true }, order: { sort: 'ASC', createdAt: 'ASC' } }),
    ]);
    const q = Number.isFinite(lat) && Number.isFinite(lng) ? await this.quoteFor(k, lat!, lng!) : null;
    return {
      kitchen: {
        id: k.id,
        name: k.name,
        description: k.description,
        logoUrl: k.logoUrl,
        address: k.address,
        phone: k.phone,
        isOpen: k.isOpen,
        prepMinutes: k.prepMinutes,
        minOrder: Number(k.minOrder),
        lat: k.lat,
        lng: k.lng,
        distanceKm: q?.km ?? null,
        deliveryFee: q?.fee ?? null,
        courierMode: q?.mode ?? null,
      },
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      items: items.map((i) => ({
        id: i.id,
        kind: i.kind,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        price: Number(i.price),
        photoUrl: i.photoUrl,
      })),
    };
  }

  async createOrder(clientId: string, input: CreateFoodOrderInput) {
    const client = await this.clients.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Mijoz topilmadi');
    if (client.isBlocked) throw new ForbiddenException('Hisobingiz bloklangan');
    const kitchen = await this.kitchens.findOne({ where: { id: input?.kitchenId, isActive: true } });
    if (!kitchen) throw new NotFoundException('Oshxona topilmadi');
    if (!kitchen.isOpen) throw new BadRequestException('Oshxona hozir yopiq');
    const pickup = input.deliveryType === 'pickup';
    const lat = pickup && !Number.isFinite(Number(input.lat)) ? kitchen.lat : Number(input.lat);
    const lng = pickup && !Number.isFinite(Number(input.lng)) ? kitchen.lng : Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException('Yetkazish manzilini belgilang');
    const lines = (input.items ?? []).filter((l) => l?.itemId && Number(l.qty) > 0);
    if (!lines.length) throw new BadRequestException('Savat bo‘sh');
    const open = await this.orders.count({ where: { clientId, status: In(['NEW', 'COOKING', 'READY', 'PICKED_UP']) } });
    if (open >= 6) throw new BadRequestException('Sizda 6 ta faol ovqat buyurtmasi bor — avval ular yetkazilsin');

    const menu = await this.items.find({ where: { kitchenId: kitchen.id, id: In(lines.map((l) => l.itemId)) } });
    const byId = new Map(menu.map((m) => [m.id, m]));
    const items: FoodOrderItem[] = [];
    for (const l of lines) {
      const m = byId.get(l.itemId);
      if (!m) throw new BadRequestException('Menyuda yo‘q taom bor — sahifani yangilang');
      if (!m.isAvailable) throw new BadRequestException(`"${m.name}" hozir mavjud emas`);
      const qty = Math.min(50, Math.max(1, Math.round(Number(l.qty))));
      items.push({ itemId: m.id, name: m.name, price: Number(m.price), qty });
    }
    const itemsTotal = money(items.reduce((s, i) => s + i.price * i.qty, 0));
    if (itemsTotal < Number(kitchen.minOrder)) {
      throw new BadRequestException(`Minimal buyurtma: ${Number(kitchen.minOrder).toLocaleString('uz')} so‘m`);
    }
    const q = pickup ? { km: 0, fee: 0, mode: 'courier' as const } : await this.quoteFor(kitchen, lat, lng);
    const total = itemsTotal + q.fee;
    // Bonus part-payment (same rules as rides: promo per-ride caps + global %).
    let bonus = 0;
    if (Number(input.bonus) > 0) {
      const allow = await this.bonusAllowance(clientId, total);
      bonus = Math.min(Math.floor(Number(input.bonus)), allow.max);
    }
    const saved = await this.orders.save(
      this.orders.create({
        clientId,
        kitchenId: kitchen.id,
        status: 'NEW',
        items,
        itemsTotal: itemsTotal.toFixed(2),
        deliveryFee: q.fee.toFixed(2),
        total: total.toFixed(2),
        distanceKm: q.km.toFixed(2),
        deliveryType: pickup ? 'pickup' : 'delivery',
        needsCourier: !pickup && kitchen.needsCourier,
        courierMode: q.mode,
        bonusUsed: '0.00',
        groupId: input.groupId || null,
        createdBy: 'client',
        clientName: client.firstName,
        lat,
        lng,
        address: (input.address ?? '').trim().slice(0, 255) || null,
        phone: (input.phone ?? '').trim().slice(0, 32) || client.phonePrimary,
        comment: (input.comment ?? '').trim().slice(0, 1000) || null,
        source: input.source === 'bot' ? 'bot' : 'app',
      }),
    );
    if (bonus > 0) {
      // Held on the treasury until delivery (refunded if it never happens).
      try {
        await this.balance.adjustClient({ clientId, amount: -bonus, note: `Ovqat #${saved.number ?? ''} bonusdan to‘lov` });
        await this.promo.spend(clientId, null as any, bonus, total).catch(() => undefined);
        await this.orders.update(saved.id, { bonusUsed: bonus.toFixed(2) });
      } catch (e) {
        this.logger.warn(`food bonus hold failed: ${(e as Error).message}`);
      }
    }
    const full = await this.orders.findOneOrFail({ where: { id: saved.id } });
    await this.logEvent(full.id, 'created', null, {
      kitchenName: kitchen.name,
      itemsCount: items.reduce((s, i) => s + i.qty, 0),
      total: Number(full.total),
      address: full.address,
      clientName: client.firstName,
      deliveryType: full.deliveryType,
      bonusUsed: Number(full.bonusUsed),
      courierMode: full.courierMode,
    });
    await this.notify(full);
    return this.clientView(full);
  }

  async clientOrders(clientId: string) {
    const rows = await this.orders.find({
      where: { clientId },
      relations: { kitchen: true, courier: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((o) => this.clientView(o));
  }

  async clientOrder(clientId: string, id: string) {
    const o = await this.orders.findOne({ where: { id, clientId }, relations: { kitchen: true, courier: true } });
    if (!o) throw new NotFoundException('Buyurtma topilmadi');
    return this.clientView(o);
  }

  async cancelByClient(clientId: string, id: string) {
    const o = await this.orders.findOne({ where: { id, clientId } });
    if (!o) throw new NotFoundException('Buyurtma topilmadi');
    if (o.status !== 'NEW') {
      throw new BadRequestException('Oshxona tayyorlashni boshlagan — bekor qilish uchun oshxonaga qo‘ng‘iroq qiling');
    }
    return this.clientView(await this.finishCancel(o, 'client'));
  }

  clientView(o: FoodOrder) {
    const c = o.courier ?? null;
    const k = o.kitchen ?? null;
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      items: o.items,
      itemsTotal: Number(o.itemsTotal),
      deliveryFee: Number(o.deliveryFee),
      total: Number(o.total),
      distanceKm: o.distanceKm != null ? Number(o.distanceKm) : null,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      phone: o.phone,
      comment: o.comment,
      prepMinutes: o.prepMinutes,
      deliveryType: o.deliveryType,
      needsCourier: o.needsCourier,
      courierMode: o.courierMode,
      bonusUsed: Number(o.bonusUsed ?? 0),
      cashDue: Math.max(0, Number(o.total) - Number(o.bonusUsed ?? 0)),
      clientName: o.clientName ?? o.client?.firstName ?? null,
      createdBy: o.createdBy,
      groupId: o.groupId,
      rejectReason: o.rejectReason,
      cancelledBy: o.cancelledBy,
      createdAt: o.createdAt,
      acceptedAt: o.acceptedAt,
      readyAt: o.readyAt,
      courierAssignedAt: o.courierAssignedAt,
      pickedUpAt: o.pickedUpAt,
      deliveredAt: o.deliveredAt,
      cancelledAt: o.cancelledAt,
      kitchen: k ? { id: k.id, name: k.name, phone: k.phone, logoUrl: k.logoUrl, address: k.address, lat: k.lat, lng: k.lng } : null,
      courier: c
        ? {
            id: c.id,
            fullName: c.fullName,
            phone: c.phone,
            avatarUrl: c.avatarUrl,
            kind: c.kind,
            carModel: c.carModel,
            carPlate: c.carPlate,
            lat: c.currentLat,
            lng: c.currentLng,
          }
        : null,
    };
  }

  // ================================================================= kitchen

  async kitchenSelf(kitchenId: string) {
    const k = await this.kitchens.findOne({ where: { id: kitchenId } });
    if (!k || !k.isActive) throw new ForbiddenException('Oshxona faol emas');
    return k;
  }

  updateKitchenSelf(kitchenId: string, input: KitchenInput) {
    // The kitchen may change only its own operational fields.
    const { isOpen, prepMinutes, phone, description, logoUrl, address, needsCourier } = input ?? {};
    return this.updateKitchen(kitchenId, { isOpen, prepMinutes, phone, description, logoUrl, address, needsCourier });
  }

  async kitchenOrders(kitchenId: string, scope: 'active' | 'history') {
    const where =
      scope === 'active'
        ? { kitchenId, status: In(['NEW', 'COOKING', 'READY', 'PICKED_UP']) }
        : { kitchenId, status: In(FINAL) };
    const rows = await this.orders.find({
      where: where as any,
      relations: { courier: true, client: true },
      order: { createdAt: scope === 'active' ? 'ASC' : 'DESC' },
      take: scope === 'active' ? 200 : 100,
    });
    return rows.map((o) => ({
      ...this.clientView(o),
      clientName: o.clientName ?? o.client?.firstName ?? null,
      kitchenCommission: Number(o.kitchenCommission),
      dispatchStage: this.dispatch.get(o.id)?.stage ?? null,
    }));
  }

  async kitchenStats(kitchenId: string) {
    const [r] = (await this.ds.query(
      `SELECT
         count(*) FILTER (WHERE created_at > date_trunc('day', now()))::int AS today,
         count(*) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('day', now()))::int AS delivered_today,
         coalesce(sum(items_total) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('day', now())), 0)::float AS sales_today,
         coalesce(sum(items_total) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('month', now())), 0)::float AS sales_month,
         coalesce(sum(kitchen_commission) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('month', now())), 0)::float AS commission_month
       FROM food_orders WHERE kitchen_id = $1`,
      [kitchenId],
    )) as any[];
    return r;
  }

  private async kitchenOrder(kitchenId: string, id: string) {
    const o = await this.orders.findOne({ where: { id, kitchenId } });
    if (!o) throw new NotFoundException('Buyurtma topilmadi');
    return o;
  }

  async kitchenAccept(kitchenId: string, id: string, prepMinutes?: number, needsCourier?: boolean) {
    const o = await this.kitchenOrder(kitchenId, id);
    if (o.status !== 'NEW') throw new BadRequestException('Buyurtma allaqachon ko‘rib chiqilgan');
    const k = await this.kitchenSelf(kitchenId);
    o.status = 'COOKING';
    o.acceptedAt = new Date();
    o.prepMinutes = Math.min(180, Math.max(1, Math.round(Number(prepMinutes) || k.prepMinutes)));
    // The kitchen decides per order: platform courier, or its own delivery.
    if (o.deliveryType === 'pickup') o.needsCourier = false;
    else if (needsCourier !== undefined) o.needsCourier = !!needsCourier;
    await this.orders.save(o);
    await this.logEvent(o.id, 'kitchen_accepted', null, {
      kitchenName: k.name,
      prepMinutes: o.prepMinutes,
      needsCourier: o.needsCourier,
      deliveryType: o.deliveryType,
    });
    await this.notify(o);
    if (o.needsCourier) this.startDispatch(o.id, 'personal');
    return this.clientView(o);
  }

  /** Accepted without a courier but changed its mind → start courier search. */
  async kitchenCallCourier(kitchenId: string, id: string) {
    const o = await this.kitchenOrder(kitchenId, id);
    if (!['COOKING', 'READY'].includes(o.status)) throw new BadRequestException('Bu holatda kuryer chaqirib bo‘lmaydi');
    if (o.deliveryType === 'pickup') throw new BadRequestException('Mijoz o‘zi olib ketadi');
    if (o.courierId) throw new BadRequestException('Kuryer allaqachon biriktirilgan');
    o.needsCourier = true;
    await this.orders.save(o);
    await this.logEvent(o.id, 'courier_called', null, {});
    this.startDispatch(o.id, 'personal');
    return this.clientView(o);
  }

  /** Kitchen's own delivery left the kitchen (no platform courier). */
  async kitchenDispatched(kitchenId: string, id: string) {
    const o = await this.kitchenOrder(kitchenId, id);
    if (o.needsCourier || o.deliveryType === 'pickup') throw new BadRequestException('Bu buyurtmani kuryer / mijoz olib ketadi');
    if (!['COOKING', 'READY'].includes(o.status)) throw new BadRequestException('Bu holatda yuborib bo‘lmaydi');
    o.status = 'PICKED_UP';
    o.pickedUpAt = new Date();
    if (!o.readyAt) o.readyAt = o.pickedUpAt;
    await this.orders.save(o);
    await this.logEvent(o.id, 'picked_up', null, { by: 'kitchen' });
    await this.notify(o);
    return this.clientView(o);
  }

  /** Kitchen finished it itself: own delivery arrived, or the client picked it up. */
  async kitchenDelivered(kitchenId: string, id: string) {
    const o = await this.kitchenOrder(kitchenId, id);
    if (o.needsCourier && o.deliveryType !== 'pickup') throw new BadRequestException('Buni kuryer yakunlaydi');
    if (o.status === 'DELIVERED') return this.clientView(o);
    if (!['COOKING', 'READY', 'PICKED_UP'].includes(o.status)) throw new BadRequestException('Bu holatda yakunlab bo‘lmaydi');
    o.status = 'DELIVERED';
    o.deliveredAt = new Date();
    if (!o.readyAt) o.readyAt = o.deliveredAt;
    if (!o.pickedUpAt) o.pickedUpAt = o.deliveredAt;
    await this.settleDelivered(o, null);
    await this.logEvent(o.id, 'delivered', null, {
      by: o.deliveryType === 'pickup' ? 'pickup' : 'kitchen',
      total: Number(o.total),
      kitchenCommission: Number(o.kitchenCommission),
      bonusUsed: Number(o.bonusUsed),
    });
    await this.notify(o);
    return this.clientView(o);
  }

  /**
   * Kitchen types an order in itself (phone / walk-in client, raw materials,
   * semi-finished products…). It starts as COOKING (already accepted).
   */
  async createKitchenOrder(kitchenId: string, input: KitchenOrderInput) {
    const k = await this.kitchenSelf(kitchenId);
    const pickup = input?.deliveryType === 'pickup';
    const lines: FoodOrderItem[] = [];
    const menuLines = (input?.items ?? []).filter((l) => l?.itemId && Number(l.qty) > 0);
    if (menuLines.length) {
      const menu = await this.items.find({ where: { kitchenId, id: In(menuLines.map((l) => l.itemId)) } });
      const byId = new Map(menu.map((m) => [m.id, m]));
      for (const l of menuLines) {
        const m = byId.get(l.itemId);
        if (!m) throw new BadRequestException('Menyuda yo‘q taom bor');
        lines.push({ itemId: m.id, name: m.name, price: Number(m.price), qty: Math.min(500, Math.max(1, Math.round(Number(l.qty)))) });
      }
    }
    for (const c of input?.customItems ?? []) {
      const name = (c?.name ?? '').trim();
      const price = Number(c?.price);
      const qty = Math.min(500, Math.max(1, Math.round(Number(c?.qty) || 1)));
      if (!name) continue;
      if (!Number.isFinite(price) || price < 0) throw new BadRequestException(`"${name}" narxi noto‘g‘ri`);
      lines.push({ itemId: 'custom', name: name.slice(0, 120), price, qty });
    }
    if (!lines.length) throw new BadRequestException('Kamida bitta mahsulot kiriting');
    const itemsTotal = money(lines.reduce((s2, i) => s2 + i.price * i.qty, 0));
    const hasPoint = Number.isFinite(Number(input?.lat)) && Number.isFinite(Number(input?.lng));
    const needsCourier = !pickup && (input?.needsCourier ?? k.needsCourier);
    if (needsCourier && !hasPoint) throw new BadRequestException('Kuryer uchun mijoz manzilini xaritada belgilang');
    const lat = hasPoint ? Number(input!.lat) : k.lat;
    const lng = hasPoint ? Number(input!.lng) : k.lng;
    const q = pickup || !hasPoint ? { km: 0, fee: 0, mode: 'courier' as const } : await this.quoteFor(k, lat, lng);
    const now = new Date();
    const saved = await this.orders.save(
      this.orders.create({
        clientId: null,
        clientName: (input?.clientName ?? '').trim().slice(0, 120) || 'Mijoz',
        kitchenId,
        status: 'COOKING',
        items: lines,
        itemsTotal: itemsTotal.toFixed(2),
        deliveryFee: q.fee.toFixed(2),
        total: (itemsTotal + q.fee).toFixed(2),
        distanceKm: q.km.toFixed(2),
        lat,
        lng,
        address: (input?.address ?? '').trim().slice(0, 255) || (pickup ? 'Oshxonadan olib ketadi' : null),
        phone: (input?.phone ?? '').trim().slice(0, 32) || null,
        comment: (input?.comment ?? '').trim().slice(0, 1000) || null,
        source: 'kitchen',
        deliveryType: pickup ? 'pickup' : 'delivery',
        needsCourier,
        courierMode: q.mode,
        createdBy: 'kitchen',
        acceptedAt: now,
        prepMinutes: Math.min(180, Math.max(1, Math.round(Number(input?.prepMinutes) || k.prepMinutes))),
      }),
    );
    const full = await this.orders.findOneOrFail({ where: { id: saved.id } });
    await this.logEvent(full.id, 'created', null, {
      kitchenName: k.name,
      byKitchen: true,
      itemsCount: lines.reduce((s2, i) => s2 + i.qty, 0),
      total: Number(full.total),
      address: full.address,
      clientName: full.clientName,
      deliveryType: full.deliveryType,
      needsCourier,
    });
    await this.notify(full);
    if (needsCourier) this.startDispatch(full.id, 'personal');
    return this.clientView(full);
  }

  // ------------------------------------------------- kitchen's own couriers

  async listKitchenCouriers(kitchenId: string) {
    const rows = await this.kitchenCouriers.find({ where: { kitchenId }, relations: { driver: true }, order: { createdAt: 'ASC' } });
    return rows
      .filter((r) => r.driver)
      .map((r) => ({
        driverId: r.driverId,
        fullName: r.driver.fullName,
        phone: r.driver.phone,
        kind: r.driver.kind,
        isOnline: r.driver.isOnline,
        carPlate: r.driver.carPlate,
      }));
  }

  async addKitchenCourier(kitchenId: string, rawPhone: string) {
    const digits = (rawPhone ?? '').replace(/\D/g, '');
    if (digits.length < 9) throw new BadRequestException('Telefon raqamni to‘liq kiriting');
    const tail = digits.slice(-9);
    const [d] = (await this.ds.query(
      `SELECT id FROM drivers WHERE deleted_at IS NULL AND is_active AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = $1 LIMIT 1`,
      [tail],
    )) as { id: string }[];
    if (!d) throw new BadRequestException('Bu raqam bilan kuryer/haydovchi topilmadi — avval admin uni ro‘yxatdan o‘tkazsin');
    await this.ds.query(
      `INSERT INTO kitchen_couriers (kitchen_id, driver_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [kitchenId, d.id],
    );
    return this.listKitchenCouriers(kitchenId);
  }

  async removeKitchenCourier(kitchenId: string, driverId: string) {
    await this.kitchenCouriers.delete({ kitchenId, driverId });
    return this.listKitchenCouriers(kitchenId);
  }

  // ------------------------------------------------------- kitchen wallet

  async kitchenWallet(kitchenId: string) {
    const k = await this.kitchens.findOne({ where: { id: kitchenId } });
    if (!k) throw new NotFoundException('Oshxona topilmadi');
    return { balance: Number(k.balance), ledger: await this.balance.kitchenLedger(kitchenId, 100) };
  }

  async topUpKitchen(kitchenId: string, amount: number, note?: string | null) {
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n === 0) throw new BadRequestException('Summa noto‘g‘ri');
    await this.balance.adjustKitchen({
      kitchenId,
      amount: n,
      note: (note ?? '').trim() || (n > 0 ? 'Admin balans to‘ldirdi' : 'Admin balansdan yechdi'),
    });
    return this.kitchenWallet(kitchenId);
  }

  async kitchenReject(kitchenId: string, id: string, reason?: string) {
    const o = await this.kitchenOrder(kitchenId, id);
    if (o.status !== 'NEW') throw new BadRequestException('Faqat yangi buyurtmani rad etish mumkin');
    o.status = 'REJECTED';
    o.rejectReason = (reason ?? '').trim().slice(0, 255) || 'Oshxona qabul qila olmadi';
    o.cancelledAt = new Date();
    await this.orders.save(o);
    await this.refundBonus(o);
    await this.logEvent(o.id, 'kitchen_rejected', null, { reason: o.rejectReason });
    await this.notify(o);
    return this.clientView(o);
  }

  async kitchenReady(kitchenId: string, id: string) {
    const o = await this.kitchenOrder(kitchenId, id);
    if (o.status !== 'COOKING') throw new BadRequestException('Buyurtma tayyorlanmoqda holatida emas');
    o.status = 'READY';
    o.readyAt = new Date();
    await this.orders.save(o);
    await this.logEvent(o.id, 'ready', null, {});
    await this.notify(o);
    if (o.courierId) {
      this.realtime.emitToDriver(o.courierId, 'delivery_update', { orderId: o.id, status: o.status });
    }
    return this.clientView(o);
  }

  // =========================================================== courier side

  /**
   * Free online couriers + taxi drivers who take deliveries. In 'taxi' mode
   * (too far for couriers) only taxi drivers.
   */
  private async freeCouriers(mode: 'courier' | 'taxi' = 'courier'): Promise<Driver[]> {
    const online = (
      await this.drivers.find({ where: { isOnline: true, isActive: true, isApproved: true } })
    ).filter(
      (d) =>
        (mode === 'taxi' ? d.kind !== 'courier' : d.kind === 'courier' || d.acceptDelivery) &&
        d.currentLat != null &&
        d.currentLng != null,
    );
    if (!online.length) return [];
    const busy = (await this.ds.query(
      `SELECT driver_id AS id FROM orders WHERE driver_id IS NOT NULL AND status IN ('ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS')
       UNION SELECT courier_id FROM food_orders WHERE courier_id IS NOT NULL AND status IN ('COOKING','READY','PICKED_UP')`,
    )) as { id: string }[];
    const busyIds = new Set(busy.map((b) => b.id));
    return online.filter((d) => !busyIds.has(d.id));
  }

  private async dispatchCfg() {
    const n = async (k: 'dispatch_offer_seconds' | 'dispatch_sequential_count', d: number, lo: number, hi: number) => {
      const raw = (await this.settings.get(k)).trim();
      const v = raw === '' ? d : Number(raw);
      return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
    };
    return {
      offerSeconds: await n('dispatch_offer_seconds', 15, 5, 60),
      sequential: await n('dispatch_sequential_count', 3, 0, 20),
      radius: Number(this.config.get('ORDER_BROADCAST_RADIUS_KM') ?? 5) * 1.5,
    };
  }

  private startDispatch(orderId: string, stage: 'own' | 'personal' | 'all') {
    if (this.dispatch.has(orderId)) return;
    this.dispatch.set(orderId, {
      stage,
      offeredTo: null,
      offeredAt: Date.now(),
      tried: new Set(),
      timer: null,
      retry: null,
      rounds: 0,
      offerSeconds: 15,
      allAt: null,
      allDrivers: new Set(),
      ringAt: new Map(),
    });
    void this.offerNext(orderId).catch((e) => this.logger.warn(`delivery dispatch ${orderId}: ${(e as Error).message}`));
  }

  private endDispatch(orderId: string) {
    const st = this.dispatch.get(orderId);
    if (st?.timer) clearTimeout(st.timer);
    if (st?.retry) clearTimeout(st.retry);
    this.dispatch.delete(orderId);
  }

  private label(d: Pick<Driver, 'fullName' | 'phone' | 'carPlate' | 'kind'> | null | undefined) {
    return d ? { driverName: d.fullName, driverPhone: d.phone, carPlate: d.carPlate ?? null, courierKind: d.kind } : {};
  }

  private async offerPayload(o: FoodOrder, k: Kitchen, km: number, mode: 'personal' | 'all', offerSeconds: number) {
    return {
      kind: 'delivery',
      orderId: o.id,
      number: o.number,
      mode,
      offerSeconds,
      pickup: { lat: k.lat, lng: k.lng, address: `🍽 ${k.name}${k.address ? ' — ' + k.address : ''}` },
      destination: { lat: o.lat, lng: o.lng, address: o.address },
      distanceFromDriver: Number(km.toFixed(2)),
      estimatedKm: o.distanceKm != null ? Number(o.distanceKm) : null,
      estimatedPrice: Number(o.deliveryFee),
      kitchenName: k.name,
      itemsCount: (o.items ?? []).reduce((s, i) => s + i.qty, 0),
      total: Number(o.total),
      readyAt: o.readyAt,
      prepMinutes: o.prepMinutes,
      createdAt: o.createdAt,
    };
  }

  private async offerNext(orderId: string): Promise<void> {
    const st = this.dispatch.get(orderId);
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
    const o = await this.orders.findOne({ where: { id: orderId } });
    if (!o || o.courierId || !['COOKING', 'READY'].includes(o.status)) {
      this.endDispatch(orderId);
      return;
    }
    const k = await this.kitchens.findOneOrFail({ where: { id: o.kitchenId } });
    const cfg = await this.dispatchCfg();
    st.offerSeconds = cfg.offerSeconds;
    const mode = o.courierMode === 'taxi' ? 'taxi' : 'courier';

    // 1) The kitchen's own couriers ring first (all of them at once).
    if (st.stage === 'personal' && st.rounds === 0 && st.tried.size === 0 && mode === 'courier') {
      const ownIds = new Set((await this.kitchenCouriers.find({ where: { kitchenId: k.id } })).map((r) => r.driverId));
      const own = ownIds.size ? (await this.freeCouriers('courier')).filter((d) => ownIds.has(d.id)) : [];
      if (own.length) {
        st.stage = 'own';
        st.offeredAt = Date.now();
        st.allDrivers = new Set(own.map((d) => d.id));
        own.forEach((d) => st.tried.add(d.id));
        for (const d of own) {
          const km = haversineKm(k.lat, k.lng, d.currentLat!, d.currentLng!);
          this.realtime.emitToDriver(d.id, 'new_order', await this.offerPayload(o, k, km, 'personal', cfg.offerSeconds));
        }
        await this.logEvent(orderId, 'offered_own', null, {
          drivers: own.length,
          names: own.map((d) => d.fullName),
          seconds: cfg.offerSeconds,
          kitchenName: k.name,
        });
        st.timer = setTimeout(() => {
          const cur = this.dispatch.get(orderId);
          if (!cur || cur.stage !== 'own') return;
          for (const id of cur.allDrivers) this.realtime.emitToDriver(id, 'order_offer_expired', { orderId });
          void this.logEvent(orderId, 'expired', null, { own: true, drivers: cur.allDrivers.size })
            .then(() => {
              // Nobody of the kitchen's own took it → it falls to the middle.
              cur.stage = 'all';
              cur.rounds = 0;
              return this.broadcast(orderId);
            })
            .catch(() => undefined);
        }, (cfg.offerSeconds + 2) * 1000);
        return;
      }
    }

    if (st.stage === 'personal' && st.tried.size < cfg.sequential) {
      const next = (await this.freeCouriers(mode))
        .filter((d) => !st.tried.has(d.id))
        .map((d) => ({ d, km: haversineKm(k.lat, k.lng, d.currentLat!, d.currentLng!) }))
        .filter((x) => x.km <= cfg.radius)
        // Dedicated couriers first, then by distance to the kitchen.
        .sort((a, b) => (a.d.kind !== b.d.kind ? (a.d.kind === 'courier' ? -1 : 1) : a.km - b.km))[0];
      if (next) {
        st.offeredTo = next.d.id;
        st.offeredAt = Date.now();
        st.tried.add(next.d.id);
        await this.logEvent(orderId, 'offered', next.d.id, {
          ...this.label(next.d),
          km: Number(next.km.toFixed(2)),
          seconds: cfg.offerSeconds,
          attempt: st.tried.size,
        });
        this.realtime.emitToDriver(next.d.id, 'new_order', await this.offerPayload(o, k, next.km, 'personal', cfg.offerSeconds));
        st.timer = setTimeout(() => {
          const cur = this.dispatch.get(orderId);
          if (!cur || cur.offeredTo !== next.d.id) return;
          const rangAt = cur.ringAt.get(next.d.id);
          cur.offeredTo = null;
          this.realtime.emitToDriver(next.d.id, 'order_offer_expired', { orderId });
          void this.logEvent(orderId, 'expired', next.d.id, {
            ...this.label(next.d),
            waitedSec: Math.round((Date.now() - cur.offeredAt) / 1000),
            rangSec: rangAt ? Math.round((Date.now() - rangAt) / 1000) : 0,
            delivered: !!rangAt,
          })
            .then(() => this.offerNext(orderId))
            .catch(() => undefined);
        }, (cfg.offerSeconds + 2) * 1000);
        return;
      }
    }

    await this.broadcast(orderId);
  }

  /** Falls to the middle: ring every free courier/driver at once. */
  private async broadcast(orderId: string): Promise<void> {
    const st = this.dispatch.get(orderId);
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
    const o = await this.orders.findOne({ where: { id: orderId } });
    if (!o || o.courierId || !['COOKING', 'READY'].includes(o.status)) {
      this.endDispatch(orderId);
      return;
    }
    const k = await this.kitchens.findOneOrFail({ where: { id: o.kitchenId } });
    const cfg = await this.dispatchCfg();
    const mode = o.courierMode === 'taxi' ? 'taxi' : 'courier';
    st.stage = 'all';
    st.offeredTo = null;
    st.allAt = Date.now();
    st.rounds++;
    const everyone = await this.freeCouriers(mode);
    st.allDrivers = new Set(everyone.map((d) => d.id));
    for (const d of everyone) {
      const km = haversineKm(k.lat, k.lng, d.currentLat!, d.currentLng!);
      this.realtime.emitToDriver(d.id, 'new_order', await this.offerPayload(o, k, km, 'all', cfg.offerSeconds));
    }
    await this.logEvent(orderId, everyone.length ? 'broadcast' : 'no_drivers', null, {
      drivers: everyone.length,
      names: everyone.slice(0, 30).map((d) => d.fullName),
      seconds: cfg.offerSeconds,
      round: st.rounds,
      kitchenName: k.name,
      mode,
    });
    // Still nobody: ring everyone again every minute, for up to 20 minutes.
    if (st.rounds < 20) {
      st.retry = setTimeout(() => {
        const cur = this.dispatch.get(orderId);
        if (cur) void this.broadcast(orderId).catch(() => undefined);
      }, 60_000);
    }
  }

  private canTake(driverId: string, orderId: string) {
    const st = this.dispatch.get(orderId);
    if (!st || st.stage === 'all') return true;
    if (st.stage === 'own') return st.allDrivers.has(driverId);
    return st.offeredTo === driverId;
  }

  async declineOffer(driverId: string, orderId: string) {
    const st = this.dispatch.get(orderId);
    if (!st) return { ok: true };
    const d = await this.drivers.findOne({ where: { id: driverId } });
    const rangAt = st.ringAt.get(driverId);
    if (st.stage === 'personal' && st.offeredTo === driverId) {
      await this.logEvent(orderId, 'declined', driverId, {
        ...this.label(d),
        afterSec: Math.round((Date.now() - st.offeredAt) / 1000),
        rangSec: rangAt ? Math.round((Date.now() - rangAt) / 1000) : 0,
      });
      st.offeredTo = null;
      await this.offerNext(orderId);
    } else if (st.stage === 'all' && st.allDrivers.has(driverId)) {
      await this.logEvent(orderId, 'declined', driverId, {
        ...this.label(d),
        afterSec: st.allAt ? Math.round((Date.now() - st.allAt) / 1000) : null,
        stage: 'all',
      });
    }
    return { ok: true };
  }

  async markRinging(driverId: string, orderId: string, via: string) {
    const st = this.dispatch.get(orderId);
    if (!st || st.ringAt.has(driverId)) return { ok: true };
    if (st.stage === 'personal' ? st.offeredTo !== driverId : !st.allDrivers.has(driverId)) return { ok: true };
    st.ringAt.set(driverId, Date.now());
    // ('own' stage: allDrivers holds the kitchen's own couriers)
    const d = await this.drivers.findOne({ where: { id: driverId } });
    await this.logEvent(orderId, 'ringing', driverId, {
      ...this.label(d),
      via: String(via || 'app').slice(0, 16),
      afterSec: Math.round((Date.now() - (st.stage === 'all' && st.allAt ? st.allAt : st.offeredAt)) / 1000),
      stage: st.stage,
    });
    return { ok: true };
  }

  /** Delivery offer ringing for this driver right now (app reopened). */
  async currentOffer(driverId: string) {
    const now = Date.now();
    for (const [orderId, st] of this.dispatch) {
      let at: number | null = null;
      if (st.stage === 'personal' && st.offeredTo === driverId) at = st.offeredAt;
      if (st.stage === 'all' && st.allAt && st.allDrivers.has(driverId)) at = st.allAt;
      if (st.stage === 'own' && st.allDrivers.has(driverId)) at = st.offeredAt;
      if (at == null) continue;
      const remaining = Math.ceil(st.offerSeconds - (now - at) / 1000);
      if (remaining <= 1) continue;
      const o = await this.orders.findOne({ where: { id: orderId } });
      if (!o || o.courierId) continue;
      const k = await this.kitchens.findOneOrFail({ where: { id: o.kitchenId } });
      const d = await this.drivers.findOne({ where: { id: driverId } });
      const km = d?.currentLat != null && d.currentLng != null ? haversineKm(k.lat, k.lng, d.currentLat, d.currentLng) : 0;
      return {
        ...(await this.offerPayload(o, k, km, st.stage === 'all' ? 'all' : 'personal', st.offerSeconds)),
        remainingSeconds: remaining,
      };
    }
    return null;
  }

  /** Unassigned deliveries this driver may take from the list. */
  async availableForDriver(driverId: string) {
    const d = await this.drivers.findOne({ where: { id: driverId } });
    if (!d || !(d.kind === 'courier' || d.acceptDelivery)) return [];
    const rows = await this.orders.find({
      where: { status: In(['COOKING', 'READY']), courierId: IsNull(), needsCourier: true },
      relations: { kitchen: true },
      order: { createdAt: 'ASC' },
      take: 30,
    });
    const cfg = await this.dispatchCfg();
    const out: any[] = [];
    for (const o of rows) {
      if (!this.canTake(driverId, o.id)) continue;
      if (o.courierMode === 'taxi' && d.kind === 'courier') continue;
      const km = d.currentLat != null && d.currentLng != null ? haversineKm(o.kitchen.lat, o.kitchen.lng, d.currentLat, d.currentLng) : 0;
      if (d.currentLat != null && km > cfg.radius * 2) continue;
      out.push(await this.offerPayload(o, o.kitchen, km, 'all', cfg.offerSeconds));
    }
    return out;
  }

  async courierAccept(driverId: string, id: string) {
    const d = await this.drivers.findOne({ where: { id: driverId } });
    if (!d || !d.isActive || !d.isApproved) throw new BadRequestException('Hisobingiz faol emas');
    if (!(d.kind === 'courier' || d.acceptDelivery)) throw new BadRequestException('Siz yetkazish buyurtmalarini olmaysiz');
    if (!this.canTake(driverId, id)) throw new BadRequestException('Bu buyurtma hozir boshqa (yaqinroq) kuryerga taklif qilingan');
    const pre = await this.orders.findOne({ where: { id } });
    if (pre?.courierMode === 'taxi' && d.kind === 'courier') {
      throw new BadRequestException('Bu uzoq manzil — faqat taksi haydovchilari uchun');
    }
    if (pre && !pre.needsCourier) throw new BadRequestException('Bu buyurtmani oshxonaning o‘zi yetkazadi');
    const [busy] = (await this.ds.query(
      `SELECT 1 FROM orders WHERE driver_id = $1 AND status IN ('ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS')
       UNION ALL SELECT 1 FROM food_orders WHERE courier_id = $1 AND status IN ('COOKING','READY','PICKED_UP') LIMIT 1`,
      [driverId],
    )) as any[];
    if (busy) throw new BadRequestException('Sizda faol buyurtma bor — avval uni yakunlang');
    const res = await this.orders
      .createQueryBuilder()
      .update(FoodOrder)
      .set({ courierId: driverId, courierAssignedAt: () => 'now()' })
      .where(`id = :id AND courier_id IS NULL AND status IN ('COOKING','READY')`, { id })
      .execute();
    if (!res.affected) throw new BadRequestException('Buyurtmani boshqa kuryer oldi yoki u bekor qilingan');
    const st = this.dispatch.get(id);
    const since = st ? (st.stage === 'all' && st.allAt ? st.allAt : st.offeredAt) : null;
    const rangAt = st?.ringAt.get(driverId);
    this.endDispatch(id);
    this.realtime.emitToAllDrivers('order_taken', { orderId: id });
    await this.logEvent(id, 'accepted', driverId, {
      ...this.label(d),
      stage: st?.stage ?? 'list',
      afterSec: since ? Math.round((Date.now() - since) / 1000) : null,
      rangSec: rangAt ? Math.round((Date.now() - rangAt) / 1000) : 0,
    });
    const o = await this.orders.findOneOrFail({ where: { id }, relations: { kitchen: true, courier: true } });
    await this.notify(o);
    return this.courierView(o);
  }

  async courierActive(driverId: string) {
    const o = await this.orders.findOne({
      where: { courierId: driverId, status: In(ACTIVE_COURIER) },
      relations: { kitchen: true, courier: true, client: true },
      order: { createdAt: 'DESC' },
    });
    return o ? this.courierView(o) : null;
  }

  async courierHistory(driverId: string) {
    const rows = await this.orders.find({
      where: { courierId: driverId },
      relations: { kitchen: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((o) => this.courierView(o));
  }

  courierView(o: FoodOrder) {
    return {
      ...this.clientView(o),
      clientName: o.client?.firstName ?? null,
      courierCommission: Number(o.courierCommission),
    };
  }

  private async courierOrder(driverId: string, id: string) {
    const o = await this.orders.findOne({ where: { id, courierId: driverId }, relations: { kitchen: true, courier: true, client: true } });
    if (!o) throw new NotFoundException('Buyurtma topilmadi');
    return o;
  }

  async courierPickedUp(driverId: string, id: string) {
    const o = await this.courierOrder(driverId, id);
    if (!['COOKING', 'READY'].includes(o.status)) throw new BadRequestException('Buyurtmani hozir olib bo‘lmaydi');
    o.status = 'PICKED_UP';
    o.pickedUpAt = new Date();
    if (!o.readyAt) o.readyAt = o.pickedUpAt;
    await this.orders.save(o);
    await this.logEvent(o.id, 'picked_up', driverId, this.label(o.courier));
    await this.notify(o);
    return this.courierView(o);
  }

  async courierDelivered(driverId: string, id: string) {
    const o = await this.courierOrder(driverId, id);
    if (o.status === 'DELIVERED') return this.courierView(o);
    if (o.status !== 'PICKED_UP') throw new BadRequestException('Avval “Buyurtmani oldim” ni bosing');
    o.status = 'DELIVERED';
    o.deliveredAt = new Date();
    await this.settleDelivered(o, driverId);
    await this.logEvent(o.id, 'delivered', driverId, {
      ...this.label(o.courier),
      total: Number(o.total),
      deliveryFee: Number(o.deliveryFee),
      courierCommission: Number(o.courierCommission),
      kitchenCommission: Number(o.kitchenCommission),
      bonusUsed: Number(o.bonusUsed),
    });
    await this.notify(o);
    return this.courierView(o);
  }

  /**
   * Money at delivery: courier commission (of the delivery fee) from the
   * courier's balance; kitchen commission (of the food) from the kitchen's
   * balance; the bonus the client used is paid to whoever collected less
   * cash (the courier, or the kitchen when it delivered / for pickup).
   */
  private async settleDelivered(o: FoodOrder, courierId: string | null) {
    const s = await this.feeSettings();
    const k = await this.kitchens.findOneOrFail({ where: { id: o.kitchenId } });
    const courierCommission = courierId ? Math.round((Number(o.deliveryFee) * s.commissionPct) / 100) : 0;
    const kitchenCommission = Math.round((Number(o.itemsTotal) * Number(k.commissionPercent)) / 100);
    o.courierCommission = courierCommission.toFixed(2);
    o.kitchenCommission = kitchenCommission.toFixed(2);
    await this.orders.save(o);
    const tag = `#${o.number}`;
    if (courierId && courierCommission > 0) {
      await this.balance
        .adjust({
          driverId: courierId,
          amount: -courierCommission,
          type: BalanceTxType.COMMISSION,
          allowNegative: true,
          note: `Yetkazish ${tag}: haq ${Number(o.deliveryFee)} so‘m, komissiya ${courierCommission}`,
        })
        .catch((e) => this.logger.error(`delivery commission failed ${tag}: ${(e as Error).message}`));
    }
    if (kitchenCommission > 0) {
      await this.balance
        .adjustKitchen({ kitchenId: k.id, amount: -kitchenCommission, allowNegative: true, note: `Buyurtma ${tag}: komissiya ${k.commissionPercent}%` })
        .catch((e) => this.logger.error(`kitchen commission failed ${tag}: ${(e as Error).message}`));
    }
    const bonus = Number(o.bonusUsed ?? 0);
    if (bonus > 0) {
      const p = courierId
        ? this.balance.adjust({ driverId: courierId, amount: bonus, type: BalanceTxType.BONUS, note: `Mijoz bonusi, ovqat ${tag}` })
        : this.balance.adjustKitchen({ kitchenId: k.id, amount: bonus, note: `Mijoz bonusi, buyurtma ${tag}` });
      await p.catch((e) => this.logger.error(`bonus payout failed ${tag}: ${(e as Error).message}`));
    }
  }

  /** Bonus held at order time goes back to the client. */
  private async refundBonus(o: FoodOrder) {
    const bonus = Number(o.bonusUsed ?? 0);
    if (bonus <= 0 || !o.clientId) return;
    await this.balance
      .adjustClient({ clientId: o.clientId, amount: bonus, note: `Ovqat #${o.number} bekor — bonus qaytdi` })
      .catch((e) => this.logger.error(`bonus refund failed #${o.number}: ${(e as Error).message}`));
    await this.orders.update(o.id, { bonusUsed: '0.00' });
    o.bonusUsed = '0.00';
  }

  /** Courier gives the order back before pickup → it is dispatched again. */
  async courierRelease(driverId: string, id: string) {
    const o = await this.courierOrder(driverId, id);
    if (!['COOKING', 'READY'].includes(o.status)) throw new BadRequestException('Olingan buyurtmani qaytarib bo‘lmaydi');
    await this.orders.update(o.id, { courierId: null, courierAssignedAt: null });
    await this.logEvent(o.id, 'released', driverId, this.label(o.courier));
    const fresh = await this.orders.findOneOrFail({ where: { id }, relations: { kitchen: true } });
    await this.notify(fresh);
    this.startDispatch(o.id, 'personal');
    return { ok: true };
  }

  // =================================================================== admin

  async adminOrders(filter: { status?: string; kitchenId?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 30));
    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.kitchen', 'k')
      .leftJoinAndSelect('o.client', 'c')
      .leftJoinAndSelect('o.courier', 'd')
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (filter.status === 'active') qb.andWhere(`o.status IN ('NEW','COOKING','READY','PICKED_UP')`);
    else if (filter.status) qb.andWhere('o.status = :s', { s: filter.status });
    if (filter.kitchenId) qb.andWhere('o.kitchenId = :k', { k: filter.kitchenId });
    const [rows, total] = await qb.getManyAndCount();
    return {
      page,
      pageSize,
      total,
      items: rows.map((o) => ({
        ...this.clientView(o),
        clientName: o.client?.firstName ?? null,
        clientPhone: o.client?.phonePrimary ?? null,
        courierCommission: Number(o.courierCommission),
        kitchenCommission: Number(o.kitchenCommission),
        dispatchStage: this.dispatch.get(o.id)?.stage ?? null,
      })),
    };
  }

  async adminCancel(id: string) {
    const o = await this.orders.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Buyurtma topilmadi');
    if (FINAL.includes(o.status)) throw new BadRequestException('Buyurtma yakunlangan');
    return this.clientView(await this.finishCancel(o, 'admin'));
  }

  private async finishCancel(o: FoodOrder, by: 'client' | 'admin') {
    const prev = o.status;
    o.status = 'CANCELLED';
    o.cancelledBy = by;
    o.cancelledAt = new Date();
    await this.orders.save(o);
    await this.refundBonus(o);
    this.endDispatch(o.id);
    this.realtime.emitToAllDrivers('order_taken', { orderId: o.id });
    if (o.courierId) this.realtime.emitToDriver(o.courierId, 'delivery_update', { orderId: o.id, status: 'CANCELLED' });
    await this.logEvent(o.id, 'cancelled', o.courierId, { by, atStatus: prev });
    await this.notify(o);
    return o;
  }

  eventsFor(foodOrderId: string) {
    return this.events.find({ where: { foodOrderId }, order: { createdAt: 'ASC' }, take: 500 });
  }

  async adminSummary() {
    const [r] = (await this.ds.query(`
      SELECT
        count(*) FILTER (WHERE created_at > date_trunc('day', now()))::int AS today,
        count(*) FILTER (WHERE status IN ('NEW','COOKING','READY','PICKED_UP'))::int AS active,
        count(*) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('day', now()))::int AS delivered_today,
        coalesce(sum(total) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('day', now())), 0)::float AS turnover_today,
        coalesce(sum(courier_commission + kitchen_commission) FILTER (WHERE status = 'DELIVERED' AND created_at > date_trunc('month', now())), 0)::float AS commission_month
      FROM food_orders`)) as any[];
    return r;
  }

  // ========================================================== notifications

  async logEvent(foodOrderId: string, kind: string, driverId: string | null = null, data: Record<string, unknown> = {}) {
    try {
      const row = await this.events.save(this.events.create({ foodOrderId, kind, driverId, data }));
      this.realtime.emitToAdmin('food_order_event', row);
    } catch (e) {
      this.logger.warn(`food event ${kind} not saved: ${(e as Error).message}`);
    }
  }

  /** Push the new state to the client app, the bot, the admin and the kitchen. */
  private async notify(order: FoodOrder) {
    const o = order.kitchen && order.courier !== undefined
      ? order
      : await this.orders.findOneOrFail({ where: { id: order.id }, relations: { kitchen: true, courier: true } });
    const view = this.clientView(o);
    this.realtime.emitToClient(o.clientId, 'food_order_update', view);
    this.realtime.emitToAdmin('food_order_update', view);
    this.foodEvents.emitStatus({
      order: o,
      kitchenName: o.kitchen?.name ?? '',
      courier: o.courier
        ? { fullName: o.courier.fullName, phone: o.courier.phone, carModel: o.courier.carModel, carPlate: o.courier.carPlate }
        : null,
    });
  }
}
