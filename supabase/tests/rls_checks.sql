-- Manual RLS verification. NOT run automatically. Paste into the Supabase SQL editor (it runs in a transaction and rolls back).
-- Every line prefixed "EXPECT" states the required outcome.
begin;
  insert into public.exercises (id, title, status) values
    ('00000000-0000-0000-0000-0000000000d1', 'Draft ex', 'draft'),
    ('00000000-0000-0000-0000-0000000000a1', 'Published ex', 'published');
  insert into public.questions (id, exercise_id, question_text) values
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'draft q'),
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'pub q');

  set local role anon;
  select 'EXPECT 1 (only the published exercise)' as check, count(*) from public.exercises;
  select 'EXPECT 1 (only the published exercise''s question)' as check, count(*) from public.questions;
  -- EXPECT: permission denied (anon has no privileges on the answer key, sources or attempts)
  do $$ begin perform 1 from public.question_answers; exception when insufficient_privilege then raise notice 'OK: answers blocked'; end $$;
  do $$ begin perform 1 from public.exercise_sources; exception when insufficient_privilege then raise notice 'OK: sources blocked'; end $$;
  do $$ begin perform 1 from public.attempts; exception when insufficient_privilege then raise notice 'OK: attempts blocked'; end $$;
  -- EXPECT: permission denied for every write
  do $$ begin update public.exercises set title = 'x'; exception when insufficient_privilege then raise notice 'OK: update blocked'; end $$;
  do $$ begin insert into public.exercises (title) values ('x'); exception when insufficient_privilege then raise notice 'OK: insert blocked'; end $$;
rollback;
-- Also check manually while signed in as a NON-admin user: `update profiles set role='admin'` must fail,
-- and `select * from storage.objects where bucket_id='exercise-pdfs'` must return 0 rows.
