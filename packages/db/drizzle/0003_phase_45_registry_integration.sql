ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS registry_strategy_id_hex text,
  ADD COLUMN IF NOT EXISTS registry_strategy_pda text;

CREATE INDEX IF NOT EXISTS strategies_registry_strategy_pda_idx
  ON strategies (registry_strategy_pda);
