BEGIN;

CREATE TABLE IF NOT EXISTS automod (
  guild_id bigint PRIMARY KEY,
  roleban_role bigint NOT NULL,
  prepend varchar(2000) DEFAULT '' NOT NULL,
  silence_prepend varchar(100)[] DEFAULT '{}' NOT NULL
);

CREATE TABLE IF NOT EXISTS automod_rules (
  id serial PRIMARY KEY,
  guild_id bigint REFERENCES automod(guild_id),
  rule_name varchar(50) NOT NULL,
  punishment varchar(2000) NOT NULL DEFAULT 'roleban',
  trigger_limit int NOT NULL DEFAULT 1 CHECK (trigger_limit > 0),
  timeout int NOT NULL DEFAULT 3000 CHECK (timeout >= 0),
  params varchar(50)[] NOT NULL DEFAULT '{}'
);

COMMIT;
