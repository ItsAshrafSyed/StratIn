# StratIn

StratIn is a non-custodial marketplace for tokenized-equity strategies on Solana.

## Core flow

```text
Strategist publishes strategy
→ investor discovers
→ investor invests
→ underlying assets remain in investor wallet
→ strategy NAV/performance is tracked
→ strategist publishes rebalance
→ investor explicitly approves rebalance
```

StratIn never pools, holds, or controls investor assets. Swaps and fee transfers are signed by the investor, and purchased SPL assets remain directly in that investor's wallet. The database records marketplace data and strategy-attributed positions; it is not a custody ledger.

## Architecture

- Next.js, TypeScript, Tailwind
- Solana Kit and Wallet Standard
- Cloudflare Workers and Hono
- Neon PostgreSQL and Drizzle ORM
- Jupiter execution/pricing adapter
- Minimal Anchor strategy registry

Current functionality includes an issuer-agnostic asset registry, strategy creation and discovery, real weighted portfolio execution, canonical NAV and performance, immutable strategy versions, investor-approved rebalances, entry/rebalance fees, strategist earnings, on-chain allocation commitments, DB-to-chain verification, and an automated NAV cron.

## Repository

```text
apps/web                         Next.js wallet and marketplace UI
apps/api                         Hono Worker API and NAV cron
packages/shared                  asset registry, DTOs, hashing, fees
packages/strategy-engine         allocation, NAV, performance, rebalance math
packages/execution               Jupiter execution adapter
packages/db                      Drizzle schema and migrations
programs/strategy-registry       minimal Anchor allocation registry
docs                             architecture and validation records
```

## Local development

Install dependencies with `pnpm install --frozen-lockfile`, copy the checked-in environment examples, and configure required values locally. Never commit credentials or signer files.

Environment variable names:

- `DATABASE_URL`
- `SOLANA_RPC_URL` or `HELIUS_API_KEY`
- `HELIUS_RPC_BASE_URL`
- `REGISTRY_SOLANA_RPC_URL` and `REGISTRY_NETWORK`
- `NEXT_PUBLIC_SOLANA_RPC_PROXY_URL` and `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_REGISTRY_SOLANA_RPC_PROXY_URL`, `NEXT_PUBLIC_REGISTRY_SOLANA_RPC_URL`, and `NEXT_PUBLIC_REGISTRY_NETWORK`
- `NEXT_PUBLIC_WALLET_CHAIN`
- `JUPITER_SWAP_API_BASE_URL` and `NEXT_PUBLIC_JUPITER_SWAP_API_BASE_URL`
- `NEXT_PUBLIC_STRATIN_API_URL`
- `ENTRY_FEE_BPS`, `REBALANCE_FEE_BPS`, `PROTOCOL_FEE_SHARE_BPS`, and `PROTOCOL_TREASURY`
- `STRATIN_REGISTRY_SIGNER_PATH` only for the explicit devnet integration script

Start the API on port `8788` and web app on port `3001`:

```bash
pnpm --filter @stratin/api dev
pnpm --filter @stratin/web dev
```

Registry RPC and execution RPC are intentionally separate. Devnet registry testing can use `REGISTRY_SOLANA_RPC_URL` on devnet while execution remains on mainnet for Jupiter/tokenized-equity routes.

## Testing

```bash
pnpm --filter @stratin/strategy-engine test
pnpm --filter @stratin/api test
pnpm typecheck
pnpm --filter @stratin/web build
pnpm --filter @stratin/api build
pnpm --filter @stratin/db build
NO_DNA=1 anchor build
NO_DNA=1 anchor test --skip-build --skip-deploy --validator legacy
```

## Strategy registry

The Anchor registry commits immutable strategy/version allocation hashes. It does not custody assets, execute trades, calculate NAV, store marketplace data, or handle fees. Backend verification validates the configured Solana cluster, account ownership/type/shape, strategist identity, strategy/version identity, and allocation hashes before a commitment is marked verified.

The registry was previously validated on Solana devnet. Mainnet registry deployment has not been broadcast.

## MVP security boundary

Wallet addresses, transaction signatures, attributed positions, and part of the rebalance accounting still originate from callers. Before production, StratIn needs wallet-signed API challenges, server-side transaction/signature verification, and additional server-derived accounting. PostgreSQL transactions protect related database writes, but they cannot make a Solana transaction and database commit globally atomic. If Solana succeeds and the database fails, recovery/backfill is still required.

See [Recovery and mainnet readiness](docs/recovery-mainnet-readiness.md) for the environment matrix, known limitations, and deployment checklist.
