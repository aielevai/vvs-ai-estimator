-- RLS policies for cases table
alter table cases enable row level security;

drop policy if exists "update cases (auth)" on cases;
create policy "update cases (auth)" on cases
  for update to authenticated
  using (true) with check (true);

drop policy if exists "select cases (auth)" on cases;
create policy "select cases (auth)" on cases
  for select to authenticated
  using (true);

drop policy if exists "insert cases (auth)" on cases;
create policy "insert cases (auth)" on cases
  for insert to authenticated
  with check (true);

drop policy if exists "delete cases (auth)" on cases;
create policy "delete cases (auth)" on cases
  for delete to authenticated
  using (true);