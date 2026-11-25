export interface StudentBrief {
  firstName: string;
  lastName: string;
  className: string;
}
export type LookupResult =
  | { status: 'already_linked'; student: StudentBrief }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'invalid'; attemptsLeft: number }
  | { status: 'found'; student: StudentBrief; confirmToken: string };
export type ConfirmResult =
  | { status: 'linked'; student: StudentBrief; alreadyLinked: boolean }
  | { status: 'expired' }
  | { status: 'telegram_taken' };
export interface StudentProfile extends StudentBrief {
  id: string;
  code: string;
  isActive: boolean;
}
export interface DueNotification {
  id: string;
  kind: string;
  telegramId: number;
  attempt: number;
  payload: { examTitle?: string; startsAt?: string; text?: string };
}
export interface BotState {
  step: string;
  data: Record<string, unknown>;
}

/** Botning API bilan aloqasi. Testlarda soxta (fake) realizatsiya beriladi. */
export interface BotApi {
  classes(): Promise<{ id: string; name: string }[]>;
  lookup(i: { telegramId: number; classId: string; code: string }): Promise<LookupResult>;
  confirm(i: { telegramId: number; username: string | null; token: string }): Promise<ConfirmResult>;
  studentByTelegram(telegramId: number): Promise<StudentProfile | null>;
  /** null — administrator emas */
  adminLoginLink(telegramId: number): Promise<{ url: string } | null>;
  getState(telegramId: number): Promise<BotState | null>;
  putState(telegramId: number, step: string, data: Record<string, unknown>): Promise<void>;
  deleteState(telegramId: number): Promise<void>;
  claimUpdate(updateId: number): Promise<boolean>;
  claimNotifications(limit: number): Promise<DueNotification[]>;
  reportNotification(id: string, r: { ok: boolean; error?: string; permanent?: boolean }): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API ${status} ${code}`);
  }
}

export function createHttpApi(baseUrl: string, key: string): BotApi {
  async function call<T>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<T> {
    const res = await fetch(`${baseUrl}/internal${path}`, {
      method,
      headers: { 'x-internal-key': key, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    if (!res.ok && !okStatuses.includes(res.status)) throw new ApiError(res.status, json.error?.code ?? 'UNKNOWN');
    return json as T;
  }

  return {
    classes: async () => (await call<{ items: { id: string; name: string }[] }>('GET', '/classes')).items,
    lookup: (i) => call('POST', '/registration/lookup', i),
    confirm: (i) => call('POST', '/registration/confirm', i),
    studentByTelegram: async (id) => {
      try {
        return (await call<{ student: StudentProfile }>('GET', `/students/by-telegram/${id}`)).student;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    adminLoginLink: async (id) => {
      try {
        return await call<{ url: string }>('POST', '/admin/login-link', { telegramId: id });
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) return null;
        throw e;
      }
    },
    getState: async (id) => (await call<{ state: BotState | null }>('GET', `/bot-state/${id}`)).state,
    putState: (id, step, data) => call('PUT', `/bot-state/${id}`, { step, data }),
    deleteState: (id) => call('DELETE', `/bot-state/${id}`),
    claimNotifications: async (limit) => (await call<{ items: DueNotification[] }>('POST', '/notifications/claim', { limit })).items,
    reportNotification: (id, r) => call('POST', `/notifications/${id}/result`, r),
    claimUpdate: async (updateId) => (await call<{ claimed: boolean }>('POST', '/updates/claim', { updateId })).claimed,
  };
}
