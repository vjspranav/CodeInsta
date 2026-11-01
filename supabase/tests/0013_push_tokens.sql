-- Run with: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0013_push_tokens.sql
-- Everything is rolled back. Needs migration 0013 applied.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-b@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-nonmember@example.invalid');
insert into public.members (user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'member'),
  ('00000000-0000-0000-0000-0000000000b2', 'member');

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000000b1';
  b constant uuid := '00000000-0000-0000-0000-0000000000b2';
  c constant uuid := '00000000-0000-0000-0000-0000000000b3';
  tok constant text := 'ExponentPushToken[claim-test-0001]';
  n integer;
  failed boolean;
begin
  -- Member A claims the token.
  perform set_config('request.jwt.claims', '{"sub":"' || a || '","role":"authenticated"}', true);
  set local role authenticated;
  perform public.claim_push_token(tok, 'android');
  perform public.claim_push_token(tok, 'ios');  -- idempotent, updates platform
  select count(*) into n from public.push_tokens where token = tok;
  assert n = 1, 'one row after repeated claim';
  assert (select platform from public.push_tokens where token = tok) = 'ios', 'platform updated';

  -- Member B signs in on the same device: A's row is removed.
  perform set_config('request.jwt.claims', '{"sub":"' || b || '","role":"authenticated"}', true);
  perform public.claim_push_token(tok, 'android');
  select count(*) into n from public.push_tokens where token = tok;
  assert n = 1, 'only the newest owner keeps the token';
  assert (select user_id from public.push_tokens where token = tok) = b, 'B owns the token';

  -- Validation.
  begin
    perform public.claim_push_token(tok, 'web');
    failed := false;
  exception when others then failed := true;
  end;
  assert failed, 'bad platform rejected';
  begin
    perform public.claim_push_token('short', 'ios');
    failed := false;
  exception when others then failed := true;
  end;
  assert failed, 'short token rejected';

  -- Non-member is refused.
  perform set_config('request.jwt.claims', '{"sub":"' || c || '","role":"authenticated"}', true);
  begin
    perform public.claim_push_token(tok, 'ios');
    failed := false;
  exception when sqlstate '42501' then failed := true;
  end;
  assert failed, 'non-member refused';

  -- anon cannot execute it.
  set local role anon;
  begin
    perform public.claim_push_token(tok, 'ios');
    failed := false;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon refused';
end;
$$;

rollback;
