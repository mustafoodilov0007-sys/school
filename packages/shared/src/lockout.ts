/**
 * Ketma-ket noto'g'ri ID kiritishdan himoya (toza funksiya; holat DB'dagi login_attempts'dan olinadi).
 *
 * Qoida: ketma-ket `maxFailures` ta xato -> `lockSeconds` davomida blok.
 * Blok davomida urinishlar qabul qilinmaydi (va yozilmaydi). Blok tugagach hisoblagich noldan boshlanadi.
 * Muvaffaqiyatli urinish seriyani nolga tushiradi.
 */
export interface AttemptRecord {
  at: Date;
  success: boolean;
}

export interface LockoutConfig {
  maxFailures: number;
  lockSeconds: number;
}

export interface LockoutState {
  locked: boolean;
  lockedUntil: Date | null;
  /** Joriy ketma-ket xatolar soni (blokdan keyin 0) */
  streak: number;
  /** Blok boshlanishigacha qolgan urinishlar */
  attemptsLeft: number;
  retryAfterSeconds: number;
}

export const DEFAULT_LOCKOUT: LockoutConfig = { maxFailures: 5, lockSeconds: 600 };

export function evaluateLockout(
  attempts: readonly AttemptRecord[],
  now: Date,
  cfg: LockoutConfig = DEFAULT_LOCKOUT,
): LockoutState {
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  let streak = 0;
  let lockedUntilMs: number | null = null;

  for (const a of sorted) {
    const t = a.at.getTime();
    if (lockedUntilMs !== null && t < lockedUntilMs) continue; // blok davomidagi yozuvlar e'tiborsiz
    if (a.success) {
      streak = 0;
      lockedUntilMs = null;
      continue;
    }
    streak += 1;
    if (streak >= cfg.maxFailures) {
      lockedUntilMs = t + cfg.lockSeconds * 1000;
      streak = 0;
    }
  }

  const nowMs = now.getTime();
  const locked = lockedUntilMs !== null && nowMs < lockedUntilMs;
  return {
    locked,
    lockedUntil: locked && lockedUntilMs !== null ? new Date(lockedUntilMs) : null,
    streak: locked ? 0 : streak,
    attemptsLeft: locked ? 0 : Math.max(0, cfg.maxFailures - streak),
    retryAfterSeconds: locked && lockedUntilMs !== null ? Math.ceil((lockedUntilMs - nowMs) / 1000) : 0,
  };
}
