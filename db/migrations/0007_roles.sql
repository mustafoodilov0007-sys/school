-- Rollar: administrator / o'qituvchi (sinf rahbari, fan o'qituvchisi) / ota-ona / o'quvchi
ALTER TABLE admins ADD COLUMN role    text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','teacher'));
ALTER TABLE admins ADD COLUMN subject text CHECK (subject IS NULL OR length(subject) <= 60);

CREATE TABLE teacher_assignments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id  uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  class_id  uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('homeroom','subject')),
  subject   text CHECK (subject IS NULL OR length(btrim(subject)) BETWEEN 1 AND 60),
  CONSTRAINT ta_subject_required CHECK ((kind = 'subject') = (subject IS NOT NULL))
);
CREATE UNIQUE INDEX ta_homeroom_uq ON teacher_assignments (class_id) WHERE kind = 'homeroom';
CREATE UNIQUE INDEX ta_subject_uq  ON teacher_assignments (admin_id, class_id, lower(subject)) WHERE kind = 'subject';
CREATE INDEX ta_admin_idx ON teacher_assignments (admin_id);

CREATE TABLE parents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name         text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name          text NOT NULL DEFAULT '' CHECK (length(last_name) <= 80),
  phone              text CHECK (phone IS NULL OR length(phone) <= 30),
  link_code          text NOT NULL UNIQUE CHECK (link_code ~ '^OT-[A-Z0-9]{6}$'),
  telegram_id        bigint UNIQUE CHECK (telegram_id IS NULL OR telegram_id > 0),
  telegram_linked_at timestamptz,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parents_link_consistency CHECK ((telegram_id IS NULL) = (telegram_linked_at IS NULL))
);
CREATE TABLE parent_students (
  parent_id  uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);
CREATE INDEX parent_students_student_idx ON parent_students (student_id);

-- Sessiyalar ota-onani ham qamrab oladi
ALTER TABLE sessions DROP CONSTRAINT sessions_subject_type_check;
ALTER TABLE sessions DROP CONSTRAINT sessions_one_subject;
ALTER TABLE sessions ADD COLUMN parent_id uuid REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_subject_type_check CHECK (subject_type IN ('student','admin','parent'));
ALTER TABLE sessions ADD CONSTRAINT sessions_one_subject CHECK (
  (subject_type = 'student' AND student_id IS NOT NULL AND admin_id IS NULL AND parent_id IS NULL) OR
  (subject_type = 'admin'   AND admin_id   IS NOT NULL AND student_id IS NULL AND parent_id IS NULL) OR
  (subject_type = 'parent'  AND parent_id  IS NOT NULL AND student_id IS NULL AND admin_id IS NULL)
);
CREATE INDEX sessions_parent_idx ON sessions (parent_id) WHERE parent_id IS NOT NULL;
