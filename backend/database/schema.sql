-- Esquema inicial para PostgreSQL/Supabase.
-- Execute em um projeto Supabase. O acesso de escrita da aplicacao deve passar
-- pela API usando a chave service_role, mantida exclusivamente no servidor.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'USER',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  age_confirmed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id text primary key check (id = 'registration'),
  public_registration_enabled boolean not null default true,
  require_email_confirmation boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, public_registration_enabled, require_email_confirmation)
values ('registration', true, true)
on conflict (id) do nothing;

-- A funcao e SECURITY DEFINER para que a verificacao do papel nao dependa das
-- policies RLS da tabela profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'ADMIN'
      and p.status = 'ACTIVE'
  );
$$;

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce((select auth.role()), '') <> 'service_role'
     and (select auth.uid()) is not null then
    raise exception 'O papel do perfil so pode ser alterado por operacao administrativa confiavel'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
before update of role on public.profiles
for each row execute function public.prevent_profile_role_escalation();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('TERMS', 'PRIVACY')),
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  created_at timestamptz not null default now(),
  unique (user_id, document_type, document_version)
);

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('EXPORT', 'DELETE')),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  youtube_url text not null,
  youtube_id text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  language text not null default 'pt-BR',
  embeddable boolean not null default false,
  rights_basis text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (youtube_id)
);

create table if not exists public.video_category_relations (
  video_id uuid not null references public.videos(id) on delete cascade,
  category_id uuid not null references public.video_categories(id) on delete cascade,
  primary key (video_id, category_id)
);

create table if not exists public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  content text not null,
  language text not null default 'pt-BR',
  status text not null default 'PENDING_REVIEW'
    check (status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED')),
  origin text not null check (origin in ('ADMIN_UPLOAD', 'AUTHORIZED_API', 'AUTHORIZED_ASR')),
  rights_declared_by uuid not null references public.profiles(id) on delete restrict,
  rights_note text not null,
  checksum text not null,
  created_at timestamptz not null default now(),
  unique (video_id, checksum)
);

create table if not exists public.transcription_segments (
  id uuid primary key default gen_random_uuid(),
  transcription_id uuid not null references public.transcriptions(id) on delete cascade,
  start_time_seconds numeric(10, 3) not null check (start_time_seconds >= 0),
  end_time_seconds numeric(10, 3) not null,
  speaker text,
  content text not null,
  check (end_time_seconds >= start_time_seconds)
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  job_type text not null check (job_type in ('ANALYSIS', 'QUIZ_GENERATION')),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  step text not null default 'QUEUED',
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text not null unique,
  locked_by text,
  lease_expires_at timestamptz,
  next_run_at timestamptz not null default now(),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_estimate numeric(12, 6) not null default 0 check (cost_estimate >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  transcription_id uuid not null references public.transcriptions(id) on delete restrict,
  analysis_json jsonb not null,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fallacies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  examples jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED')),
  source_job_id uuid references public.ai_jobs(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (video_id, version),
  unique (id, video_id)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  statement text not null,
  explanation text not null,
  category text not null,
  difficulty text not null check (difficulty in ('EASY', 'MEDIUM', 'HARD')),
  evidence_excerpt text not null,
  timestamp_seconds integer check (timestamp_seconds is null or timestamp_seconds >= 0),
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  unique (id, quiz_id)
);

create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  content text not null,
  position_hint integer not null check (position_hint > 0),
  unique (question_id, position_hint),
  unique (question_id, id)
);

-- O gabarito fica isolado das alternativas e nao possui policy de leitura para usuarios.
create table if not exists public.question_answer_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option_id uuid not null,
  foreign key (question_id, correct_option_id)
    references public.question_options(question_id, id) on delete restrict
);

create table if not exists public.quiz_review_events (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('EDIT', 'APPROVE', 'REJECT', 'REGENERATE')),
  diff jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  content text not null,
  video_url text,
  materials jsonb not null default '[]'::jsonb,
  category text,
  version integer not null default 1 check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  unique (title, version)
);

create table if not exists public.lesson_module_relations (
  module_id uuid not null references public.lesson_modules(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (module_id, lesson_id),
  unique (module_id, position)
);

create table if not exists public.required_lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  scope text not null check (scope in ('GLOBAL', 'CATEGORY', 'VIDEO')),
  scope_id uuid,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (scope = 'GLOBAL' and scope_id is null)
    or (scope in ('CATEGORY', 'VIDEO') and scope_id is not null)
  )
);

create table if not exists public.user_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete restrict,
  quiz_id uuid not null,
  cycle_number integer not null check (cycle_number > 0),
  state text not null default 'NOT_STARTED'
    check (state in (
      'NOT_STARTED', 'INITIAL_VIDEO', 'INITIAL_QUIZ', 'LEARNING',
      'FINAL_VIDEO', 'FINAL_QUIZ', 'COMPLETED', 'ABANDONED', 'BLOCKED'
    )),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'ABANDONED', 'BLOCKED')),
  state_updated_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, video_id, cycle_number),
  foreign key (quiz_id, video_id) references public.quizzes(id, video_id) on delete restrict
);

create unique index if not exists user_cycles_one_active_per_video
  on public.user_cycles (user_id, video_id)
  where status = 'ACTIVE';

create table if not exists public.video_watch_events (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  stage text not null check (stage in ('INITIAL', 'FINAL')),
  event_type text not null check (event_type in ('PLAY', 'PAUSE', 'SEEK', 'ENDED', 'HEARTBEAT')),
  position_seconds numeric(10, 3) not null check (position_seconds >= 0),
  playback_rate numeric(4, 2) not null default 1 check (playback_rate > 0 and playback_rate <= 2),
  client_ts timestamptz not null,
  server_ts timestamptz not null default now()
);

create table if not exists public.video_progress (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  stage text not null check (stage in ('INITIAL', 'FINAL')),
  unique_seconds_watched integer not null default 0 check (unique_seconds_watched >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (cycle_id, stage)
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  completed_at timestamptz not null default now(),
  unique (cycle_id, lesson_id)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete restrict,
  attempt_type text not null check (attempt_type in ('INITIAL', 'FINAL')),
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED')),
  score numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  idempotency_key text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  unique (cycle_id, attempt_type),
  unique (idempotency_key),
  unique (id, quiz_id)
);

create table if not exists public.attempt_question_order (
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  position integer not null check (position > 0),
  option_order jsonb not null,
  primary key (attempt_id, question_id),
  unique (attempt_id, position)
);

create table if not exists public.user_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  quiz_id uuid not null,
  question_id uuid not null,
  selected_option_id uuid not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  foreign key (attempt_id, quiz_id) references public.quiz_attempts(id, quiz_id) on delete cascade,
  foreign key (question_id, quiz_id) references public.questions(id, quiz_id) on delete restrict,
  foreign key (question_id, selected_option_id)
    references public.question_options(question_id, id) on delete restrict
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_status_idx on public.profiles (role, status);
create index if not exists consents_user_accepted_idx on public.consents (user_id, accepted_at desc);
create index if not exists data_requests_user_status_idx on public.data_requests (user_id, status);
create index if not exists videos_status_created_idx on public.videos (status, created_at desc);
create index if not exists video_category_relations_category_idx on public.video_category_relations (category_id);
create index if not exists transcriptions_video_created_idx on public.transcriptions (video_id, created_at desc);
create index if not exists transcription_segments_transcription_start_idx on public.transcription_segments (transcription_id, start_time_seconds);
create index if not exists ai_jobs_queue_idx on public.ai_jobs (status, next_run_at, created_at);
create index if not exists ai_jobs_video_idx on public.ai_jobs (video_id, created_at desc);
create index if not exists ai_analyses_video_created_idx on public.ai_analyses (video_id, created_at desc);
create index if not exists quizzes_video_status_idx on public.quizzes (video_id, status);
create index if not exists questions_quiz_idx on public.questions (quiz_id);
create index if not exists question_options_question_idx on public.question_options (question_id);
create index if not exists quiz_review_events_quiz_created_idx on public.quiz_review_events (quiz_id, created_at desc);
create index if not exists lessons_status_category_idx on public.lessons (status, category);
create index if not exists required_lessons_scope_idx on public.required_lessons (scope, scope_id);
create index if not exists user_cycles_user_status_idx on public.user_cycles (user_id, status, created_at desc);
create index if not exists user_cycles_video_idx on public.user_cycles (video_id, status);
create index if not exists video_watch_events_cycle_stage_ts_idx on public.video_watch_events (cycle_id, stage, server_ts);
create index if not exists lesson_progress_cycle_idx on public.lesson_progress (cycle_id);
create index if not exists quiz_attempts_cycle_status_idx on public.quiz_attempts (cycle_id, status);
create index if not exists user_answers_attempt_idx on public.user_answers (attempt_id);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

-- O backend valida as transicoes, progresso, gabarito e tentativas usando a
-- service_role. Acesso direto do cliente fica restrito a leituras explicitamente
-- seguras e aos dados pessoais do proprio titular.
alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.consents enable row level security;
alter table public.data_requests enable row level security;
alter table public.video_categories enable row level security;
alter table public.videos enable row level security;
alter table public.video_category_relations enable row level security;
alter table public.transcriptions enable row level security;
alter table public.transcription_segments enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.fallacies enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.quiz_review_events enable row level security;
alter table public.lesson_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_module_relations enable row level security;
alter table public.required_lessons enable row level security;
alter table public.user_cycles enable row level security;
alter table public.video_watch_events enable row level security;
alter table public.video_progress enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.attempt_question_order enable row level security;
alter table public.user_answers enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "consents_select_own_or_admin" on public.consents;
create policy "consents_select_own_or_admin" on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "consents_insert_own" on public.consents;
create policy "consents_insert_own" on public.consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "data_requests_select_own_or_admin" on public.data_requests;
create policy "data_requests_select_own_or_admin" on public.data_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "data_requests_insert_own" on public.data_requests;
create policy "data_requests_insert_own" on public.data_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "categories_read_all" on public.video_categories;
create policy "categories_read_all" on public.video_categories
  for select to anon, authenticated using (true);

drop policy if exists "videos_read_published_or_admin" on public.videos;
create policy "videos_read_published_or_admin" on public.videos
  for select to anon, authenticated
  using ((status = 'PUBLISHED' and deleted_at is null) or (select public.is_admin()));

drop policy if exists "video_category_relations_read_published" on public.video_category_relations;
create policy "video_category_relations_read_published" on public.video_category_relations
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.videos v
      where v.id = video_id and v.status = 'PUBLISHED' and v.deleted_at is null
    )
  );

drop policy if exists "lesson_modules_read_published" on public.lesson_modules;
create policy "lesson_modules_read_published" on public.lesson_modules
  for select to anon, authenticated
  using (status = 'PUBLISHED' or (select public.is_admin()));

drop policy if exists "lessons_read_published" on public.lessons;
create policy "lessons_read_published" on public.lessons
  for select to anon, authenticated
  using (status = 'PUBLISHED' or (select public.is_admin()));

drop policy if exists "lesson_module_relations_read_published" on public.lesson_module_relations;
create policy "lesson_module_relations_read_published" on public.lesson_module_relations
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.lesson_modules m
      join public.lessons l on l.id = lesson_id
      where m.id = module_id and m.status = 'PUBLISHED' and l.status = 'PUBLISHED'
    )
  );

drop policy if exists "required_lessons_read_published" on public.required_lessons;
create policy "required_lessons_read_published" on public.required_lessons
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'PUBLISHED')
  );

drop policy if exists "user_cycles_select_own_or_admin" on public.user_cycles;
create policy "user_cycles_select_own_or_admin" on public.user_cycles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "video_progress_select_own_or_admin" on public.video_progress;
create policy "video_progress_select_own_or_admin" on public.video_progress
  for select to authenticated
  using (
    exists (
      select 1 from public.user_cycles c
      where c.id = cycle_id and (c.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "lesson_progress_select_own_or_admin" on public.lesson_progress;
create policy "lesson_progress_select_own_or_admin" on public.lesson_progress
  for select to authenticated
  using (
    exists (
      select 1 from public.user_cycles c
      where c.id = cycle_id and (c.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- Privilegios minimos para las operaciones directas permitidas por las policies.
revoke all on public.profiles from anon, authenticated;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

revoke all on public.consents from anon, authenticated;
grant select, insert on public.consents to authenticated;

revoke all on public.data_requests from anon, authenticated;
grant select, insert on public.data_requests to authenticated;

revoke all on public.video_categories from anon, authenticated;
grant select on public.video_categories to anon, authenticated;

revoke all on public.videos from anon, authenticated;
grant select on public.videos to anon, authenticated;

revoke all on public.video_category_relations from anon, authenticated;
grant select on public.video_category_relations to anon, authenticated;

revoke all on public.lesson_modules, public.lessons, public.lesson_module_relations,
  public.required_lessons from anon, authenticated;
grant select on public.lesson_modules, public.lessons, public.lesson_module_relations,
  public.required_lessons to anon, authenticated;

revoke all on public.user_cycles, public.video_progress, public.lesson_progress,
  public.audit_logs from anon, authenticated;
grant select on public.user_cycles, public.video_progress, public.lesson_progress,
  public.audit_logs to authenticated;

-- Por design, nao conceda acesso direto ao cliente a transcricoes, dados da IA,
-- questionarios, respostas, gabaritos, tentativas ou eventos de reproducao.
-- A API deve devolver somente os campos permitidos para cada etapa do ciclo.
