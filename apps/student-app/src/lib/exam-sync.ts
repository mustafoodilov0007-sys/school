import { applyOutcome, backoffMs, enqueue, rebase } from '@pep/shared';
import type { QueuedAnswer, Queue, SendOutcome } from '@pep/shared';
import { ApiFail, apiSend } from './api';

/**
 * Javoblarni serverga yuboruvchi: navbatni localStorage'da saqlaydi (sahifa yangilansa yoki internet uzilsa yo'qolmaydi),
 * tarmoq xatosida eksponensial kutish bilan qayta uriniladi. Hech qachon vaqtni uzaytirmaydi: server deadline'dan keyingi javobni rad etadi.
 */
export interface SyncState {
  pending: number;
  online: boolean;
  late: boolean;
}

export class AnswerSync {
  private queue: Queue = [];
  private versions = new Map<string, number>();
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  private late = false;
  private online = true;
  private readonly attemptId: string;
  private readonly onChange: (s: SyncState) => void;
  private readonly onServerValue: (attemptQuestionId: string, v: { selectedOptionIds: string[]; numericValue: number | null }) => void;

  constructor(
    attemptId: string,
    initialVersions: Record<string, number>,
    onChange: (s: SyncState) => void,
    onServerValue: (attemptQuestionId: string, v: { selectedOptionIds: string[]; numericValue: number | null }) => void,
  ) {
    this.attemptId = attemptId;
    this.onChange = onChange;
    this.onServerValue = onServerValue;
    for (const [k, v] of Object.entries(initialVersions)) this.versions.set(k, v);
    this.queue = this.load();
    this.emit();
    if (this.queue.length) this.schedule(0);
  }

  private key() {
    return `pep_queue_${this.attemptId}`;
  }
  private load(): Queue {
    try {
      const raw = localStorage.getItem(this.key());
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(v) ? (v as QueuedAnswer[]) : [];
    } catch {
      return [];
    }
  }
  private save() {
    try {
      localStorage.setItem(this.key(), JSON.stringify(this.queue));
    } catch {
      /* xotira to'la/yopiq: xotiradagi navbat ishlayveradi */
    }
  }
  private emit() {
    this.onChange({ pending: this.queue.length, online: this.online, late: this.late });
  }

  submit(a: { attemptQuestionId: string; selectedOptionIds: string[]; numericValue: number | null; isFlagged: boolean }) {
    if (this.stopped || this.late) return;
    const op: QueuedAnswer = { ...a, clientOpId: crypto.randomUUID(), baseVersion: this.versions.get(a.attemptQuestionId) ?? 0 };
    this.queue = enqueue(this.queue, op);
    this.save();
    this.emit();
    this.schedule(300); // qisqa kechikish: ketma-ket bosishlar bitta so'rovga birlashadi
  }

  /** Imtihonni yakunlashdan oldin: navbat bo'shaguncha yoki `timeoutMs` gacha kutadi. */
  async flush(timeoutMs = 8000): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (this.queue.length && !this.late && Date.now() < end) {
      await this.pump();
      if (this.queue.length) await new Promise((r) => setTimeout(r, 400));
    }
    return this.queue.length === 0;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  clearStorage() {
    try {
      localStorage.removeItem(this.key());
    } catch {
      /* ignore */
    }
  }

  retryNow() {
    this.schedule(0);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pump(), ms);
  }

  private async pump() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.queue.length && !this.stopped) {
        const op = this.queue[0] as QueuedAnswer;
        const outcome = await this.send(op);
        const r = applyOutcome(this.queue, op, outcome);
        this.queue = r.queue;
        if (r.version !== null) {
          this.versions.set(op.attemptQuestionId, r.version);
          this.queue = rebase(this.queue, op.attemptQuestionId, r.version);
        }
        this.save();
        if (r.stop === 'network') {
          this.online = false;
          this.failures++;
          this.emit();
          this.schedule(backoffMs(this.failures));
          return;
        }
        this.online = true;
        this.failures = 0;
        if (r.stop === 'late') {
          this.late = true;
          this.emit();
          return;
        }
        this.emit();
      }
    } finally {
      this.running = false;
    }
  }

  private async send(op: QueuedAnswer): Promise<SendOutcome> {
    try {
      const { status, json } = await apiSend('PUT', `/api/student/attempts/${this.attemptId}/answers`, op);
      const body = json as { status?: string; version?: number; selectedOptionIds?: string[]; numericValue?: number | null; error?: { details?: { reason?: string } } } | null;
      if (status === 200 && body?.status === 'conflict') {
        // Server qiymati yangiroq: uni qabul qilamiz, o'quvchi ekranda ko'radi.
        this.onServerValue(op.attemptQuestionId, { selectedOptionIds: body.selectedOptionIds ?? [], numericValue: body.numericValue ?? null });
        return { kind: 'conflict', version: body.version ?? 0 };
      }
      if (status === 200 && (body?.status === 'saved' || body?.status === 'duplicate')) return { kind: body.status, version: body.version ?? 0 };
      const reason = body?.error?.details?.reason;
      if (status === 409 && reason === 'PAUSED') return { kind: 'network' }; // pauza: javoblar saqlanadi, davom ettirilganda yuboriladi
      if (status === 409) return { kind: 'late' }; // LATE yoki FINISHED: bu amal endi hech qachon qabul qilinmaydi
      if (status >= 500 || status === 429 || status === 0) return { kind: 'network' };
      return { kind: 'rejected' };
    } catch (e) {
      if (e instanceof ApiFail && e.code === 'NETWORK') return { kind: 'network' };
      return { kind: 'network' };
    }
  }
}
