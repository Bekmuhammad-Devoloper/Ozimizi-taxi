/** Simple in-memory state machine for the registration flow. */
export type RegStep =
  | 'idle'
  | 'awaiting_primary_phone'
  | 'awaiting_secondary_phone'
  | 'registered'
  | 'awaiting_pickup_location'
  | 'awaiting_promo_code'
  | 'awaiting_emoji_ids'
  // Client typing how much of a finished ride to pay from bonus
  | 'awaiting_bonus_amount'
  // "Haydovchi bo‘lish" questionnaire, one step per field
  | 'da_full_name'
  | 'da_phone'
  | 'da_car_model'
  | 'da_car_color'
  | 'da_car_plate'
  | 'da_car_year'
  | 'da_self_employed'
  | 'da_license_photo'
  | 'da_tech_passport_photo'
  | 'da_car_photo'
  | 'da_selfie_photo'
  | 'da_confirm'
  // Free-form chat with the admin about the submitted application
  | 'driver_chat'
  // "Admin bilan aloqa": the message lands in the admin panel inbox
  | 'admin_chat';

export interface DriverApplicationDraft {
  fullName?: string;
  phone?: string;
  carModel?: string;
  carColor?: string;
  carPlate?: string;
  carYear?: string | null;
  selfEmployed?: boolean | null;
  licensePhotoUrl?: string;
  techPassportPhotoUrl?: string;
  carPhotoUrl?: string;
  selfiePhotoUrl?: string;
}

interface SessionData {
  step: RegStep;
  firstName?: string;
  phonePrimary?: string;
  refCode?: string | null;
  draft?: DriverApplicationDraft;
  chatApplicationId?: string;
  bonusOrderId?: string;
}

export class SessionStore {
  private map = new Map<number, SessionData>();

  get(userId: number): SessionData {
    if (!this.map.has(userId)) {
      this.map.set(userId, { step: 'idle' });
    }
    return this.map.get(userId)!;
  }

  set(userId: number, patch: Partial<SessionData>) {
    const curr = this.get(userId);
    this.map.set(userId, { ...curr, ...patch });
  }

  reset(userId: number) {
    this.map.set(userId, { step: 'idle' });
  }
}
