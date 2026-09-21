DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE strategy_versions
  ADD COLUMN IF NOT EXISTS allocation_hash text,
  ADD COLUMN IF NOT EXISTS solana_transaction_signature text,
  ADD COLUMN IF NOT EXISTS registry_strategy_pda text,
  ADD COLUMN IF NOT EXISTS registry_version_pda text,
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verification_status verification_status NOT NULL DEFAULT 'UNVERIFIED';

ALTER TABLE strategy_nav_snapshots
  ADD COLUMN IF NOT EXISTS interval_start timestamp with time zone;

CREATE INDEX IF NOT EXISTS strategy_nav_snapshots_interval_idx
  ON strategy_nav_snapshots (interval_start);

CREATE UNIQUE INDEX IF NOT EXISTS strategy_nav_snapshots_strategy_interval_unique_idx
  ON strategy_nav_snapshots (strategy_id, interval_start)
  WHERE interval_start IS NOT NULL;

CREATE TABLE IF NOT EXISTS fee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES strategies(id) ON DELETE cascade,
  investment_id uuid NOT NULL REFERENCES strategy_investments(id) ON DELETE cascade,
  investor_wallet text NOT NULL,
  strategist_wallet text NOT NULL,
  event_type investor_event_type NOT NULL,
  action_amount_usdc_atomic bigint NOT NULL,
  strategist_fee_usdc_atomic bigint NOT NULL,
  protocol_fee_usdc_atomic bigint NOT NULL,
  transaction_signatures jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_events_strategy_id_idx
  ON fee_events (strategy_id);

CREATE INDEX IF NOT EXISTS fee_events_investment_id_idx
  ON fee_events (investment_id);

CREATE INDEX IF NOT EXISTS fee_events_strategist_wallet_idx
  ON fee_events (strategist_wallet);
