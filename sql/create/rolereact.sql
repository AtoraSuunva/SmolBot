CREATE TABLE rolereact (
  message varchar(20) PRIMARY KEY,
  roles json,
  single boolean DEFAULT false,
  canclear boolean DEFAULT false,
);
