# StratIn Phase 4 Notes

## Fees

Fees are configured from environment values:

- `ENTRY_FEE_BPS`
- `REBALANCE_FEE_BPS`
- `PROTOCOL_FEE_SHARE_BPS`
- `PROTOCOL_TREASURY`

Default local values are:

- entry fee: `25` bps
- rebalance fee: `10` bps
- protocol fee share: `2000` bps of the total fee
- protocol treasury: `stiFExnwsWbHxrB5CqCSBWMbLjgB8hVLURtUsyAr3RT`

Fee calculation uses BigInt atomic USDC amounts. The investor-entered amount remains the strategy allocation amount; fees are shown and charged additionally.

Rebalance fees are calculated against actual rebalance/traded notional, not the investor's entire portfolio value. The current deterministic MVP basis is:

```text
rebalance_fee_basis = max(total_sell_notional, total_buy_notional)
```

This avoids double-counting both sides of a rebalance while still charging only for the portion of the portfolio that actually trades.

Settlement is direct USDC transfer from investor wallet to:

- strategist wallet
- protocol treasury

There is no StratIn custody wallet.

Because basket execution is not atomic, the MVP flow is conservative:

1. Execute and confirm required swap legs.
2. Execute and confirm fee transfer.
3. Record investment/rebalance plus fee event.

If the fee transfer fails, the app does not record a normal completed fee-bearing investment or rebalance.

## Allocation Hash Format

Canonical allocation hashing:

1. Validate supported assets, no duplicates, total weight exactly `10000`.
2. Sort allocations by mint string ascending.
3. Serialize as UTF-8 lines:

```text
<mint>:<weight_bps>
<mint>:<weight_bps>
```

4. SHA-256 the serialized bytes.
5. Store/display lowercase hex.

Known vector:

```text
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:2500
Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu:2000
XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp:2500
Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh:3000
```

Hash:

```text
06aa8989e781f6b3030a6cfd201f6df017a33f841844109dab558db70caa7362
```

## Strategy Registry Program

Program path:

```text
programs/strategy-registry
```

Program ID:

```text
3twgH9P4Knu51EqMZb5Fx2CSX1vUkw5Da4GYSUjiNzNs
```

Instructions:

- `create_strategy`
- `publish_rebalance`
- `close_strategy`

The program stores only:

- creator
- strategy id
- current version
- current allocation hash
- status
- created/updated timestamps

Each version is stored in a separate version PDA so historical versions remain verifiable.

The program does not custody assets, execute trades, calculate NAV, or manage investor positions.

## Registry Integration

The real web create/rebalance flows now build and request wallet signatures for strategy-registry transactions before persisting verified DB metadata.

Create strategy flow:

1. Validate allocation.
2. Canonicalize and SHA-256 hash the allocation.
3. Build `create_strategy`.
4. Strategist wallet signs and sends.
5. Confirm transaction.
6. Persist Version 1 with allocation hash, registry transaction signature, strategy PDA, version PDA, and verification timestamp.

Publish rebalance flow:

1. Validate the new allocation.
2. Canonicalize and hash it.
3. Build `publish_rebalance` for the next version.
4. Strategist wallet signs and sends.
5. Confirm transaction.
6. Persist the new immutable DB version with registry metadata.

The API independently recomputes the DB allocation hash and can compare it to the on-chain version PDA hash via:

```text
GET /strategies/:id/registry/verify
```

If an on-chain registry transaction succeeds but DB persistence fails afterward, the on-chain commitment remains real but the marketplace record will need a recovery/backfill flow. That recovery tooling is not implemented yet.

## NAV Cron

Worker cron is configured for the start of every hour:

```json
"triggers": {
  "crons": ["0 * * * *"]
}
```

The cron:

- lists ACTIVE strategies
- reuses the existing NAV refresh path
- isolates per-strategy failures
- skips duplicate hourly buckets via `interval_start`
- leaves manual NAV refresh available

## Mainnet Preflight Status

Deployer signer:

```text
stiNBhrncyQLCXGGZWUYoxizjAH8b6JA8KCZpNrPtGm
```

Verified with:

```text
solana address
```

Current deployer balance from public mainnet RPC:

```text
0 SOL
```

The local CLI RPC URL is currently set to the public Solana mainnet endpoint for deployment preflight because the previously stored Helius URL was syntactically cleaned but did not respond successfully. The configured RPC now responds and confirms the mainnet genesis hash:

```text
5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
```

SBF build status:

- `anchor --version`: `anchor-cli 1.2.0`
- `rustup --version`: `rustup 1.29.1`
- `cargo check --manifest-path programs/strategy-registry/Cargo.toml` passes.
- `NO_DNA=1 anchor build` passes.
- `NO_DNA=1 anchor test --skip-build --validator legacy --provider.wallet <configured deployer keypair>` passes: 5/5 tests.
- Anchor emits Rust `unexpected cfg` warnings from macro expansion, but no build/test errors.

Compiled artifact:

```text
target/deploy/strategy_registry.so
160,376 bytes
```

Current rent-exempt estimate for the artifact size:

```text
0.81536032 SOL
```

This is the program-data rent estimate for the compiled bytes. Keep extra SOL available for program/buffer accounts and transaction fees.

Preflight sizing recommendation:

- program-data rent: `0.81536032 SOL`
- transaction fee allowance: approximately `0.01 SOL`
- recommended safety buffer: approximately `1.2 SOL`
- recommended deployer balance before deployment: at least `2.0 SOL`

Safe local verification commands:

```bash
NO_DNA=1 anchor build
NO_DNA=1 anchor test --skip-build --validator legacy --provider.wallet <configured deployer keypair>
stat -f%z target/deploy/strategy_registry.so
solana rent "$(stat -f%z target/deploy/strategy_registry.so)" --url mainnet-beta
```

Do not run mainnet deploy without explicit approval.

MAINNET DEPLOYMENT NOT BROADCAST.
