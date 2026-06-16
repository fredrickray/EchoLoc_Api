import {
  DEFAULT_DURATION_ID,
  DURATION_MINUTES,
  type DurationId,
} from '../constants/sharing.constants';
import { addMinutes } from './crypto.util';

export function isValidDurationId(value: string): value is DurationId {
  return value in DURATION_MINUTES;
}

export function computeEndsAt(durationId: DurationId, from = new Date()): Date {
  return addMinutes(from, DURATION_MINUTES[durationId]);
}

export function resolveDurationId(value?: string): DurationId {
  if (value && isValidDurationId(value)) {
    return value;
  }
  return DEFAULT_DURATION_ID;
}

export function formatTimeRemaining(endsAt: Date, now = new Date()): string {
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
  const totalMinutes = Math.ceil(remainingMs / 60_000);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
  }

  return `${totalMinutes}m left`;
}

export function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
