# Phase 2 Marketplace Vertical Slice

Date: 2026-09-15

Status: implemented; DB-backed two-wallet investment run confirmed.

## Implemented

- PostgreSQL/Drizzle schema and initial SQL migration.
- Worker API routes for strategies and investments.
- Shared Zod/API DTOs and strategy allocation validation.
- Create Strategy UI.
- Explore marketplace UI.
- Strategy detail page with allocation review and real investment execution.
- My Investments dashboard.
- My Strategies dashboard with investor count and capital following.
- Minimal strategy manage page.

## Not Implemented

- NAV/performance calculations.
- Rebalancing.
- Fees.
- Anchor registry.
- Notifications.
- Charts, rankings, advanced analytics.

## Required Local Configuration

Paste a Neon/Postgres URL into:

`apps/api/.dev.vars`

```env
DATABASE_URL=
```

The checked-in template is:

`apps/api/.dev.vars.example`

Do not commit credentials.

## Migration

Initial migration:

`packages/db/drizzle/0000_initial_marketplace.sql`

Run it against the configured database before starting the Worker API.

## Local Run

API:

```bash
pnpm --filter @stratin/api dev
```

Web:

```bash
pnpm --filter @stratin/web dev
```

Web expects:

```env
NEXT_PUBLIC_STRATIN_API_URL=http://localhost:8788
```

## Tests

Passed:

```bash
pnpm --filter @stratin/api test
pnpm --filter @stratin/strategy-engine test
pnpm typecheck
pnpm --filter @stratin/web build
pnpm --filter @stratin/api build
pnpm --filter @stratin/db build
```

## Manual Two-Wallet Result

Confirmed on 2026-09-15.

Wallet A created and published a DB-backed strategy. Wallet B opened the strategy detail page, reviewed the allocation, signed every required swap leg, and the app recorded the investment only after all required swap legs confirmed.

Confirmed transaction signatures:

| Leg    | Status    | Signature                                                                                  |
| ------ | --------- | ------------------------------------------------------------------------------------------ |
| GOOGLx | Confirmed | `5Eq94MqRSMkrfJHYhfyvpqKTown743b4bMNoiVqXroB4ce5qRsj5reBq3rYwFq4T7DsegTzgqL1nEKfEaKHYgf3u` |
| TSLAx  | Confirmed | `3CajMDhcR8peKy7JkwwSCtP6AG5wxFN5GXE9aY193LHzHge6RYGGybdNJ3Q5hxsm2WTQky94qxfwF9uVNevDRBYy` |
| AAPLx  | Confirmed | `35HStnpoN1dBTWxYBvfFKKVWSoRDW1sSwJyy2ydLNJMfzgTRoYi4duEvVdDdRT6xP9givmifNHE22yTnvcZRhDwQ` |
| METAx  | Confirmed | `5aBS9rDgJ4p1hja5amSJVemqreFE43HLYL5Ra6XKTXaa75tPebVoZHCZktCzwzM1FySF6jwKFNZNx4EiaJwFTkoX` |

Follow-up dashboard checks:

1. Wallet B should see the strategy on `/my-investments`.
2. Wallet A should see investor count and capital following increase on `/my-strategies`.

## Current Constraint

No Cloudflare deploy has been performed. Deployment must be explicitly approved before any push to Cloudflare.
