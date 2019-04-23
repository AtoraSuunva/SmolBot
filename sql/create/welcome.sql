CREATE TABLE IF NOT EXISTS welcome (
  guild_id bigint PRIMARY KEY,
  message varchar(2000),
  channel bigint,
  rejoins boolean DEFAULT FALSE,
  instant boolean DEFAULT FALSE,
  ignore_roles bigint[] DEFAULT '{}',
  react_with varchar(5),
  joins bigint[] DEFAULT '{}'
);

-- CREATE INDEX IF NOT EXISTS welcome_joins_idx ON welcome USING GIST (joins gist__int_ops);
