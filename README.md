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

Install dependencies with `pnpm install --frozen-lockfile`, copy the environment example belonging to the component you are running, and configure required values locally. Never commit credentials or signer files.

```text
.env.example                 repository devnet integration script
apps/api/.dev.vars.example  local Cloudflare Worker
apps/web/.env.example       local Next.js application
packages/db/.env.example    Drizzle migration commands
```

Copy examples to `.env`, `.dev.vars`, or `.env.local` as indicated by their comments. Those real environment files are ignored by Git.

Start the API on port `8788` and web app on port `3001`:

```bash
pnpm --filter @stratin/api dev
pnpm --filter @stratin/web dev
```

Registry RPC and execution RPC remain intentionally separate even though production currently points both at mainnet. Explicit devnet registry tests must override only the registry RPC/network and must not move Jupiter or tokenized-equity execution off mainnet.

For a Worker deployment, configure `DATABASE_URL`, `REGISTRY_SOLANA_RPC_URL`, and `ALLOWED_ORIGINS` as Worker secrets before deploying. `ALLOWED_ORIGINS` is a comma-separated exact allowlist containing the production Vercel origin and only the preview origins that should be able to call the API. The automated NAV refresh runs hourly.

```bash
pnpm --filter @stratin/api exec wrangler secret put DATABASE_URL
pnpm --filter @stratin/api exec wrangler secret put REGISTRY_SOLANA_RPC_URL
pnpm --filter @stratin/api exec wrangler secret put ALLOWED_ORIGINS
pnpm --filter @stratin/api run deploy:dry-run
pnpm --filter @stratin/api run deploy
```

Enter secret values only at Wrangler's interactive prompts. Do not place them in the command line or commit them.

For Vercel, the web application requires only `SOLANA_RPC_URL`, `REGISTRY_SOLANA_RPC_URL`, and `NEXT_PUBLIC_STRATIN_API_URL`. The checked-in web environment example documents optional browser overrides, but the application already provides the correct defaults for those values.

## Testing

```bash
pnpm --filter @stratin/strategy-engine test
pnpm --filter @stratin/api test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @stratin/web build
pnpm --filter @stratin/api build
pnpm --filter @stratin/db build
NO_DNA=1 anchor build
NO_DNA=1 anchor test --skip-build --skip-deploy --validator legacy
```

## Strategy registry

The Anchor registry commits immutable strategy/version allocation hashes. It does not custody assets, execute trades, calculate NAV, store marketplace data, or handle fees. Backend verification validates the configured Solana cluster, account ownership/type/shape, strategist identity, strategy/version identity, and allocation hashes before a commitment is marked verified.

The registry was validated on devnet and deployed to mainnet at program ID `3twgH9P4Knu51EqMZb5Fx2CSX1vUkw5Da4GYSUjiNzNs`. The mainnet deployment transaction is `2SVxMJfB1jeiksEXpC3upUVtjwNxxJgXc7N2n4Zk4JMLNqSmqzwmiyt6cc7RDA5wsG7WQ26btaCDEmkREbkfJUs4`.

## MVP security boundary

Wallet addresses, transaction signatures, attributed positions, and part of the rebalance accounting still originate from callers. Before production, StratIn needs wallet-signed API challenges, server-side transaction/signature verification, and additional server-derived accounting. PostgreSQL transactions protect related database writes, but they cannot make a Solana transaction and database commit globally atomic. If Solana succeeds and the database fails, recovery/backfill is still required.

See [Recovery and mainnet readiness](docs/recovery-mainnet-readiness.md) for the environment matrix, known limitations, and deployment checklist.
