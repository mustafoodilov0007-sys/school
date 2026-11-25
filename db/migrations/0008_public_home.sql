-- Ochiq bosh sahifa sozlamalari
CREATE TABLE app_settings (
  key        text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 60),
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES ('public_home', '{"showLeaders": true}');
