/** Simple in-memory state machine for the registration flow. */
export type RegStep =
  | 'idle'
  | 'awaiting_primary_phone'
  | 'awaiting_secondary_phone'
  | 'registered'
  | 'awaiting_pickup_location';

interface SessionData {
  step: RegStep;
  firstName?: string;
  phonePrimary?: string;
  refCode?: string | null;
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
