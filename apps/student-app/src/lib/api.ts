import type { ApiErrorBody, StudentMeDto } from '@pep/shared';
import { getInitData } from './telegram';

export class ApiFail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null; // faqat xotirada (localStorage'da emas)

function deviceId(): string {
  try {
    // localStorage: Mini App qayta ochilganda ham shu qurilma ekani bilinsin (aks holda "boshqa qurilma" deb rad etilishi mumkin)
    let id = localStorage.getItem('pep_device') ?? sessionStorage.getItem('pep_device');
    if (!id) id = crypto.randomUUID();
    localStorage.setItem('pep_device', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

async function raw(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch {
    throw new ApiFail(0, 'NETWORK', 'Internet bilan aloqa yo\'q');
  }
}

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiFail(res.status, body?.error.code ?? 'UNKNOWN', body?.error.message ?? 'Xatolik');
}

export interface ParentMe { id: string; firstName: string; lastName: string; children: { id: string; name: string; className: string }[] }
export type LoginResult = { role: 'student'; student: StudentMeDto } | { role: 'parent'; parent: ParentMe };

/** Ota-ona kodi bilan Telegram akkauntni bog'lash. */
export async function linkParent(code: string): Promise<LoginResult> {
  const initData = getInitData();
  if (!initData) throw new ApiFail(0, 'NOT_TELEGRAM', 'Telegram ichida oching');
  const res = await raw('/api/student/auth/parent-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData, code }) });
  if (!res.ok) return fail(res);
  const json = (await res.json()) as { token: string; parent: ParentMe };
  token = json.token;
  return { role: 'parent', parent: json.parent };
}

export async function login(): Promise<LoginResult> {
  const initData = getInitData();
  const body = initData
    ? { initData, deviceId: deviceId() }
    : import.meta.env.DEV
      ? { dev: true, deviceId: deviceId() } // faqat lokal ishlab chiqish (server ALLOW_DEV_AUTH=true bo'lsa)
      : null;
  if (!body) throw new ApiFail(0, 'NOT_TELEGRAM', 'Telegram ichida oching');
  const res = await raw('/api/student/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return fail(res);
  const json = (await res.json()) as { role?: 'student' | 'parent'; token: string; student?: StudentMeDto; parent?: ParentMe };
  token = json.token;
  return json.role === 'parent' && json.parent ? { role: 'parent', parent: json.parent } : { role: 'student', student: json.student as StudentMeDto };
}

/** 401 bo'lsa bir marta qayta kiradi (sessiya muddati tugagan bo'lishi mumkin). */
export async function api<T>(path: string, retry = true): Promise<T> {
  if (!token) await login();
  const res = await raw(path, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    token = null;
    return api<T>(path, false);
  }
  if (!res.ok) return fail(res);
  return (await res.json()) as T;
}

/** Har qanday metod; status kodini o'zi qaytaradi (xatoni chaqiruvchi hal qiladi). Tarmoq yo'q bo'lsa ApiFail(0,'NETWORK'). */
export async function apiSend(
  method: 'POST' | 'PUT',
  path: string,
  body?: unknown,
  retry = true,
): Promise<{ status: number; json: unknown }> {
  if (!token) await login();
  const res = await raw(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry) {
    token = null;
    return apiSend(method, path, body, false);
  }
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Himoyalangan faylni (rasm/PDF) tokenli so'rov bilan olib, blob URL qaytaradi. <img src> sarlavha yubora olmagani uchun shunday. */
export async function fetchMediaUrl(mediaId: string, retry = true): Promise<string> {
  if (!token) await login();
  const res = await raw(`/api/student/media/${mediaId}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    token = null;
    return fetchMediaUrl(mediaId, false);
  }
  if (!res.ok) return fail(res);
  return URL.createObjectURL(await res.blob());
}
