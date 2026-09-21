# Phase 3 NAV and Rebalance Notes

Status: implemented locally; real two-wallet V1 to V2 execution still needs to be run after applying migration `0001_phase_3_nav_rebalance`.

## Schema

- `strategy_model_positions`: canonical strategy quantities by mint/version.
- `strategy_nav_snapshots`: strategy NAV snapshots in USDC atomic units.
- `investment_positions`: StratIn-attributed per-investment quantities by mint.
- `investor_strategy_events`: now supports `REBALANCE` plus `from_version` and `to_version`.

## NAV Architecture

Strategy NAV is canonical/model based and independent of investor deposits. A strategy initializes with NAV `100.000000` USDC. Model quantities are persisted and are not continuously reset to target weights. When a strategist publishes a rebalance, the model is reallocated to the new target weights using current quote-derived quantities and a new NAV snapshot is written without resetting NAV to 100.

## Price Source

Server-side NAV pricing uses the Worker-side `JupiterPriceProvider`, configured by `JUPITER_SWAP_API_BASE_URL` with a default of `https://lite-api.jup.ag/swap/v1`.

USDC is valued at stablecoin parity. Tokenized-equity values are derived from Jupiter executable quote routes:

- asset -> USDC for current model/investor attributed value
- USDC -> asset for initializing/rebalancing model quantities

This keeps the NAV engine issuer-agnostic. Jupiter is a price/execution adapter, not a strategy-engine dependency.

## Current Security Limitation

Creator rebalance authorization is wallet-address based in the request body, matching the current MVP wallet-auth model. This prevents accidental UI misuse but is not cryptographic authentication. The future Anchor registry or wallet-signed API challenge should harden authorship before production use.

## Manual Test To Run

1. Apply migrations.
2. Start API on `8788` and web on `3001`.
3. Wallet A creates a strategy.
4. Refresh strategy NAV on the strategy page.
5. Wallet B invests and records attributed positions.
6. Wallet A opens My Strategies -> Manage and publishes Version 2.
7. Wallet B opens My Investments -> Review Rebalance.
8. Review trades, execute all legs, confirm signatures.
9. Verify Wallet B investment now shows current version and up to date.
