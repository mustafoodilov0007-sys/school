-- 2-bosqich: tasodifiy tanlash, qayta topshirish ruxsatlari.

ALTER TABLE exams
  ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','random')),
  ADD COLUMN topic_distribution jsonb
    CHECK (topic_distribution IS NULL OR jsonb_typeof(topic_distribution) = 'object');

-- Adminning bitta o'quvchiga bergan qayta topshirish ruxsati (bir martalik).
CREATE TABLE retake_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  granted_by      uuid REFERENCES admins(id) ON DELETE SET NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  used_attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL
);
-- Bir o'quvchi/imtihon uchun bir vaqtda faqat bitta ishlatilmagan ruxsat.
CREATE UNIQUE INDEX retake_grants_open_uq ON retake_grants (exam_id, student_id) WHERE used_attempt_id IS NULL;
CREATE INDEX retake_grants_student_idx ON retake_grants (student_id);
