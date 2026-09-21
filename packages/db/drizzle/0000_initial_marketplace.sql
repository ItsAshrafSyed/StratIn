CREATE TYPE "public"."investor_event_type" AS ENUM('INVEST');--> statement-breakpoint
CREATE TYPE "public"."strategy_status" AS ENUM('ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TABLE "investor_strategy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" uuid NOT NULL,
	"event_type" "investor_event_type" NOT NULL,
	"transaction_signatures" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_wallet" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" "strategy_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"asset_mint" text NOT NULL,
	"weight_bps" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"investor_wallet" text NOT NULL,
	"strategy_version" integer NOT NULL,
	"initial_amount_usdc_atomic" bigint NOT NULL,
	"invested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_strategy_events" ADD CONSTRAINT "investor_strategy_events_investment_id_strategy_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."strategy_investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_allocations" ADD CONSTRAINT "strategy_allocations_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_investments" ADD CONSTRAINT "strategy_investments_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investor_strategy_events_investment_id_idx" ON "investor_strategy_events" USING btree ("investment_id");--> statement-breakpoint
CREATE INDEX "strategies_creator_wallet_idx" ON "strategies" USING btree ("creator_wallet");--> statement-breakpoint
CREATE INDEX "strategy_allocations_version_idx" ON "strategy_allocations" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE INDEX "strategy_investments_strategy_id_idx" ON "strategy_investments" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "strategy_investments_investor_wallet_idx" ON "strategy_investments" USING btree ("investor_wallet");--> statement-breakpoint
CREATE INDEX "strategy_versions_strategy_id_idx" ON "strategy_versions" USING btree ("strategy_id");