-- The default table that's just a mapping of guild_id => config:json
-- Typically used by most modules that don't require a special table setup

CREATE TABLE IF NOT EXISTS settings (
  guild_id bigint PRIMARY KEY,
  settings json
)
