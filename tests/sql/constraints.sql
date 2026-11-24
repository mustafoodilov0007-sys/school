-- DB cheklovlarini tekshirish. Migratsiyalardan keyin, BIR tranzaksiya ichida ishlaydi va ROLLBACK qilinadi
-- (run.mjs shuni ta'minlaydi), shuning uchun bazada iz qolmaydi.

CREATE FUNCTION pg_temp.expect_err(code text, stmt text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE succeeded boolean := false;
BEGIN
  BEGIN
    EXECUTE stmt;
    succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> code THEN
      RAISE EXCEPTION 'KUTILGAN % LEKIN % (%): %', code, SQLSTATE, SQLERRM, stmt;
    END IF;
  END;
  IF succeeded THEN
    RAISE EXCEPTION 'KUTILGAN % LEKIN MUVAFFAQIYATLI BAJARILDI: %', code, stmt;
  END IF;
END
$f$;

CREATE FUNCTION pg_temp.assert_true(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF;
END
$f$;

-- ───── tayyorgarlik ─────
INSERT INTO admins (id, telegram_id, display_name) VALUES ('00000000-0000-0000-0000-0000000000a1', 111, 'Teacher');
INSERT INTO classes (id, name, code_label) VALUES ('00000000-0000-0000-0000-0000000000c1', '8-A', '8A');
INSERT INTO students (id, class_id, first_name, last_name, code) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'Aziz', 'Karimov', 'PH-8A-0417'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'Nilufar', 'Ergasheva', 'PH-8A-0418');

-- ───── sinflar ─────
SELECT pg_temp.expect_err('23505', $$INSERT INTO classes (name, code_label) VALUES ('Boshqa', '8A')$$);              -- code_label unique
SELECT pg_temp.expect_err('23505', $$INSERT INTO classes (name, code_label) VALUES (' 8-a ', '8B')$$);              -- faol sinf nomi (katta-kichik harfsiz) unique
SELECT pg_temp.expect_err('23514', $$INSERT INTO classes (name, code_label) VALUES ('9-A', '9-A')$$);               -- label formati

-- ───── o'quvchilar ─────
SELECT pg_temp.expect_err('23505', $$INSERT INTO students (class_id, first_name, last_name, code) VALUES ('00000000-0000-0000-0000-0000000000c1','X','Y','PH-8A-0417')$$);  -- kod unique
SELECT pg_temp.expect_err('23514', $$INSERT INTO students (class_id, first_name, last_name, code) VALUES ('00000000-0000-0000-0000-0000000000c1','X','Y','ph-8a-1')$$);   -- kod formati
SELECT pg_temp.expect_err('23514', $$UPDATE students SET telegram_id = 5 WHERE code = 'PH-8A-0417'$$);              -- telegram_id bor, linked_at yo'q
UPDATE students SET telegram_id = 5001, telegram_linked_at = now() WHERE code = 'PH-8A-0417';
SELECT pg_temp.expect_err('23505', $$UPDATE students SET telegram_id = 5001, telegram_linked_at = now() WHERE code = 'PH-8A-0418'$$);  -- bitta Telegram — bitta o'quvchi

-- Atomik bog'lash: ikkinchi urinish 0 qatorni yangilaydi (idempotent/poyga xavfsiz)
DO $$
DECLARE n int;
BEGIN
  UPDATE students SET telegram_id = 5002, telegram_linked_at = now()
   WHERE id = '00000000-0000-0000-0000-0000000000b1' AND telegram_id IS NULL AND is_active;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert_true(n = 0, 'band ID boshqa akkauntga bog''lanmasligi kerak');
END $$;

-- Sinfni o'chirib bo'lmaydi (o'quvchilari bor)
SELECT pg_temp.expect_err('23503', $$DELETE FROM classes WHERE id = '00000000-0000-0000-0000-0000000000c1'$$);

-- ───── sessiyalar ─────
SELECT pg_temp.expect_err('23514', $$INSERT INTO sessions (subject_type, student_id, admin_id, token_hash, expires_at)
  VALUES ('student','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','h1', now() + interval '1 hour')$$);
SELECT pg_temp.expect_err('23514', $$INSERT INTO sessions (subject_type, token_hash, expires_at) VALUES ('student','h2', now() + interval '1 hour')$$);
SELECT pg_temp.expect_err('23514', $$INSERT INTO sessions (subject_type, student_id, token_hash, expires_at)
  VALUES ('student','00000000-0000-0000-0000-0000000000b1','h3', now() - interval '1 hour')$$);
INSERT INTO sessions (subject_type, student_id, token_hash, expires_at) VALUES ('student','00000000-0000-0000-0000-0000000000b1','ok1', now() + interval '1 hour');
SELECT pg_temp.expect_err('23505', $$INSERT INTO sessions (subject_type, student_id, token_hash, expires_at)
  VALUES ('student','00000000-0000-0000-0000-0000000000b1','ok1', now() + interval '1 hour')$$);  -- token_hash unique

-- ───── admin login token: bir martalik ─────
INSERT INTO admin_login_tokens (admin_id, token_hash, expires_at) VALUES ('00000000-0000-0000-0000-0000000000a1','tok1', now() + interval '5 minutes');
DO $$
DECLARE n int;
BEGIN
  UPDATE admin_login_tokens SET used_at = now() WHERE token_hash = 'tok1' AND used_at IS NULL AND expires_at > now();
  GET DIAGNOSTICS n = ROW_COUNT; PERFORM pg_temp.assert_true(n = 1, 'birinchi almashtirish ishlashi kerak');
  UPDATE admin_login_tokens SET used_at = now() WHERE token_hash = 'tok1' AND used_at IS NULL AND expires_at > now();
  GET DIAGNOSTICS n = ROW_COUNT; PERFORM pg_temp.assert_true(n = 0, 'ikkinchi almashtirish ishlamasligi kerak');
END $$;

-- ───── audit: faqat qo'shish ─────
INSERT INTO audit_logs (actor_type, action, entity_type, entity_id) VALUES ('system', 'test', 'x', '1');
SELECT pg_temp.expect_err('P0001', $$UPDATE audit_logs SET action = 'tampered'$$);
SELECT pg_temp.expect_err('P0001', $$DELETE FROM audit_logs$$);
SELECT pg_temp.expect_err('23514', $$INSERT INTO audit_logs (actor_type, action, entity_type) VALUES ('hacker','a','b')$$);

-- ───── imtihon va urinishlar (2-bosqichga tayyorlik) ─────
INSERT INTO exams (id, title, starts_at, ends_at, duration_minutes)
  VALUES ('00000000-0000-0000-0000-0000000000e1', 'Hafta 1', now(), now() + interval '2 hours', 40);
SELECT pg_temp.expect_err('23514', $$INSERT INTO exams (title, starts_at, ends_at, duration_minutes) VALUES ('Xato', now(), now(), 40)$$);
SELECT pg_temp.expect_err('23514', $$INSERT INTO exams (title, starts_at, ends_at, duration_minutes, pass_percent) VALUES ('Xato', now(), now() + interval '1 hour', 40, 101)$$);

INSERT INTO attempts (exam_id, student_id, deadline_at) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1', now() + interval '40 minutes');
-- bitta faol urinish qoidasi
SELECT pg_temp.expect_err('23505', $$INSERT INTO attempts (exam_id, student_id, attempt_no, deadline_at)
  VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1', 2, now() + interval '40 minutes')$$);
-- yakunlangan urinish bo'lsa, qayta topshirish uchun yangisi ochilishi mumkin
UPDATE attempts SET status = 'submitted', submitted_at = now(), finish_reason = 'student' WHERE student_id = '00000000-0000-0000-0000-0000000000b1';
INSERT INTO attempts (exam_id, student_id, attempt_no, deadline_at)
  VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1', 2, now() + interval '40 minutes');
SELECT pg_temp.expect_err('23514', $$UPDATE attempts SET score = 30, max_score = 25 WHERE attempt_no = 2$$);                 -- ball > maksimum
SELECT pg_temp.expect_err('23514', $$UPDATE attempts SET status = 'submitted' WHERE attempt_no = 2$$);                      -- submitted_at yo'q

-- ───── javoblar: idempotentlik ─────
INSERT INTO questions (id, type, body) VALUES ('00000000-0000-0000-0000-0000000000f1', 'text', 'F = ma');
INSERT INTO attempt_questions (id, attempt_id, question_id, position, points)
  SELECT '00000000-0000-0000-0000-0000000000d1', id, '00000000-0000-0000-0000-0000000000f1', 0, 1 FROM attempts WHERE attempt_no = 2;
INSERT INTO answer_ops (client_op_id, attempt_id, attempt_question_id, applied_version)
  SELECT '00000000-0000-0000-0000-0000000000aa', attempt_id, id, 1 FROM attempt_questions;
SELECT pg_temp.expect_err('23505', $$INSERT INTO answer_ops (client_op_id, attempt_id, attempt_question_id, applied_version)
  SELECT '00000000-0000-0000-0000-0000000000aa', attempt_id, id, 2 FROM attempt_questions$$);

-- ───── bildirishnoma dedupe, bot update dedupe ─────
INSERT INTO notifications (kind, dedupe_key) VALUES ('exam_24h', 'exam_24h:e1:b1');
SELECT pg_temp.expect_err('23505', $$INSERT INTO notifications (kind, dedupe_key) VALUES ('exam_24h', 'exam_24h:e1:b1')$$);
INSERT INTO processed_updates (update_id) VALUES (42);
DO $$
DECLARE n int;
BEGIN
  INSERT INTO processed_updates (update_id) VALUES (42) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert_true(n = 0, 'takroriy update_id ikkinchi marta qabul qilinmasligi kerak');
END $$;

-- ───── updated_at trigger (tranzaksiya ichida now() o'zgarmaydi, shuning uchun qo'lda qo'yilgan qiymat ustidan yoziladi) ─────
DO $$
DECLARE after_ts timestamptz;
BEGIN
  UPDATE students SET first_name = 'Nilufar2', updated_at = '2000-01-01' WHERE code = 'PH-8A-0418';
  SELECT updated_at INTO after_ts FROM students WHERE code = 'PH-8A-0418';
  PERFORM pg_temp.assert_true(after_ts > '2020-01-01', 'updated_at trigger qiymatni yangilashi kerak');
END $$;

-- ───── 2-bosqich: source, topic_distribution, retake_grants ─────
SELECT pg_temp.expect_err('23514', $$INSERT INTO exams (title, starts_at, ends_at, duration_minutes, source) VALUES ('X', now(), now() + interval '1 hour', 40, 'magic')$$);
SELECT pg_temp.expect_err('23514', $$INSERT INTO exams (title, starts_at, ends_at, duration_minutes, topic_distribution) VALUES ('X', now(), now() + interval '1 hour', 40, '[1,2]'::jsonb)$$);
INSERT INTO exams (title, starts_at, ends_at, duration_minutes, source, topic_distribution)
  VALUES ('Tasodifiy', now(), now() + interval '1 hour', 40, 'random', '{"t1": 5}'::jsonb);
INSERT INTO retake_grants (exam_id, student_id, granted_by, reason)
  VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Kasal bo''lgan');
SELECT pg_temp.expect_err('23505', $$INSERT INTO retake_grants (exam_id, student_id, reason) VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'takror')$$);
SELECT pg_temp.expect_err('23514', $$INSERT INTO retake_grants (exam_id, student_id, reason) VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', '   ')$$);
-- ishlatilgandan keyin yangi ruxsat berish mumkin
DO $$
BEGIN
  UPDATE retake_grants SET used_attempt_id = (SELECT id FROM attempts LIMIT 1) WHERE student_id = '00000000-0000-0000-0000-0000000000b1';
  INSERT INTO retake_grants (exam_id, student_id, reason) VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'yana');
END $$;

SELECT 'SQL CHEKLOVLARI: HAMMASI O''TDI' AS natija;
