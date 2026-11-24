import { describe, it, expect } from 'vitest';
import type { BotApi, BotState, ConfirmResult, LookupResult, StudentProfile } from '../src/api-client';
import { handleAdmin, handleClassChosen, handleConfirm, handleStart, handleText } from '../src/flow';

function fakeApi(over: Partial<BotApi> = {}): BotApi & { states: Map<number, BotState> } {
  const states = new Map<number, BotState>();
  const api: BotApi = {
    classes: async () => [{ id: 'c1', name: '8-A' }],
    lookup: async (): Promise<LookupResult> => ({ status: 'invalid', attemptsLeft: 4 }),
    confirm: async (): Promise<ConfirmResult> => ({ status: 'expired' }),
    studentByTelegram: async (): Promise<StudentProfile | null> => null,
    adminLoginLink: async () => null,
    getState: async (id) => states.get(id) ?? null,
    putState: async (id, step, data) => void states.set(id, { step, data }),
    deleteState: async (id) => void states.delete(id),
    claimUpdate: async () => true,
    claimNotifications: async () => [],
    reportNotification: async () => undefined,
    ...over,
  };
  return Object.assign(api, { states });
}
const ctx = (api: BotApi, url = 'https://app.example.uz') => ({ api, studentAppUrl: url });

describe('ro\'yxatdan o\'tish oqimi', () => {
  it('/start yangi foydalanuvchiga sinflarni ko\'rsatadi va holatni saqlaydi', async () => {
    const api = fakeApi();
    const r = await handleStart(ctx(api), 1);
    expect(r.buttons?.[0]?.[0]?.data).toBe('cls:c1');
    expect(api.states.get(1)?.step).toBe('choose_class');
  });

  it('/start ro\'yxatdan o\'tgan foydalanuvchiga menyu beradi', async () => {
    const api = fakeApi({ studentByTelegram: async () => ({ id: 's', firstName: 'Aziz', lastName: 'Karimov', className: '8-A', code: 'PH-8A-0417', isActive: true }) });
    const r = await handleStart(ctx(api), 1);
    expect(r.text).toContain('Aziz');
    expect(r.buttons?.[0]?.[0]?.webApp).toBe('https://app.example.uz');
  });

  it('http (lokal) STUDENT_APP_URL da Mini App tugmasi qo\'shilmaydi', async () => {
    const api = fakeApi({ studentByTelegram: async () => ({ id: 's', firstName: 'A', lastName: 'B', className: '8-A', code: 'x', isActive: true }) });
    const r = await handleStart(ctx(api, 'http://localhost:5173'), 1);
    expect(r.buttons).toBeUndefined();
  });

  it('sinf tanlangach ID so\'raydi; ID bosqichisiz matn e\'tiborsiz qoldiriladi', async () => {
    const api = fakeApi();
    expect((await handleText(ctx(api), 1, 'PH-8A-0417')).text).toContain('/help');
    const r = await handleClassChosen(ctx(api), 1, 'c1');
    expect(r.text).toContain('8-A');
    expect(api.states.get(1)?.step).toBe('enter_code');
  });

  it('noto\'g\'ri ID: qolgan urinishlar ko\'rsatiladi va xabar o\'chiriladi', async () => {
    const api = fakeApi();
    await handleClassChosen(ctx(api), 1, 'c1');
    const r = await handleText(ctx(api), 1, 'PH-8A-9999');
    expect(r.text).toContain('Qolgan urinishlar: 4');
    expect(r.deleteIncoming).toBe(true);
  });

  it('blok: daqiqalar yuqoriga yaxlitlanadi', async () => {
    const api = fakeApi({ lookup: async () => ({ status: 'locked', retryAfterSeconds: 541 }) });
    await handleClassChosen(ctx(api), 1, 'c1');
    expect((await handleText(ctx(api), 1, 'x')).text).toContain('10 daqiqadan');
  });

  it('to\'g\'ri ID: ism ko\'rsatiladi, tasdiqlash tokeni callback ma\'lumotida', async () => {
    const api = fakeApi({
      lookup: async () => ({ status: 'found', student: { firstName: 'Aziz', lastName: 'Karimov', className: '8-A' }, confirmToken: 'tok123' }),
    });
    await handleClassChosen(ctx(api), 1, 'c1');
    const r = await handleText(ctx(api), 1, 'PH-8A-0417');
    expect(r.text).toContain('Karimov Aziz');
    expect(r.buttons?.[0]?.[0]?.data).toBe('ok:tok123');
    expect(api.states.get(1)?.step).toBe('confirm');
  });

  it('tasdiqlash natijalari', async () => {
    const mk = (res: ConfirmResult) => fakeApi({ confirm: async () => res });
    const tg = { id: 1, username: null };
    expect((await handleConfirm(ctx(mk({ status: 'linked', alreadyLinked: false, student: { firstName: 'A', lastName: 'B', className: 'x' } })), tg, 't')).text).toContain('Tayyor');
    expect((await handleConfirm(ctx(mk({ status: 'telegram_taken' })), tg, 't')).text).toContain('boshqa ID ga bog\'langan');
    expect((await handleConfirm(ctx(mk({ status: 'expired' })), tg, 't')).text).toContain('muddati tugagan');
  });
});

describe('/admin', () => {
  it('administrator bo\'lmasa rad etiladi', async () => {
    expect((await handleAdmin(ctx(fakeApi()), 1)).text).toContain('faqat administrator');
  });
  it('https havola tugma bo\'ladi, http havola matnda', async () => {
    const api = fakeApi({ adminLoginLink: async () => ({ url: 'https://admin.example.uz/auth/callback#token=abc' }) });
    expect((await handleAdmin(ctx(api), 1)).buttons?.[0]?.[0]?.url).toContain('https://admin.example.uz');
    const local = fakeApi({ adminLoginLink: async () => ({ url: 'http://localhost:5174/auth/callback#token=abc' }) });
    const r = await handleAdmin(ctx(local), 1);
    expect(r.buttons).toBeUndefined();
    expect(r.text).toContain('http://localhost:5174');
  });
});
