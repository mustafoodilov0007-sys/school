-- Yakuniy bosqich: qo'lda ball tuzatish, shikoyatlar, PDF javob kaliti rejimi, materiallarga fayl
CREATE TABLE score_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  admin_id    uuid REFERENCES admins(id) ON DELETE SET NULL,
  old_score   numeric(8,2) NOT NULL,
  new_score   numeric(8,2) NOT NULL CHECK (new_score >= 0),
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 3),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_adjustments_attempt_idx ON score_adjustments (attempt_id, created_at DESC);

CREATE TABLE complaints (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id           uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  attempt_question_id  uuid REFERENCES attempt_questions(id) ON DELETE SET NULL,
  student_id           uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  body                 text NOT NULL CHECK (length(btrim(body)) BETWEEN 3 AND 1000),
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected')),
  admin_note           text,
  resolved_by          uuid REFERENCES admins(id) ON DELETE SET NULL,
  resolved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaints_resolved_consistency CHECK ((status = 'open') = (resolved_at IS NULL))
);
-- Bir savol (yoki umumiy) bo'yicha bitta ochiq shikoyat
CREATE UNIQUE INDEX complaints_one_open_uq ON complaints (attempt_id, coalesce(attempt_question_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'open';
CREATE INDEX complaints_status_idx ON complaints (status, created_at DESC);

-- exams.mode 0001'da bor; PDF fayl endi `media` jadvalida (pdf_media_id)
ALTER TABLE exams DROP CONSTRAINT exams_pdf_needs_file;
ALTER TABLE exams ADD CONSTRAINT exams_pdf_needs_file CHECK (mode <> 'pdf' OR pdf_media_id IS NOT NULL OR pdf_storage_key IS NOT NULL OR status = 'draft');
ALTER TABLE materials ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE SET NULL;
