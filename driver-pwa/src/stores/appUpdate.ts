import { create } from 'zustand';

/** Admin "please update" broadcast (socket `announcement` with kind 'update'). */
export interface UpdateAnnouncement {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  version?: string | null;
}

interface AppUpdateState {
  /** Installed app version ('1.0.6', '1.0.5', '≤1.0.4', 'web', 'unknown'). */
  installed: string | null;
  platform: 'android' | 'web' | null;
  /** Latest APK from /downloads/version.json. */
  latest: string | null;
  announcement: UpdateAnnouncement | null;
  set: (p: Partial<Pick<AppUpdateState, 'installed' | 'platform' | 'latest'>>) => void;
  showAnnouncement: (a: UpdateAnnouncement | null) => void;
}

// Not persisted: re-detected once per app start.
export const useAppUpdateStore = create<AppUpdateState>()((set) => ({
  installed: null,
  platform: null,
  latest: null,
  announcement: null,
  set: (p) => set(p),
  showAnnouncement: (announcement) => set({ announcement }),
}));
