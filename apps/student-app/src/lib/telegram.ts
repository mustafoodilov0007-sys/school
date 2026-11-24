/** Telegram WebApp SDK bilan xavfsiz ishlash. Imkoniyatlar mavjudligi tekshiriladi — barcha qurilmalarda bir xil deb taxmin qilinmaydi. */
interface TgWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string | undefined>;
  version?: string;
  ready(): void;
  expand?: () => void;
  isVersionAtLeast?: (v: string) => boolean;
  disableVerticalSwipes?: () => void;
  onEvent?: (e: string, cb: () => void) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
}

/** Imtihon davomida Telegram oynasini tasodifan yopishdan himoya (mavjud bo'lsa; hamma qurilmada ishlashi kafolatlanmaydi). */
export function setClosingConfirmation(on: boolean): void {
  try {
    const tg = getWebApp();
    if (on) tg?.enableClosingConfirmation?.(); else tg?.disableClosingConfirmation?.();
  } catch { /* qo'llab-quvvatlanmasa — e'tibor bermaymiz */ }
}

export function getWebApp(): TgWebApp | null {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;
}

/** Faqat Telegram bergan imzolangan qator (serverda tekshiriladi). `initDataUnsafe` ishlatilmaydi. */
export const getInitData = (): string => getWebApp()?.initData ?? '';

function hexToTriplet(hex?: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1] as string, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function applyTheme(): void {
  const tg = getWebApp();
  const dark = tg?.colorScheme ? tg.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const p = tg?.themeParams;
  const brand = hexToTriplet(p?.button_color);
  const brandInk = hexToTriplet(p?.button_text_color);
  if (brand) root.style.setProperty('--c-brand', brand);
  if (brandInk) root.style.setProperty('--c-brand-ink', brandInk);
}

export function initTelegram(): void {
  const tg = getWebApp();
  try {
    tg?.ready();
    tg?.expand?.();
    if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.();
    tg?.onEvent?.('themeChanged', applyTheme);
  } catch {
    /* ba'zi qurilmalarda metodlar yo'q — ilova baribir ishlashi kerak */
  }
  applyTheme();
}
