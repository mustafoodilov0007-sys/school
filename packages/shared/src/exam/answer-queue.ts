/**
 * Oflayn javoblar navbati (toza mantiq; saqlash va tarmoq tashqarida).
 *  - Har savol uchun navbatda ENG OXIRGI javob qoladi (oraliq o'zgarishlar yuborilmaydi).
 *  - Har amal o'zining `clientOpId` si bilan yuboriladi — server takroriy yuborishni bir marta qo'llaydi.
 *  - Tarmoq xatosida amal navbatda qoladi; "kech" (deadline o'tgan) rad etilsa navbat bo'shatiladi — oflayn vaqtni uzaytirmaydi.
 */
export interface QueuedAnswer {
  clientOpId: string;
  attemptQuestionId: string;
  selectedOptionIds: string[];
  numericValue: number | null;
  isFlagged: boolean;
  /** Mijoz bu savol bo'yicha oxirgi bilgan server versiyasi (0 — hali javob yo'q) */
  baseVersion: number;
}

export type Queue = readonly QueuedAnswer[];

export function enqueue(queue: Queue, op: QueuedAnswer): Queue {
  return [...queue.filter((q) => q.attemptQuestionId !== op.attemptQuestionId), op];
}

export type SendOutcome =
  | { kind: 'saved'; version: number }
  | { kind: 'duplicate'; version: number }
  | { kind: 'conflict'; version: number }
  | { kind: 'late' }
  | { kind: 'network' }
  | { kind: 'rejected' }; // 4xx: bu amal hech qachon qabul qilinmaydi (masalan, noto'g'ri variant)

export interface ApplyResult {
  queue: Queue;
  /** Keyingi amallar uchun yangilangan versiya (savol ID -> versiya) */
  version: number | null;
  /** Navbat to'xtatilsin (tarmoq yo'q yoki vaqt tugagan) */
  stop: 'network' | 'late' | null;
}

export function applyOutcome(queue: Queue, op: QueuedAnswer, outcome: SendOutcome): ApplyResult {
  // Navbatda shu savol uchun yangiroq amal bo'lishi mumkin — faqat aynan shu clientOpId ni olib tashlaymiz.
  const without = queue.filter((q) => q.clientOpId !== op.clientOpId);
  switch (outcome.kind) {
    case 'saved':
    case 'duplicate':
    case 'conflict':
      return { queue: without, version: outcome.version, stop: null };
    case 'rejected':
      return { queue: without, version: null, stop: null };
    case 'late':
      return { queue: [], version: null, stop: 'late' };
    case 'network':
      return { queue, version: null, stop: 'network' };
  }
}

/** Server versiyasi o'zgargan bo'lsa, navbatdagi shu savol amalining baseVersion ini yangilaydi. */
export function rebase(queue: Queue, attemptQuestionId: string, version: number): Queue {
  return queue.map((q) => (q.attemptQuestionId === attemptQuestionId ? { ...q, baseVersion: Math.max(q.baseVersion, version) } : q));
}

/** Qayta urinish oralig'i (ms): eksponensial, 30 s gacha. */
export function backoffMs(failures: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, Math.min(failures, 5)));
}
