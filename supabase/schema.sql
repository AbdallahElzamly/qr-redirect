-- ============================================================
-- QR Redirect System — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cards (
    id          INT PRIMARY KEY,           -- Card number: 1 to 99
    label       TEXT DEFAULT '',           -- Optional: restaurant/client name
    primary_url TEXT NOT NULL DEFAULT '',  -- First redirect (e.g. Google Reviews)
    secondary_url TEXT DEFAULT '',         -- Second redirect (e.g. Facebook) when already reviewed
    scan_count  BIGINT DEFAULT 0,          -- Total scans
    primary_scans BIGINT DEFAULT 0,        -- Scans that went to primary URL
    secondary_scans BIGINT DEFAULT 0,      -- Scans that went to secondary URL
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate cards 1 to 99
INSERT INTO public.cards (id, primary_url, secondary_url)
SELECT 
    generate_series(1, 99),
    '',
    ''
ON CONFLICT (id) DO NOTHING;

-- Fast lookup index
CREATE INDEX IF NOT EXISTS idx_cards_id ON public.cards(id);

-- Disable RLS (public read for redirects, server writes via service role)
ALTER TABLE public.cards DISABLE ROW LEVEL SECURITY;
