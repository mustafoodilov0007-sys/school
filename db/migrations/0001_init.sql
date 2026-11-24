-- Physics Exam Pro — 0001_init
-- To'liq ma'lumotlar modeli (1-bosqichda faol ishlatiladigan va keyingi bosqichlar uchun tayyor jadvallar).
-- Barcha vaqtlar UTC (timestamptz). Interfeysda Asia/Tashkent ga o'tkaziladi.
-- Diqqat: *_answer*, is_correct, correct_* ustunlari FAQAT serverda o'qiladi; o'quvchi API javoblariga chiqmaydi.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────── Adminlar ─────────────
CREATE TABLE admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   bigint NOT NULL UNIQUE CHECK (telegram_id > 0),
  display_name  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Sinflar ─────────────
CREATE TABLE classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  -- ID formatida ishlatiladigan normallashtirilgan belgi: "8-A" -> "8A"
  code_label  text NOT NULL UNIQUE CHECK (code_label ~ '^[A-Z0-9]{1,6}$'),
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX classes_name_active_uq ON classes (lower(btrim(name))) WHERE NOT is_archived;

-- ───────────── O'quvchilar ─────────────
CREATE TABLE students (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  first_name          text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name           text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 80),
  code                text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{1,8}-[A-Z0-9]{1,6}-[0-9]{4,8}$'),
  -- Bitta Telegram akkaunt = bitta o'quvchi (UNIQUE; NULL lar takrorlanishi mumkin)
  telegram_id         bigint UNIQUE CHECK (telegram_id IS NULL OR telegram_id > 0),
  telegram_username   text,
  telegram_linked_at  timestamptz,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_link_consistency CHECK ((telegram_id IS NULL) = (telegram_linked_at IS NULL))
);
CREATE INDEX students_class_idx ON students (class_id);

-- ───────────── Sessiyalar ─────────────
CREATE TABLE sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type   text NOT NULL CHECK (subject_type IN ('student','admin')),
  student_id     uuid REFERENCES students(id) ON DELETE CASCADE,
  admin_id       uuid REFERENCES admins(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,            -- ochiq token saqlanmaydi, faqat SHA-256
  device_id      text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoked_reason text,
  CONSTRAINT sessions_one_subject CHECK (
    (subject_type = 'student' AND student_id IS NOT NULL AND admin_id IS NULL) OR
    (subject_type = 'admin'   AND admin_id   IS NOT NULL AND student_id IS NULL)
  ),
  CONSTRAINT sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX sessions_student_idx ON sessions (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX sessions_admin_idx   ON sessions (admin_id)   WHERE admin_id IS NOT NULL;

CREATE TABLE admin_login_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_login_tokens_expiry CHECK (expires_at > created_at)
);

-- ───────────── Ro'yxatdan o'tish ─────────────
CREATE TABLE registration_confirmations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id  bigint NOT NULL CHECK (telegram_id > 0),
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_confirmations_expiry CHECK (expires_at > created_at)
);
CREATE INDEX registration_confirmations_tg_idx ON registration_confirmations (telegram_id, created_at DESC);

-- ID taxmin qilishdan himoya. Xom ID saqlanmaydi, faqat hash.
CREATE TABLE login_attempts (
  id           bigserial PRIMARY KEY,
  telegram_id  bigint NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('registration')),
  success      boolean NOT NULL,
  code_hash    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_lookup_idx ON login_attempts (telegram_id, kind, created_at DESC);

-- ───────────── Mavzular va savollar ─────────────
CREATE TABLE topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  grade       smallint CHECK (grade BETWEEN 1 AND 12),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, grade)
);

CREATE TABLE questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN (
                  'text','formula','image','graph','circuit','optics','vectors','table','numeric','multi')),
  body          text NOT NULL CHECK (length(btrim(body)) > 0),       -- KaTeX: $...$
  explanation   text,
  topic_id      uuid REFERENCES topics(id) ON DELETE SET NULL,
  class_id      uuid REFERENCES classes(id) ON DELETE SET NULL,
  week_label    text,
  difficulty    smallint NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  tags          text[] NOT NULL DEFAULT '{}',
  points        numeric(6,2) NOT NULL DEFAULT 1 CHECK (points > 0),
  param_spec    jsonb,           -- parametrli savol: diapazonlar va formula (faqat server)
  answer_spec   jsonb,           -- sonli javob: qiymat/tolerantlik (faqat server)
  is_active     boolean NOT NULL DEFAULT true,
  is_archived   boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questions_filter_idx ON questions (class_id, topic_id, difficulty) WHERE NOT is_archived;
CREATE INDEX questions_tags_idx ON questions USING gin (tags);

CREATE TABLE question_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- barqaror variant ID (A/B/C/D harfi emas)
  question_id  uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (length(btrim(body)) > 0),
  is_correct   boolean NOT NULL DEFAULT false,               -- faqat server
  position     smallint NOT NULL CHECK (position >= 0),
  UNIQUE (question_id, position)
);
CREATE INDEX question_options_q_idx ON question_options (question_id);

CREATE TABLE question_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,       -- asl fayl nomi emas, serverda yaratilgan kalit
  mime_type    text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  width        integer CHECK (width > 0),
  height       integer CHECK (height > 0),
  bytes        integer NOT NULL CHECK (bytes > 0),
  sha256       text NOT NULL,
  alt_text     text,
  position     smallint NOT NULL DEFAULT 0
);
CREATE INDEX question_media_q_idx ON question_media (question_id);

-- ───────────── Imtihonlar ─────────────
CREATE TABLE exams (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text NOT NULL CHECK (length(btrim(title)) > 0),
  mode                    text NOT NULL DEFAULT 'bank' CHECK (mode IN ('bank','pdf')),
  status                  text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','scheduled','running','paused','finished','cancelled')),
  topic_id                uuid REFERENCES topics(id) ON DELETE SET NULL,
  week_label              text,
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  duration_minutes        integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  question_count          integer CHECK (question_count > 0),   -- har bir o'quvchiga nechta savol
  pass_percent            numeric(5,2) NOT NULL DEFAULT 60 CHECK (pass_percent BETWEEN 0 AND 100),
  shuffle_questions       boolean NOT NULL DEFAULT true,
  shuffle_options         boolean NOT NULL DEFAULT true,
  allow_calculator        boolean NOT NULL DEFAULT false,
  allow_formula_sheet     boolean NOT NULL DEFAULT false,
  results_policy          text NOT NULL DEFAULT 'after_end' CHECK (results_policy IN ('immediate','after_end','manual')),
  results_published_at    timestamptz,
  track_focus_events      boolean NOT NULL DEFAULT true,
  focus_warn_threshold    smallint NOT NULL DEFAULT 3 CHECK (focus_warn_threshold >= 1),
  watermark_enabled       boolean NOT NULL DEFAULT true,
  show_rankings           boolean NOT NULL DEFAULT false,
  -- Qayta topshirish
  retake_allowed          boolean NOT NULL DEFAULT false,
  final_attempt_policy    text NOT NULL DEFAULT 'best' CHECK (final_attempt_policy IN ('last','best','admin_choice')),
  -- Aniq vaqt siyosatlari (spetsifikatsiyada talab qilingan)
  late_submit_grace_seconds integer NOT NULL DEFAULT 0 CHECK (late_submit_grace_seconds BETWEEN 0 AND 60),
  offline_policy          text NOT NULL DEFAULT 'continue_until_deadline'
                          CHECK (offline_policy IN ('continue_until_deadline','block_when_offline')),
  second_device_policy    text NOT NULL DEFAULT 'revoke_old' CHECK (second_device_policy IN ('revoke_old','reject_new')),
  -- Pauza
  paused_at               timestamptz,
  pause_reason            text,
  -- PDF rejimi
  pdf_storage_key         text,
  pdf_answer_key          jsonb,     -- faqat server, hech qachon o'quvchiga chiqmaydi
  created_by              uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exams_window CHECK (ends_at > starts_at),
  CONSTRAINT exams_pause_consistency CHECK ((status = 'paused') = (paused_at IS NOT NULL)),
  CONSTRAINT exams_pdf_needs_file CHECK (mode <> 'pdf' OR pdf_storage_key IS NOT NULL OR status = 'draft')
);
CREATE INDEX exams_status_start_idx ON exams (status, starts_at);

CREATE TABLE exam_classes (
  exam_id   uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id  uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  PRIMARY KEY (exam_id, class_id)
);

CREATE TABLE exam_questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id          uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id      uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  points_override  numeric(6,2) CHECK (points_override > 0),
  position         integer,
  is_voided        boolean NOT NULL DEFAULT false,   -- xato savol bekor qilindi (qayta hisoblash auditga yoziladi)
  UNIQUE (exam_id, question_id)
);

-- ───────────── Urinishlar ─────────────
CREATE TABLE attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id             uuid NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  student_id          uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  attempt_no          integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
  status              text NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress','submitted','expired','cancelled')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  deadline_at         timestamptz NOT NULL,           -- server deadline (yagona haqiqat manbai)
  extra_seconds       integer NOT NULL DEFAULT 0 CHECK (extra_seconds >= 0),
  submitted_at        timestamptz,
  finish_reason       text CHECK (finish_reason IN ('student','timeout','admin','exam_cancelled')),
  score               numeric(8,2) CHECK (score >= 0),
  max_score           numeric(8,2) CHECK (max_score >= 0),
  percent             numeric(5,2) CHECK (percent BETWEEN 0 AND 100),
  is_final            boolean NOT NULL DEFAULT false,
  session_id          uuid REFERENCES sessions(id) ON DELETE SET NULL,
  device_id           text,
  last_heartbeat_at   timestamptz,
  last_sync_at        timestamptz,
  retake_granted_by   uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, attempt_no),
  CONSTRAINT attempts_deadline CHECK (deadline_at > started_at),
  CONSTRAINT attempts_score_bounds CHECK (score IS NULL OR max_score IS NULL OR score <= max_score),
  CONSTRAINT attempts_finished_consistency CHECK (
    (status = 'in_progress' AND submitted_at IS NULL) OR
    (status <> 'in_progress' AND submitted_at IS NOT NULL)
  )
);
-- Bir imtihonda bitta o'quvchi uchun FAQAT BITTA faol urinish (DB darajasida kafolat)
CREATE UNIQUE INDEX attempts_one_active_uq ON attempts (exam_id, student_id) WHERE status = 'in_progress';
CREATE INDEX attempts_student_idx ON attempts (student_id, started_at DESC);
CREATE INDEX attempts_exam_status_idx ON attempts (exam_id, status);

CREATE TABLE attempt_questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id       uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id      uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position         integer NOT NULL CHECK (position >= 0),
  points           numeric(6,2) NOT NULL CHECK (points > 0),
  option_order     uuid[] NOT NULL DEFAULT '{}',   -- variantlarning HAQIQIY tartibi (barqaror ID lar)
  param_values     jsonb,                           -- hosil qilingan parametrlar
  computed_answer  jsonb,                           -- hisoblangan to'g'ri javob (faqat server)
  UNIQUE (attempt_id, question_id),
  UNIQUE (attempt_id, position)
);

CREATE TABLE answers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_question_id  uuid NOT NULL UNIQUE REFERENCES attempt_questions(id) ON DELETE CASCADE,
  selected_option_ids  uuid[] NOT NULL DEFAULT '{}',
  numeric_value        numeric,
  text_value           text,
  is_flagged           boolean NOT NULL DEFAULT false,
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- konflikt aniqlash
  answered_at          timestamptz NOT NULL DEFAULT now(),                -- SERVER vaqti
  time_spent_ms        integer CHECK (time_spent_ms >= 0),
  is_correct           boolean,
  points_awarded       numeric(6,2) CHECK (points_awarded >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Idempotentlik: bir xil client_op_id ikkinchi marta qo'llanmaydi
CREATE TABLE answer_ops (
  client_op_id         uuid PRIMARY KEY,
  attempt_id           uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  attempt_question_id  uuid NOT NULL REFERENCES attempt_questions(id) ON DELETE CASCADE,
  applied_version      integer NOT NULL,
  applied_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX answer_ops_attempt_idx ON answer_ops (attempt_id);

CREATE TABLE attempt_events (
  id           bigserial PRIMARY KEY,
  attempt_id   uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN (
                 'visibility_hidden','visibility_visible','blur','focus','reconnect',
                 'device_conflict','fast_answer_flag','heartbeat_gap','closing_attempt')),
  meta         jsonb,
  client_ts    timestamptz,
  occurred_at  timestamptz NOT NULL DEFAULT now()   -- server vaqti; dalil sifatida, aybdorlik isboti emas
);
CREATE INDEX attempt_events_attempt_idx ON attempt_events (attempt_id, occurred_at);

-- ───────────── Materiallar ─────────────
CREATE TABLE materials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  topic_id          uuid REFERENCES topics(id) ON DELETE SET NULL,
  week_label        text,
  title             text NOT NULL CHECK (length(btrim(title)) > 0),
  summary           text,
  video_url         text CHECK (video_url IS NULL OR video_url ~* '^https://'),
  file_storage_key  text,
  homework          text,
  due_at            timestamptz,
  is_published      boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_class_idx ON materials (class_id, is_published);

-- ───────────── Bildirishnomalar (idempotent) ─────────────
CREATE TABLE notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid REFERENCES students(id) ON DELETE CASCADE,
  exam_id          uuid REFERENCES exams(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN (
                     'exam_24h','exam_30m','exam_started','results_published','exam_changed','exam_cancelled','custom')),
  dedupe_key       text NOT NULL UNIQUE,     -- masalan: exam_24h:<exam_id>:<student_id>
  payload          jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempt_count    integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_due_idx ON notifications (next_attempt_at) WHERE status = 'pending';

-- ───────────── Hisobotlar va zaxira ─────────────
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,
  params        jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  storage_key   text,
  requested_by  uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE TABLE backups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL CHECK (status IN ('running','ok','failed')),
  file_name         text,
  size_bytes        bigint CHECK (size_bytes >= 0),
  sha256            text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  error             text,
  restore_tested_at timestamptz
);

-- ───────────── Audit (o'zgartirib bo'lmaydi) ─────────────
CREATE TABLE audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type        text NOT NULL CHECK (actor_type IN ('admin','student','system')),
  actor_admin_id    uuid REFERENCES admins(id) ON DELETE SET NULL,
  actor_telegram_id bigint,
  action            text NOT NULL,
  entity_type       text NOT NULL,
  entity_id         text,
  before_data       jsonb,
  after_data        jsonb,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs jadvali faqat qo''shish uchun (append-only)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- ───────────── updated_at triggerlari ─────────────
CREATE TRIGGER admins_updated    BEFORE UPDATE ON admins    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER classes_updated   BEFORE UPDATE ON classes   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER students_updated  BEFORE UPDATE ON students  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER questions_updated BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER exams_updated     BEFORE UPDATE ON exams     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER attempts_updated  BEFORE UPDATE ON attempts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER answers_updated   BEFORE UPDATE ON answers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER materials_updated BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
