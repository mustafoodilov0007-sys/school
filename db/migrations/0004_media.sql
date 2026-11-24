-- 4-bosqich: rasm (savol uchun) va PDF (imtihon uchun). Fayllar bazada saqlanadi — Railway'da volume shart emas.
CREATE TABLE media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('image','pdf')),
  mime       text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp','application/pdf')),
  byte_size  integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 12582912),
  sha256     text NOT NULL,
  data       bytea NOT NULL,
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_sha_kind_uq UNIQUE (sha256, kind)
);
ALTER TABLE questions ADD COLUMN image_media_id uuid REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN pdf_media_id uuid REFERENCES media(id) ON DELETE SET NULL;
