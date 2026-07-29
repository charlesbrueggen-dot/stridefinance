-- =============================================
-- Stride Finance - Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- =============================================

-- INCOME
create table if not exists income (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null,
  amount numeric(12,2) not null,
  date date not null,
  notes text,
  created_at timestamptz default now()
);
alter table income enable row level security;
create policy "Users can manage own income" on income for all using (auth.uid() = user_id);

-- EXPENSES
create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  amount numeric(12,2) not null,
  category text not null default 'Needs',
  subcategory text default 'Other',
  date date not null,
  notes text,
  recurring boolean default false,
  created_at timestamptz default now()
);
alter table expenses enable row level security;
create policy "Users can manage own expenses" on expenses for all using (auth.uid() = user_id);

-- ASSETS (for Net Worth)
create table if not exists assets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  value numeric(12,2) not null,
  category text default 'Other',
  purchase_date date,
  notes text,
  created_at timestamptz default now()
);
alter table assets enable row level security;
create policy "Users can manage own assets" on assets for all using (auth.uid() = user_id);

-- ACCOUNTS
create table if not exists accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null default 'Checking',
  balance numeric(12,2) default 0,
  institution text,
  notes text,
  created_at timestamptz default now()
);
alter table accounts enable row level security;
create policy "Users can manage own accounts" on accounts for all using (auth.uid() = user_id);

-- INVESTMENTS
create table if not exists investments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  name text,
  type text default 'Stock',
  shares numeric(12,4) not null,
  avg_cost numeric(12,4) not null,
  current_price numeric(12,4),
  portfolio_pct numeric(6,2),
  sector text default 'Other',
  created_at timestamptz default now()
);
alter table investments enable row level security;
create policy "Users can manage own investments" on investments for all using (auth.uid() = user_id);

-- GOALS
create table if not exists goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  target_amount numeric(12,2) not null,
  current_amount numeric(12,2) default 0,
  target_date date,
  category text default 'Other',
  priority text default 'medium',
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "Users can manage own goals" on goals for all using (auth.uid() = user_id);

-- LOANS
create table if not exists loans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  person_name text not null,
  type text not null default 'lent',
  amount numeric(12,2) not null,
  interest_rate numeric(6,2) default 0,
  loan_date date not null,
  notes text,
  settled boolean default false,
  created_at timestamptz default now()
);
alter table loans enable row level security;
create policy "Users can manage own loans" on loans for all using (auth.uid() = user_id);

-- ACCOUNT_TRANSACTIONS (Plaid-synced + manually entered + CSV-imported transactions)
-- This table existed in production but was never scripted here — it was already being
-- ALTERed by the Teller/CSV-dedupe migrations below without ever having been CREATEd in
-- this file. This is its pre-Teller-migration base shape; reverse-engineered from the
-- live schema on 2026-07-17 (via information_schema + pg_policies) so this file is a
-- complete, accurate reference again. plaid_transaction_id, status, and the 'plaid'
-- source_type value are added by the Plaid migration block below (which superseded the
-- original Teller migration block's teller_txn_id/running_balance columns on 2026-07-19).
create table if not exists account_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references accounts(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null,
  date date not null default current_date,
  kind text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  category text,
  subcategory text,
  source text,
  merchant text,
  card_last4 text,
  card_type text,
  auto_categorized boolean default false,
  label text,
  notes text,
  source_type text default 'manual',
  external_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table account_transactions enable row level security;
create policy "Users manage own transactions" on account_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Generic "bump updated_at on write" trigger function, reused by any table with an
-- updated_at column (currently just account_transactions).
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_acct_txn_updated_at before update on account_transactions
  for each row execute function set_updated_at();

-- =============================================
-- PLAID BANK SYNC (migration: replace_teller_with_plaid, applied 2026-07-19)
-- Replaces the Teller integration, which never left mock mode in production
-- (account approval never came through) — this was a pure rename/reshape,
-- not a data migration; see api/plaid/_sync-core.js for the sync logic.
-- Already applied to the live database; kept here so the schema file stays a
-- complete reference.
-- =============================================

-- One row per Plaid Item (one bank login, can cover multiple accounts).
-- access_token is used by the backend (service role) to call the Plaid API
-- on the user's behalf. cursor is /transactions/sync's pagination cursor,
-- persisted between syncs.
create table if not exists plaid_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  item_id text not null,                    -- Plaid item id
  access_token text not null,               -- Plaid access token
  institution_id text,
  institution_name text,
  status text default 'connected' check (status in ('connected', 'disconnected')),
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  cursor text,
  unique (user_id, item_id)
);
alter table plaid_items enable row level security;
create policy "Users can view own plaid items"
  on plaid_items for select using (auth.uid() = user_id);

-- Plaid link columns on accounts
alter table accounts add column if not exists plaid_account_id text;
alter table accounts add column if not exists plaid_item_id uuid references plaid_items(id) on delete set null;
alter table accounts add constraint accounts_user_plaid_account_unique unique (user_id, plaid_account_id);

-- Plaid columns on account_transactions. Unlike Teller (which required
-- deriving balance from each transaction's running_balance to avoid a paid
-- Balance endpoint), Plaid's /accounts/get returns each account's cached
-- balance for free — so there's no running_balance column here at all.
alter table account_transactions add column if not exists plaid_transaction_id text unique;
alter table account_transactions add column if not exists status text default 'posted' check (status in ('posted', 'pending'));
alter table account_transactions drop constraint if exists account_transactions_source_type_check;
alter table account_transactions add constraint account_transactions_source_type_check
  check (source_type = any (array['manual'::text, 'csv_import'::text, 'plaid'::text]));

-- =============================================
-- CSV IMPORT DEDUPE (migrations: account_transactions_csv_import_dedupe_index,
-- account_transactions_csv_import_dedupe_constraint_fix; applied 2026-07-16).
-- Already applied to the live database; kept here so the schema file stays a
-- complete reference.
-- =============================================

-- external_id is set by the CSV importer (account + date + kind + amount +
-- normalized description). This unique constraint makes re-uploading the same
-- statement idempotent via upsert(..., { onConflict: 'user_id,external_id' }).
-- Must be a full (non-partial) constraint — PostgREST's upsert ON CONFLICT
-- inference can't target a partial index. Postgres already treats NULLs as
-- distinct in unique constraints, so rows from teller/manual sources (which
-- never set external_id) can still repeat freely without a partial predicate.
alter table account_transactions add constraint account_transactions_user_external_id_key unique (user_id, external_id);

-- =============================================
-- TABLES ADDED DIRECTLY TO THE LIVE DATABASE (never scripted here first)
-- The five tables below existed in production but were missing from this file.
-- Definitions were reverse-engineered from the live schema on 2026-07-17 (via
-- information_schema + pg_policies) so this file is a complete, accurate
-- reference again.
-- =============================================

-- BALANCE (manual balance snapshots shown on the Balance page)
create table if not exists balance (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  label text,
  amount numeric not null default 0,
  type text,
  date date,
  notes text,
  created_at timestamptz default now()
);
alter table balance enable row level security;
create policy "Users can view their own balance"   on balance for select using (auth.uid() = user_id);
create policy "Users can insert their own balance" on balance for insert with check (auth.uid() = user_id);
create policy "Users can update their own balance" on balance for update using (auth.uid() = user_id);
create policy "Users can delete their own balance" on balance for delete using (auth.uid() = user_id);

-- BALANCE_ACCOUNTS / BALANCE_GAINS (supporting breakdown tables for the Balance page)
create table if not exists balance_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  type text,
  balance numeric default 0,
  notes text,
  created_at timestamptz default now()
);
alter table balance_accounts enable row level security;
create policy "Users can manage their accounts" on balance_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists balance_gains (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  description text,
  amount numeric default 0,
  type text,
  date date,
  notes text,
  created_at timestamptz default now()
);
alter table balance_gains enable row level security;
create policy "Users can manage their gains" on balance_gains for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- SUBSCRIPTIONS (Stripe Pro subscription state)
-- Written only by the server-side Stripe webhook (api/webhook.js), which authenticates
-- with the service role key and therefore bypasses RLS entirely — it does not need, and
-- must not be given, an explicit write policy here. End users can only read their own row.
--
-- SECURITY NOTE (2026-07-17): production briefly had an additional policy here,
-- "Service role can manage subscriptions", scoped to `public` with `USING (true)` for
-- ALL commands — despite its name it applied to every signed-in user, not just the
-- service role, letting anyone grant themselves Pro status for free via the client SDK.
-- It was dropped directly against the live database. Do not re-add a write policy for
-- `public`/`authenticated` on this table.
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'free',
  price_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "Users can view own subscription" on subscriptions for select using (auth.uid() = user_id);

-- TRACKED_SUBSCRIPTIONS (detected/manually-added recurring charges, Subscriptions page)
create table if not exists tracked_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  merchant_key text not null,
  name text not null,
  amount numeric not null,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  last_charge_date date,
  cancel_url text,
  cancelled_at timestamptz,
  category text not null default 'Other',
  next_billing_date date,
  previous_amount numeric,
  price_changed_at timestamptz,
  source text not null default 'detected' check (source in ('detected', 'manual')),
  created_at timestamptz not null default now()
);
alter table tracked_subscriptions enable row level security;
create policy "Users manage own tracked subscriptions" on tracked_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================
-- BUDGETS (per category+subcategory monthly $ limit, Goals & Budgets page)
-- Existed live but was missing from this file (same situation as
-- account_transactions above) — reverse-engineered via list_tables on
-- 2026-07-28, at which point the `rollover` column below was also added.
-- =============================================
create table if not exists budgets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null,
  subcategory text not null,
  monthly_limit numeric not null,
  created_at timestamptz default now()
);
alter table budgets enable row level security;
create policy "Users manage own budgets" on budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Envelope-budgeting rollover (migration: add_budgets_rollover_column, applied 2026-07-28).
-- When true, Budgets.jsx carries a category's unspent (or overspent) amount into the next
-- month's effective limit, computed on the fly from spend history — no separate ledger table.
alter table budgets add column if not exists rollover boolean not null default false;

-- =============================================
-- TRANSACTION_RULES (migration: create_transaction_rules_table, applied 2026-07-28)
-- User-defined auto-categorization rules, checked before the built-in keyword rules in
-- useTransactions.js's autoCategorize(). Managed from the "Rules" tab on Accounts.jsx.
-- =============================================
create table if not exists transaction_rules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  match_field text not null default 'description' check (match_field in ('description', 'merchant')),
  match_value text not null,
  set_kind text check (set_kind in ('expense', 'income', 'transfer')),
  set_category text,
  set_subcategory text,
  set_label text,
  priority int not null default 0,
  created_at timestamptz not null default now()
);
alter table transaction_rules enable row level security;
create policy "Users manage own transaction rules" on transaction_rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
