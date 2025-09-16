-- Extensions
create extension if not exists pg_trgm;
create extension if not exists unaccent;

begin;

-- Relation enum
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'relation_type' and n.nspname = 'public'
  ) then
    create type public.relation_type as enum (
      'also_see','causes','entails','hypernym','hyponym'
    );
  end if;
end
$$;

-- Helper to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Helper to update TSVectors
create or replace function public.update_tsvectors()
returns trigger
language plpgsql
as $$
begin
  new.gloss_tsv :=
    to_tsvector('english'::regconfig, coalesce(new.gloss,''));
  new.examples_tsv :=
    to_tsvector('english'::regconfig, array_to_string(new.examples,' '));
  return new;
end;
$$;

-- Main table
create table if not exists public.lexical_entries (
  id           text primary key,
  gloss        text not null,
  pos          char(1) not null check (pos in ('n','v','a','r','s')),
  lexfile      text not null,
  is_mwe       boolean not null default false,
  transitive   boolean,

  lemmas       text[] not null default '{}',
  particles    text[] not null default '{}',
  frames       text[] not null default '{}',
  examples     text[] not null default '{}',

  -- Actual columns for search
  gloss_tsv    tsvector,
  examples_tsv tsvector,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Triggers for timestamps and tsvectors
drop trigger if exists trg_lexical_entries_updated_at on public.lexical_entries;
create trigger trg_lexical_entries_updated_at
before update on public.lexical_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_lexical_entries_tsvectors on public.lexical_entries;
create trigger trg_lexical_entries_tsvectors
before insert or update on public.lexical_entries
for each row execute function public.update_tsvectors();

-- Relations between entries
create table if not exists public.entry_relations (
  source_id  text not null
             references public.lexical_entries(id)
             on delete cascade deferrable initially deferred,
  target_id  text not null
             references public.lexical_entries(id)
             on delete cascade deferrable initially deferred,
  type       public.relation_type not null,
  primary key (source_id, type, target_id),
  check (source_id <> target_id)
);

-- Indexes
create index if not exists idx_lex_pos               on public.lexical_entries (pos);
create index if not exists idx_lex_lemmas_gin        on public.lexical_entries using gin (lemmas);
create index if not exists idx_lex_particles_gin     on public.lexical_entries using gin (particles);
create index if not exists idx_lex_frames_gin        on public.lexical_entries using gin (frames);

-- Safe GIN indexes on stored tsvector columns
create index if not exists idx_lex_gloss_tsv    on public.lexical_entries using gin (gloss_tsv);
create index if not exists idx_lex_examples_tsv on public.lexical_entries using gin (examples_tsv);

-- Reverse lookups on relations
create index if not exists idx_rel_target_type       on public.entry_relations (target_id, type);

commit;
