ALTER TYPE "public"."investor_event_type" ADD VALUE IF NOT EXISTS 'REBALANCE';

CREATE TABLE IF NOT EXISTS "strategy_model_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "strategy_id" uuid NOT NULL,
  "asset_mint" text NOT NULL,
  "quantity_atomic" numeric(78, 0) NOT NULL,
  "strategy_version" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "strategy_nav_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "strategy_id" uuid NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "nav_usdc_atomic" bigint NOT NULL,
  "strategy_version" integer NOT NULL,
  "cumulative_costs_usdc_atomic" bigint DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "investment_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investment_id" uuid NOT NULL,
  "asset_mint" text NOT NULL,
  "quantity_atomic" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "investor_strategy_events" ADD COLUMN IF NOT EXISTS "from_version" integer;
ALTER TABLE "investor_strategy_events" ADD COLUMN IF NOT EXISTS "to_version" integer;

DO $$ BEGIN
  ALTER TABLE "strategy_model_positions" ADD CONSTRAINT "strategy_model_positions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "strategy_nav_snapshots" ADD CONSTRAINT "strategy_nav_snapshots_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "investment_positions" ADD CONSTRAINT "investment_positions_investment_id_strategy_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."strategy_investments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "strategy_model_positions_strategy_id_idx" ON "strategy_model_positions" USING btree ("strategy_id");
CREATE INDEX IF NOT EXISTS "strategy_nav_snapshots_strategy_id_idx" ON "strategy_nav_snapshots" USING btree ("strategy_id");
CREATE INDEX IF NOT EXISTS "strategy_nav_snapshots_timestamp_idx" ON "strategy_nav_snapshots" USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS "investment_positions_investment_id_idx" ON "investment_positions" USING btree ("investment_id");
