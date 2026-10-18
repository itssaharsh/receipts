// The whole schema in one place. Applied with `create ... if not exists` on every open, so it is safe to re-run.
export const SCHEMA_SQL = `
create table if not exists rules (
  id text primary key,
  kind text not null,
  label text not null,
  params text not null default '{}',
  use_count integer not null default 0,
  created_at text not null
);

create table if not exists contacts (
  id text primary key,
  name text not null,
  email text,
  phone text
);

create table if not exists tasks (
  id text primary key,
  run_id text not null,
  text text not null,
  counterparty text not null,
  amount_cents integer not null default 0,
  category text not null,
  postcondition text not null,
  status text not null,
  decision text,
  user_decision text,
  allowed_by_rule_id text,
  fo_conversation_id text,
  fo_progress text not null default '[]',
  fo_claim text,
  fo_question text,
  check_result text,
  verified_by text,
  reask_count integer not null default 0,
  error text,
  simulated integer not null default 0,
  created_at text not null,
  updated_at text not null,
  dispatched_at text,
  checked_at text
);
create index if not exists tasks_run on tasks(run_id);

create table if not exists trace_events (
  seq integer primary key autoincrement,
  id text not null unique,
  run_id text not null,
  task_id text,
  ts text not null,
  kind text not null,
  summary text not null,
  payload text not null default '{}'
);
create index if not exists trace_run on trace_events(run_id, seq);

create table if not exists oauth (
  provider text primary key,
  client_information text,
  tokens text,
  code_verifier text,
  state text,
  discovery text,
  updated_at text not null
);

create table if not exists meta (
  key text primary key,
  value text not null
);
`;
