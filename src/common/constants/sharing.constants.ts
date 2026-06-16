export const DURATION_IDS = ['15m', '30m', '1h', '2h', '4h', '8h'] as const;

export type DurationId = (typeof DURATION_IDS)[number];

export const DURATION_MINUTES: Record<DurationId, number> = {
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '8h': 480,
};

export const DEFAULT_DURATION_ID: DurationId = '1h';
export const INVITE_CODE_EXPIRY_HOURS = 24;
