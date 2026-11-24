-- Maktab moduli: dars jadvali, elektron jurnal (baholar), davomat
CREATE TABLE schedule_slots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  lesson_no  smallint NOT NULL CHECK (lesson_no BETWEEN 1 AND 10),
  subject    text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 60),
  room       text CHECK (room IS NULL OR length(room) <= 20),
  starts_at  time,
  ends_at    time,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, weekday, lesson_no),
  CONSTRAINT schedule_time_order CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE grades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  admin_id   uuid REFERENCES admins(id) ON DELETE SET NULL,
  grade_date date NOT NULL,
  subject    text NOT NULL DEFAULT 'Fizika' CHECK (length(btrim(subject)) BETWEEN 1 AND 60),
  value      smallint NOT NULL CHECK (value BETWEEN 1 AND 5),
  kind       text NOT NULL DEFAULT 'daily' CHECK (kind IN ('daily','quiz','exam','quarter','year')),
  topic      text CHECK (topic IS NULL OR length(topic) <= 200),
  comment    text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grades_student_idx ON grades (student_id, grade_date DESC);

CREATE TABLE attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  status      text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note        text CHECK (note IS NULL OR length(note) <= 200),
  admin_id    uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_date)
);
CREATE INDEX attendance_date_idx ON attendance (lesson_date);
