create table if not exists public.platform_settings (
  id text primary key check (id = 'registration'),
  public_registration_enabled boolean not null default true,
  require_email_confirmation boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, public_registration_enabled, require_email_confirmation)
values ('registration', true, true)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
