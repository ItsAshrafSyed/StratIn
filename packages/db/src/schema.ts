import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const strategyStatus = pgEnum("strategy_status", ["ACTIVE", "CLOSED"]);
export const investorEventType = pgEnum("investor_event_type", ["INVEST", "REBALANCE"]);
export const verificationStatus = pgEnum("verification_status", ["UNVERIFIED", "PENDING", "VERIFIED", "FAILED"]);

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorWallet: text("creator_wallet").notNull(),
    registryStrategyIdHex: text("registry_strategy_id_hex"),
    registryStrategyPda: text("registry_strategy_pda"),
    name: text("name").notNull(),
    description: text("description").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    status: strategyStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("strategies_creator_wallet_idx").on(table.creatorWallet)]
);

export const strategyVersions = pgTable(
  "strategy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    allocationHash: text("allocation_hash"),
    solanaTransactionSignature: text("solana_transaction_signature"),
    registryStrategyPda: text("registry_strategy_pda"),
    registryVersionPda: text("registry_version_pda"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationStatus: verificationStatus("verification_status").notNull().default("UNVERIFIED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("strategy_versions_strategy_id_idx").on(table.strategyId)]
);

export const strategyAllocations = pgTable(
  "strategy_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyVersionId: uuid("strategy_version_id")
      .notNull()
      .references(() => strategyVersions.id, { onDelete: "cascade" }),
    assetMint: text("asset_mint").notNull(),
    weightBps: integer("weight_bps").notNull()
  },
  (table) => [index("strategy_allocations_version_idx").on(table.strategyVersionId)]
);

export const strategyModelPositions = pgTable(
  "strategy_model_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    assetMint: text("asset_mint").notNull(),
    quantityAtomic: numeric("quantity_atomic", { precision: 78, scale: 0 }).notNull(),
    strategyVersion: integer("strategy_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("strategy_model_positions_strategy_id_idx").on(table.strategyId)]
);

export const strategyNavSnapshots = pgTable(
  "strategy_nav_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    intervalStart: timestamp("interval_start", { withTimezone: true }),
    navUsdcAtomic: bigint("nav_usdc_atomic", { mode: "bigint" }).notNull(),
    strategyVersion: integer("strategy_version").notNull(),
    cumulativeCostsUsdcAtomic: bigint("cumulative_costs_usdc_atomic", { mode: "bigint" }).notNull().default(0n)
  },
  (table) => [
    index("strategy_nav_snapshots_strategy_id_idx").on(table.strategyId),
    index("strategy_nav_snapshots_timestamp_idx").on(table.timestamp),
    index("strategy_nav_snapshots_interval_idx").on(table.intervalStart)
  ]
);

export const strategyInvestments = pgTable(
  "strategy_investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    investorWallet: text("investor_wallet").notNull(),
    strategyVersion: integer("strategy_version").notNull(),
    initialAmountUsdcAtomic: bigint("initial_amount_usdc_atomic", { mode: "bigint" }).notNull(),
    investedAt: timestamp("invested_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("strategy_investments_strategy_id_idx").on(table.strategyId),
    index("strategy_investments_investor_wallet_idx").on(table.investorWallet)
  ]
);

export const investmentPositions = pgTable(
  "investment_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => strategyInvestments.id, { onDelete: "cascade" }),
    assetMint: text("asset_mint").notNull(),
    quantityAtomic: numeric("quantity_atomic", { precision: 78, scale: 0 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("investment_positions_investment_id_idx").on(table.investmentId)]
);

export const investorStrategyEvents = pgTable(
  "investor_strategy_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => strategyInvestments.id, { onDelete: "cascade" }),
    eventType: investorEventType("event_type").notNull(),
    transactionSignatures: jsonb("transaction_signatures").$type<string[]>().notNull(),
    fromVersion: integer("from_version"),
    toVersion: integer("to_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("investor_strategy_events_investment_id_idx").on(table.investmentId)]
);

export const feeEvents = pgTable(
  "fee_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => strategyInvestments.id, { onDelete: "cascade" }),
    investorWallet: text("investor_wallet").notNull(),
    strategistWallet: text("strategist_wallet").notNull(),
    eventType: investorEventType("event_type").notNull(),
    actionAmountUsdcAtomic: bigint("action_amount_usdc_atomic", { mode: "bigint" }).notNull(),
    strategistFeeUsdcAtomic: bigint("strategist_fee_usdc_atomic", { mode: "bigint" }).notNull(),
    protocolFeeUsdcAtomic: bigint("protocol_fee_usdc_atomic", { mode: "bigint" }).notNull(),
    transactionSignatures: jsonb("transaction_signatures").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("fee_events_strategy_id_idx").on(table.strategyId),
    index("fee_events_investment_id_idx").on(table.investmentId),
    index("fee_events_strategist_wallet_idx").on(table.strategistWallet)
  ]
);

export const strategiesRelations = relations(strategies, ({ many }) => ({
  versions: many(strategyVersions),
  investments: many(strategyInvestments)
}));

export const strategyVersionsRelations = relations(strategyVersions, ({ one, many }) => ({
  strategy: one(strategies, {
    fields: [strategyVersions.strategyId],
    references: [strategies.id]
  }),
  allocations: many(strategyAllocations)
}));

export const strategyInvestmentsRelations = relations(strategyInvestments, ({ one, many }) => ({
  strategy: one(strategies, {
    fields: [strategyInvestments.strategyId],
    references: [strategies.id]
  }),
  events: many(investorStrategyEvents)
}));

export const investmentPositionsRelations = relations(investmentPositions, ({ one }) => ({
  investment: one(strategyInvestments, {
    fields: [investmentPositions.investmentId],
    references: [strategyInvestments.id]
  })
}));
