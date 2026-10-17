-- EngSolve schema, RLS and storage. Apply with `supabase db push`.
create extension if not exists pgcrypto;

-- ───────────── Roles ─────────────
create type public.app_role as enum ('user', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every new auth user gets a plain 'user' profile. Admins are promoted ONLY via SQL (see README).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ───────────── Content ─────────────
create type public.exercise_status as enum ('draft', 'published');

-- Public-facing columns only. Anything private lives in exercise_sources.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  status public.exercise_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index exercises_status_idx on public.exercises (status, published_at desc);
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

-- Admin-only: raw text, file paths, processing state.
create table public.exercise_sources (
  exercise_id uuid primary key references public.exercises (id) on delete cascade,
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded','extracting','extracted','generating_answers','needs_review','failed')),
  processing_error text,
  source_file_path text,
  answer_key_file_path text,
  source_file_hash text,
  original_extracted_text text,
  answer_key_text text,
  ocr_used boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index exercise_sources_hash_idx on public.exercise_sources (source_file_hash);
create trigger exercise_sources_touch before update on public.exercise_sources
  for each row execute function public.touch_updated_at();

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  question_text text not null check (char_length(question_text) <= 4000),
  question_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_exercise_idx on public.questions (exercise_id, question_order);
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  option_label text not null check (char_length(option_label) between 1 and 4),
  option_text text not null check (char_length(option_text) <= 1000),
  option_order integer not null default 0,
  unique (question_id, id),
  unique (question_id, option_label)
);
create index question_options_question_idx on public.question_options (question_id, option_order);

-- Answer key. Split from `questions` so that anonymous clients can read question text
-- WITHOUT being able to read correct answers (RLS is row-level, not column-level).
create table public.question_answers (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_option_id uuid,
  explanation text check (char_length(explanation) <= 2000),
  answer_source text check (answer_source in ('embedded_answer_key','uploaded_answer_key','gemini_ai','admin_manual')),
  -- Categorical, self-reported by the model; NOT a calibrated probability.
  ai_confidence text check (ai_confidence in ('low','medium','high')),
  needs_review boolean not null default true,
  validation_notes text[] not null default '{}',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  -- The correct option must belong to this very question.
  foreign key (question_id, correct_option_id)
    references public.question_options (question_id, id) on delete set null (correct_option_id)
);
create trigger question_answers_touch before update on public.question_answers
  for each row execute function public.touch_updated_at();

-- ───────────── Attempts (written only by Edge Functions with the service role) ─────────────
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  token_hash text not null,               -- sha256 of the secret held by the guest's browser
  total_questions integer not null check (total_questions >= 0),
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  unanswered_count integer not null default 0,
  score_percentage numeric(5,2) not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index attempts_exercise_idx on public.attempts (exercise_id);

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_option_id uuid,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  foreign key (question_id, selected_option_id) references public.question_options (question_id, id)
);

-- ───────────── Row Level Security ─────────────
alter table public.profiles          enable row level security;
alter table public.exercises         enable row level security;
alter table public.exercise_sources  enable row level security;
alter table public.questions         enable row level security;
alter table public.question_options  enable row level security;
alter table public.question_answers  enable row level security;
alter table public.attempts          enable row level security;
alter table public.attempt_answers   enable row level security;

-- profiles: read own row only. No insert/update/delete policies => roles cannot be changed from the client.
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;

-- exercises
create policy exercises_public_read on public.exercises for select to anon, authenticated
  using (status = 'published');
create policy exercises_admin_all on public.exercises for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- exercise_sources (admin only)
create policy exercise_sources_admin_all on public.exercise_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- questions / options: public only when the parent exercise is published
create policy questions_public_read on public.questions for select to anon, authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.status = 'published'));
create policy questions_admin_all on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy options_public_read on public.question_options for select to anon, authenticated
  using (exists (
    select 1 from public.questions q join public.exercises e on e.id = q.exercise_id
    where q.id = question_id and e.status = 'published'));
create policy options_admin_all on public.question_options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- answers: admin only. Learners get correctness from Edge Functions after submitting.
create policy answers_admin_all on public.question_answers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- attempts: no client access except admin read (statistics). Writes happen with the service role.
create policy attempts_admin_read on public.attempts for select to authenticated using (public.is_admin());
create policy attempt_answers_admin_read on public.attempt_answers for select to authenticated using (public.is_admin());

-- Defence in depth: remove table privileges that RLS should already block.
revoke all on public.question_answers, public.exercise_sources, public.attempts, public.attempt_answers from anon;
revoke insert, update, delete on public.exercises, public.questions, public.question_options from anon;
revoke insert, update, delete on public.attempts, public.attempt_answers from authenticated;

-- ───────────── Storage: private PDF bucket ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-pdfs', 'exercise-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

create policy exercise_pdfs_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'exercise-pdfs' and public.is_admin());
create policy exercise_pdfs_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-pdfs' and public.is_admin());
create policy exercise_pdfs_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'exercise-pdfs' and public.is_admin());
create policy exercise_pdfs_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-pdfs' and public.is_admin());
