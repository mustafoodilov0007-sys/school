/** Mijoz soati noto'g'ri bo'lishi mumkin. Taymer server vaqtiga nisbatan siljish (offset) bilan hisoblanadi; haqiqat manbai — server. */
export function clockOffsetMs(serverNowIso: string, clientNowMs: number): number {
  const s = Date.parse(serverNowIso);
  if (!Number.isFinite(s)) return 0;
  return s - clientNowMs;
}

export function remainingMs(deadlineIso: string, clientNowMs: number, offsetMs: number): number {
  const d = Date.parse(deadlineIso);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, d - (clientNowMs + offsetMs));
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
