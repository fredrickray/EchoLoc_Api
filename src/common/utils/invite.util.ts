import { randomInt } from 'crypto';

import { INVITE_CODE_EXPIRY_HOURS } from '../constants/sharing.constants';
import { addMinutes } from './crypto.util';

export function generateInviteCode(): string {
  return `ECH-${randomInt(1000, 9999)}`;
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function getInviteCodeExpiry(from = new Date()): Date {
  return addMinutes(from, INVITE_CODE_EXPIRY_HOURS * 60);
}
