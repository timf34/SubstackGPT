--  RUN 1st
create extension vector;

-- RUN 2nd
create table pg (
  id bigserial primary key,
  essay_title text,
  essay_url text,
  essay_date text,
  essay_thanks text,
  content text,
  content_length bigint,
  content_tokens bigint,
  embedding vector (1536)
);

-- RUN 3rd after running the scripts
create or replace function pg_search (
  query_embedding vector(1536),
  similarity_threshold float,
  match_count int
)
returns table (
  id bigint,
  essay_title text,
  essay_url text,
  essay_date text,
  essay_thanks text,
  content text,
  content_length bigint,
  content_tokens bigint,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    pg.id,
    pg.essay_title,
    pg.essay_url,
    pg.essay_date,
    pg.essay_thanks,
    pg.content,
    pg.content_length,
    pg.content_tokens,
    1 - (pg.embedding <=> query_embedding) as similarity
  from pg
  where 1 - (pg.embedding <=> query_embedding) > similarity_threshold
  order by pg.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RUN 4th
create index on pg 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);


-- Update from us moving to substack gpt! 

create table substack_embeddings (
  id bigserial primary key,
  author text not null,
  essay_title text not null,
  essay_url text not null,
  essay_date text not null,
  content text not null,
  content_length bigint not null,
  content_tokens bigint not null,
  embedding vector(1536) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index on substack_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function match_substack_embeddings (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  author_name text
)
returns table (
  id bigint,
  author text,
  essay_title text,
  essay_url text,
  essay_date text,
  content text,
  content_length bigint,
  content_tokens bigint,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    substack_embeddings.id,
    substack_embeddings.author,
    substack_embeddings.essay_title,
    substack_embeddings.essay_url,
    substack_embeddings.essay_date,
    substack_embeddings.content,
    substack_embeddings.content_length,
    substack_embeddings.content_tokens,
    1 - (substack_embeddings.embedding <=> query_embedding) as similarity
  from substack_embeddings
  where 
    author = author_name
    and 1 - (substack_embeddings.embedding <=> query_embedding) > match_threshold
  order by substack_embeddings.embedding <=> query_embedding
  limit match_count;
end;
$$;

create index on substack_embeddings 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create index idx_substack_embeddings_author on substack_embeddings(author);


--

-- Enable vector extension if not already enabled
create extension if not exists vector;

-- Drop existing tables and functions if they exist
drop table if exists substack_embeddings;
drop function if exists match_substack_embeddings;

-- Create the substack_embeddings table
create table substack_embeddings (
  id bigserial primary key,
  author text not null,           -- Added author field
  essay_title text not null,
  essay_url text not null,
  essay_date text not null,
  content text not null,
  content_length bigint not null,
  content_tokens bigint not null,
  embedding vector(1536) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create the matching function for substack content
create or replace function match_substack_embeddings (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  author_name text
)
returns table (
  id bigint,
  author text,
  essay_title text,
  essay_url text,
  essay_date text,
  content text,
  content_length bigint,
  content_tokens bigint,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    substack_embeddings.id,
    substack_embeddings.author,
    substack_embeddings.essay_title,
    substack_embeddings.essay_url,
    substack_embeddings.essay_date,
    substack_embeddings.content,
    substack_embeddings.content_length,
    substack_embeddings.content_tokens,
    1 - (substack_embeddings.embedding <=> query_embedding) as similarity
  from substack_embeddings
  where 
    author = author_name
    and 1 - (substack_embeddings.embedding <=> query_embedding) > match_threshold
  order by substack_embeddings.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create an optimized index for vector searches
create index on substack_embeddings 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Create index on author for faster filtering
create index idx_substack_embeddings_author on substack_embeddings(author);

-- Create writers table
create table writers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  substack_url text not null unique,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_scraped_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on name for faster searches
create index writers_name_idx on writers(name);