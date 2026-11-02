create type public.app_role as enum ('admin', 'staff');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Team can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users see own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'staff');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  servings text not null default '',
  ingredients text not null default '',
  instructions text not null default '',
  notes text not null default '',
  allergens text[] not null default '{}',
  photo_path text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.recipes to authenticated;
grant all on public.recipes to service_role;
alter table public.recipes enable row level security;
create policy "Team reads recipes" on public.recipes for select to authenticated using (true);
create policy "Admins insert recipes" on public.recipes for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update recipes" on public.recipes for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete recipes" on public.recipes for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.guest_allergies (
  id uuid primary key default gen_random_uuid(),
  guest text not null,
  service_date date not null default current_date,
  allergens text[] not null default '{}',
  details text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.guest_allergies to authenticated;
grant all on public.guest_allergies to service_role;
alter table public.guest_allergies enable row level security;
create policy "Team reads guest allergies" on public.guest_allergies for select to authenticated using (true);
create policy "Admins write guest allergies" on public.guest_allergies for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'shift',
  title text not null,
  item_date date not null,
  start_time time,
  end_time time,
  details text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.schedule_items to authenticated;
grant all on public.schedule_items to service_role;
alter table public.schedule_items enable row level security;
create policy "Team reads schedule" on public.schedule_items for select to authenticated using (true);
create policy "Admins write schedule" on public.schedule_items for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null,
  body text not null,
  important boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.notes enable row level security;
create policy "Team reads notes" on public.notes for select to authenticated using (true);
create policy "Admins write notes" on public.notes for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Team views recipe photos" on storage.objects for select to authenticated using (bucket_id = 'recipe-photos');
create policy "Admins upload recipe photos" on storage.objects for insert to authenticated with check (bucket_id = 'recipe-photos' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete recipe photos" on storage.objects for delete to authenticated using (bucket_id = 'recipe-photos' and public.has_role(auth.uid(), 'admin'));