-- Physics Exam Pro — 0002_bot_support
-- Bot holati (qayta ishga tushganda yo'qolmasligi uchun) va Telegram update'larini takrorlanishdan himoya.

CREATE TABLE bot_states (
  telegram_id bigint PRIMARY KEY CHECK (telegram_id > 0),
  step        text NOT NULL CHECK (length(step) BETWEEN 1 AND 40),
  data        jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bot_states_updated_idx ON bot_states (updated_at);

-- Telegram webhook'ni qayta yuborishi mumkin: har bir update_id faqat bir marta qayta ishlanadi.
CREATE TABLE processed_updates (
  update_id   bigint PRIMARY KEY CHECK (update_id >= 0),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX processed_updates_received_idx ON processed_updates (received_at);
