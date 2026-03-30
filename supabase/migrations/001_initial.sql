create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  google_account_id text not null,
  industry text,
  created_at timestamptz default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  type text not null check (type in ('search','pmax','demand_gen','display','shopping','video')),
  status text not null default 'draft' check (status in ('draft','review','approved','published','failed')),
  settings jsonb not null default '{}',
  google_campaign_id text,
  created_at timestamptz default now(),
  published_at timestamptz
);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  url text,
  scraped_content text,
  product text,
  audience text,
  usps text[] default '{}',
  tone text,
  goal text,
  brand_name text,
  keywords jsonb not null default '[]',
  created_at timestamptz default now()
);

create table campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  asset_type text not null,
  content text,
  metadata jsonb default '{}',
  ad_strength_score text,
  is_approved boolean default false,
  google_resource_id text,
  created_at timestamptz default now()
);
