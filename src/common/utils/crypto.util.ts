import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function generateVerificationCode(): string {
  return randomInt(100000, 999999).toString();
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_PALETTES = [
  { bg: '#E8F5F3', color: '#0D9488' },
  { bg: '#EEF2FF', color: '#4F46E5' },
  { bg: '#FFF7ED', color: '#EA580C' },
  { bg: '#FDF2F8', color: '#DB2777' },
  { bg: '#F0FDF4', color: '#16A34A' },
] as const;

export function pickAvatarPalette(seed: string): {
  avatarBg: string;
  avatarColor: string;
} {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i)) % AVATAR_PALETTES.length;
  }
  return {
    avatarBg: AVATAR_PALETTES[hash].bg,
    avatarColor: AVATAR_PALETTES[hash].color,
  };
}

export function slugifyHandle(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1_000;
    case 'm':
      return value * 60_000;
    case 'h':
      return value * 3_600_000;
    case 'd':
      return value * 86_400_000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}
