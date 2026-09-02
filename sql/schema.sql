-- Agenda Jet Skis — schema completo para Supabase
-- Execute este arquivo inteiro no SQL Editor do projeto Supabase.

create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jetskis (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'available' check (status in ('available', 'unavailable')),
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.settings (
  id integer primary key check (id = 1),
  open_time time not null default '08:00',
  close_time time not null default '18:00',
  slot_duration_minutes integer not null default 60 check (slot_duration_minutes in (30, 60, 90, 120))
);

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.bookings (
  id uuid primary key default uuid_generate_v4(),
  jetski_id uuid not null references public.jetskis(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null check (char_length(btrim(user_name)) between 1 and 40),
  date date not null,
  start_time time not null,
  end_time time not null,
  type text not null default 'booking' check (type in ('booking', 'blocked')),
  reason text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  time_range tsrange generated always as (
    tsrange(
      (date + start_time)::timestamp,
      (date + end_time)::timestamp,
      '[)'
    )
  ) stored,
  constraint valid_booking_time check (end_time > start_time),
  constraint blocked_booking_reason check (type = 'booking' or reason is not null)
);

create index if not exists profiles_created_at_idx on public.profiles (created_at);
create index if not exists jetskis_owner_id_idx on public.jetskis (owner_id);
create index if not exists bookings_date_idx on public.bookings (date, start_time);
create index if not exists bookings_user_id_idx on public.bookings (user_id);

alter table public.bookings
  drop constraint if exists no_overlapping_bookings;

alter table public.bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    jetski_id with =,
    time_range with &&
  ) where (status = 'scheduled');

-- Função usada nas políticas RLS sem causar recursão ao consultar profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Evita que um usuário comum se promova a administrador por uma chamada direta à API.
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() and new.is_admin is distinct from old.is_admin then
    raise exception 'Somente um administrador pode alterar a flag de administrador';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_admin_flag on public.profiles;
create trigger protect_profile_admin_flag
before update on public.profiles
for each row execute function public.protect_admin_flag();

alter table public.profiles enable row level security;
alter table public.jetskis enable row level security;
alter table public.settings enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check (
  auth.uid() = id
  and is_admin = false
);

drop policy if exists "Users and admins can update profiles" on public.profiles;
create policy "Users and admins can update profiles"
on public.profiles for update
to authenticated
using (auth.uid() = id or is_admin())
with check (auth.uid() = id or is_admin());

drop policy if exists "Authenticated users can read jet skis" on public.jetskis;
create policy "Authenticated users can read jet skis"
on public.jetskis for select
to authenticated
using (true);

drop policy if exists "Admins can create jet skis" on public.jetskis;
create policy "Admins can create jet skis"
on public.jetskis for insert
to authenticated
with check (is_admin());

drop policy if exists "Admins can update jet skis" on public.jetskis;
create policy "Admins can update jet skis"
on public.jetskis for update
to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Admins can delete jet skis" on public.jetskis;
create policy "Admins can delete jet skis"
on public.jetskis for delete
to authenticated
using (is_admin());

drop policy if exists "Authenticated users can read settings" on public.settings;
create policy "Authenticated users can read settings"
on public.settings for select
to authenticated
using (true);

drop policy if exists "Admins can update settings" on public.settings;
create policy "Admins can update settings"
on public.settings for update
to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Authenticated users can read bookings" on public.bookings;
create policy "Authenticated users can read bookings"
on public.bookings for select
to authenticated
using (true);

drop policy if exists "Users can create bookings" on public.bookings;
create policy "Users can create bookings"
on public.bookings for insert
to authenticated
with check (
  (auth.uid() = user_id and type = 'booking')
  or (is_admin() and type in ('booking', 'blocked'))
);

drop policy if exists "Owners can cancel their bookings and admins can manage all" on public.bookings;
create policy "Owners can cancel their bookings and admins can manage all"
on public.bookings for update
to authenticated
using (auth.uid() = user_id or is_admin())
with check (
  is_admin()
  or (
    auth.uid() = user_id
    and type = 'booking'
    and status = 'cancelled'
  )
);

-- Bucket público para as fotos exibidas na agenda.
insert into storage.buckets (id, name, public)
values ('jetski-photos', 'jetski-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Anyone can view jet ski photos" on storage.objects;
create policy "Anyone can view jet ski photos"
on storage.objects for select
using (bucket_id = 'jetski-photos');

drop policy if exists "Owners and admins can upload jet ski photos" on storage.objects;
create policy "Owners and admins can upload jet ski photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'jetski-photos'
  and (
    is_admin()
    or exists (
      select 1
      from public.jetskis j
      where j.id::text = (storage.foldername(name))[1]
        and j.owner_id = auth.uid()
    )
  )
);

drop policy if exists "Owners and admins can update jet ski photos" on storage.objects;
create policy "Owners and admins can update jet ski photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'jetski-photos'
  and (
    is_admin()
    or exists (
      select 1
      from public.jetskis j
      where j.id::text = (storage.foldername(name))[1]
        and j.owner_id = auth.uid()
    )
  )
)
with check (bucket_id = 'jetski-photos');

drop policy if exists "Owners and admins can delete jet ski photos" on storage.objects;
create policy "Owners and admins can delete jet ski photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'jetski-photos'
  and (
    is_admin()
    or exists (
      select 1
      from public.jetskis j
      where j.id::text = (storage.foldername(name))[1]
        and j.owner_id = auth.uid()
    )
  )
);

-- Habilita as atualizações em tempo real consumidas pelo frontend.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jetskis'
  ) then
    alter publication supabase_realtime add table public.jetskis;
  end if;
end
$$;
