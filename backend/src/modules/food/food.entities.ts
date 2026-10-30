import {
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../client/client.entity';
import { Driver } from '../driver/driver.entity';

/** A restaurant / kitchen. Logs into the panel with username + password. */
@Entity('kitchens')
export class Kitchen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 64, unique: true })
  username: string;

  @Column({ name: 'password_hash', length: 255, select: false })
  passwordHash: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Accepting orders right now (the kitchen toggles it in its panel). */
  @Column({ name: 'is_open', default: true })
  isOpen: boolean;

  @Column({ name: 'prep_minutes', type: 'int', default: 20 })
  prepMinutes: number;

  @Column({ name: 'min_order', type: 'numeric', precision: 14, scale: 2, default: 0 })
  minOrder: string;

  /** Platform commission from the kitchen's food sales (for settlements). */
  @Column({ name: 'commission_percent', type: 'numeric', precision: 5, scale: 2, default: 10 })
  commissionPercent: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  /** Closed-loop wallet: admin tops it up, kitchen commission is taken from it. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  balance: string;

  /** Default for new orders: call a courier (false = the kitchen delivers itself). */
  @Column({ name: 'needs_courier', default: true })
  needsCourier: boolean;

  /** 'custom' = per-km price below (or the global one); 'taxi' = taxi tariff. */
  @Column({ name: 'delivery_pricing', type: 'varchar', length: 8, default: 'custom' })
  deliveryPricing: 'custom' | 'taxi';

  @Column({ name: 'delivery_base_fee', type: 'numeric', precision: 14, scale: 2, nullable: true })
  deliveryBaseFee: string | null;

  @Column({ name: 'delivery_free_km', type: 'numeric', precision: 6, scale: 2, nullable: true })
  deliveryFreeKm: string | null;

  @Column({ name: 'delivery_per_km', type: 'numeric', precision: 14, scale: 2, nullable: true })
  deliveryPerKm: string | null;

  /** Farther than this → delivered by a taxi at the taxi tariff (null = no limit). */
  @Column({ name: 'courier_max_km', type: 'numeric', precision: 6, scale: 2, nullable: true })
  courierMaxKm: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** Couriers a kitchen "hired": its orders ring for them first. */
@Entity('kitchen_couriers')
export class KitchenCourier {
  @PrimaryColumn({ name: 'kitchen_id', type: 'uuid' })
  kitchenId: string;

  @PrimaryColumn({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('menu_categories')
export class MenuCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'kitchen_id', type: 'uuid' })
  kitchenId: string;

  @Column({ length: 80 })
  name: string;

  @Column({ type: 'int', default: 0 })
  sort: number;
}

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'kitchen_id', type: 'uuid' })
  kitchenId: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  price: string;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;

  /** 'dish' (taom), 'raw' (xom ashyo), 'semi' (yarim tayyor mahsulot). */
  @Column({ type: 'varchar', length: 8, default: 'dish' })
  kind: 'dish' | 'raw' | 'semi';

  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/**
 * NEW (waiting for the kitchen) → COOKING (kitchen accepted; courier search
 * starts) → READY → PICKED_UP (courier has it) → DELIVERED.
 * REJECTED (kitchen said no) / CANCELLED (client before cooking, or admin).
 */
export type FoodOrderStatus =
  | 'NEW'
  | 'COOKING'
  | 'READY'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export interface FoodOrderItem {
  itemId: string;
  name: string;
  price: number;
  qty: number;
}

@Entity('food_orders')
export class FoodOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short human number shown to the kitchen, courier and client (#123). */
  @Column({ type: 'int', insert: false, update: false })
  number: number;

  /** Null when the kitchen typed the order in for a walk-in / phone client. */
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @Column({ name: 'client_name', type: 'varchar', length: 120, nullable: true })
  clientName: string | null;

  /** 'delivery' or 'pickup' (client collects it at the kitchen). */
  @Column({ name: 'delivery_type', type: 'varchar', length: 10, default: 'delivery' })
  deliveryType: 'delivery' | 'pickup';

  /** false = the kitchen delivers with its own people (no courier dispatch). */
  @Column({ name: 'needs_courier', default: true })
  needsCourier: boolean;

  /** 'courier' (couriers + taxis that take deliveries) or 'taxi' (far: taxis only, taxi tariff). */
  @Column({ name: 'courier_mode', type: 'varchar', length: 8, default: 'courier' })
  courierMode: 'courier' | 'taxi';

  /** Part paid from the client's bonus balance (cash due = total − bonusUsed). */
  @Column({ name: 'bonus_used', type: 'numeric', precision: 14, scale: 2, default: 0 })
  bonusUsed: string;

  /** Orders placed together from several kitchens share a group id. */
  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  /** 'client' or 'kitchen' (typed in by the kitchen). */
  @Column({ name: 'created_by', type: 'varchar', length: 10, default: 'client' })
  createdBy: 'client' | 'kitchen';

  @Column({ name: 'kitchen_id', type: 'uuid' })
  kitchenId: string;

  @ManyToOne(() => Kitchen)
  @JoinColumn({ name: 'kitchen_id' })
  kitchen: Kitchen;

  @Column({ name: 'courier_id', type: 'uuid', nullable: true })
  courierId: string | null;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'courier_id' })
  courier: Driver | null;

  @Column({ type: 'varchar', length: 16, default: 'NEW' })
  status: FoodOrderStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items: FoodOrderItem[];

  @Column({ name: 'items_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  itemsTotal: string;

  @Column({ name: 'delivery_fee', type: 'numeric', precision: 14, scale: 2, default: 0 })
  deliveryFee: string;

  /** Cash the courier collects from the client (food + delivery). */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ name: 'distance_km', type: 'numeric', precision: 8, scale: 2, nullable: true })
  distanceKm: string | null;

  @Column({ name: 'courier_commission', type: 'numeric', precision: 14, scale: 2, default: 0 })
  courierCommission: string;

  @Column({ name: 'kitchen_commission', type: 'numeric', precision: 14, scale: 2, default: 0 })
  kitchenCommission: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'varchar', length: 8, default: 'app' })
  source: string;

  @Column({ name: 'prep_minutes', type: 'int', nullable: true })
  prepMinutes: number | null;

  @Column({ name: 'reject_reason', type: 'varchar', length: 255, nullable: true })
  rejectReason: string | null;

  @Column({ name: 'cancelled_by', type: 'varchar', length: 16, nullable: true })
  cancelledBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  readyAt: Date | null;

  @Column({ name: 'courier_assigned_at', type: 'timestamptz', nullable: true })
  courierAssignedAt: Date | null;

  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;
}

@Entity('food_order_events')
export class FoodOrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'food_order_id', type: 'uuid' })
  foodOrderId: string;

  @Column({ type: 'varchar', length: 32 })
  kind: string;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
