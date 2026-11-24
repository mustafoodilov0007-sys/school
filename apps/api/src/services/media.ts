import { createHash } from 'node:crypto';
import type { Db, Pool } from '../db/pool';
import { badRequest, notFound } from '../lib/errors';
import { writeAudit } from './audit';
import type { Actor } from './audit';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type MediaKind = 'image' | 'pdf';
export interface Sniffed { kind: MediaKind; mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' }

/** Fayl turi mijoz aytgan Content-Type'ga EMAS, haqiqiy boshlang'ich baytlarga qarab aniqlanadi. SVG qabul qilinmaydi (skript tashishi mumkin). */
export function sniffMedia(b: Buffer): Sniffed | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', mime: 'application/pdf' };
  return null;
}

export async function saveMedia(pool: Pool, actor: Actor, data: Buffer, expect?: MediaKind): Promise<{ id: string; kind: MediaKind; mime: string; size: number }> {
  const s = sniffMedia(data);
  if (!s) throw badRequest('Faqat PNG, JPEG, WEBP rasm yoki PDF yuklash mumkin');
  if (expect && s.kind !== expect) throw badRequest(expect === 'image' ? 'Bu yerga faqat rasm yuklanadi' : 'Bu yerga faqat PDF yuklanadi');
  const limit = s.kind === 'image' ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
  if (data.length > limit) throw badRequest(`Fayl juda katta (ko'pi bilan ${limit / 1024 / 1024} MB)`);
  const sha = createHash('sha256').update(data).digest('hex');
  const r = await pool.query<{ id: string }>(
    `INSERT INTO media (kind, mime, byte_size, sha256, data, created_by) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (sha256, kind) DO UPDATE SET sha256 = media.sha256 RETURNING id`,
    [s.kind, s.mime, data.length, sha, data, actor.type === 'admin' ? actor.adminId : null],
  );
  const id = (r.rows[0] as { id: string }).id;
  await writeAudit(pool, actor, { action: 'media.upload', entityType: 'media', entityId: id, after: { kind: s.kind, size: data.length } });
  return { id, kind: s.kind, mime: s.mime, size: data.length };
}

export async function getMedia(db: Db, id: string): Promise<{ mime: string; data: Buffer; sha256: string }> {
  const r = await db.query<{ mime: string; data: Buffer; sha256: string }>('SELECT mime, data, sha256 FROM media WHERE id = $1', [id]);
  if (!r.rows[0]) throw notFound('Fayl topilmadi');
  return r.rows[0];
}

/** O'quvchi faqat O'Z urinishidagi savol rasmi yoki o'z urinishi imtihonining PDF'sini ko'ra oladi. */
export async function getMediaForStudent(db: Db, studentId: string, mediaId: string): Promise<{ mime: string; data: Buffer; sha256: string }> {
  const ok = await db.query(
    `SELECT 1 FROM attempts a
       WHERE a.student_id = $1
         AND (EXISTS (SELECT 1 FROM exams e WHERE e.id = a.exam_id AND e.pdf_media_id = $2)
              OR EXISTS (SELECT 1 FROM attempt_questions aq JOIN questions q ON q.id = aq.question_id WHERE aq.attempt_id = a.id AND q.image_media_id = $2))
       LIMIT 1`,
    [studentId, mediaId],
  );
  if (!ok.rows[0]) {
    // O'z sinfining nashr qilingan materiali fayli
    const m = await db.query(
      `SELECT 1 FROM materials m JOIN students s ON s.class_id = m.class_id WHERE s.id = $1 AND m.is_published AND m.media_id = $2 LIMIT 1`,
      [studentId, mediaId],
    );
    if (m.rows[0]) return getMedia(db, mediaId);
  }
  if (!ok.rows[0]) throw notFound('Fayl topilmadi');
  return getMedia(db, mediaId);
}
