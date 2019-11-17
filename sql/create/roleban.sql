BEGIN;

CREATE TABLE rolebanned (
  user_id bigint PRIMARY KEY,
  roles text[] DEFAULT '{}'
);

COMMIT;
