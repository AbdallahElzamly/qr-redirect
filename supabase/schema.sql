-- ============================================================
-- QR Redirect System — Fixed Schema (Drops old table first)
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Drop old table if it exists (from previous project)
DROP TABLE IF EXISTS public.cards CASCADE;

-- Create fresh table with correct columns
CREATE TABLE public.cards (
    id              INT PRIMARY KEY,
    label           TEXT DEFAULT '',
    primary_url     TEXT NOT NULL DEFAULT '',
    secondary_url   TEXT DEFAULT '',
    scan_count      BIGINT DEFAULT 0,
    primary_scans   BIGINT DEFAULT 0,
    secondary_scans BIGINT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate cards 1 to 99
INSERT INTO public.cards (id, label, primary_url, secondary_url)
SELECT 
    n,
    '',
    '',
    ''
FROM generate_series(1, 99) AS n;

-- Index for fast lookup
CREATE INDEX idx_cards_id ON public.cards(id);

-- Disable RLS (server uses service role key)
ALTER TABLE public.cards DISABLE ROW LEVEL SECURITY;

-- Verify
SELECT COUNT(*) AS total_cards FROM public.cards;
