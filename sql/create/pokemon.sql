CREATE TABLE IF NOT EXISTS pokemon (
    id integer PRIMARY KEY,
    name character varying(32) NOT NULL,
    type character varying(10) NOT NULL,
    type_alt character varying(10),
    shape character varying(16) NOT NULL,
    color character varying(10) NOT NULL,
    capture_rate integer NOT NULL,
    genus character varying(64) NOT NULL,
    stats json NOT NULL,
    height integer NOT NULL,
    weight integer NOT NULL,
    sprite_front character varying(128) NOT NULL,
    evolves_from character varying(32),
    dex json[] NOT NULL,
    description text NOT NULL,
    gender_rate integer NOT NULL
);
