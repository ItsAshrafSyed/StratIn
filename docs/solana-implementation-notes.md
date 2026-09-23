# Solana Implementation Notes

## Current decisions

- Use `@solana/kit` for new Solana code and Wallet Standard for discovery/signing.
- Do not introduce wallet-specific adapters for application flows.
- Keep the strategy engine issuer-agnostic; token-program and execution details belong in adapters.
- Tokenized-equity Jupiter routes request `instructionVersion=V2` for Token-2022 support.

## Transaction policy

StratIn currently uses Solana transaction version `0` for wallet-signed application transactions:

- Jupiter swaps are requested with `asLegacyTransaction=false` through the previously validated versioned-transaction flow.
- Registry commitment transactions are built as version `0`.
- Direct USDC fee-transfer transactions are built as version `0`.
- Every wallet flow verifies that the connected wallet advertises version `0`; unsupported wallets fail clearly rather than receiving an incompatible transaction.

This preserves the wallets and paths used during real execution/rebalance validation. Transaction v1 is not silently selected merely because a wallet advertises it. Moving to v1 requires measured or estimated compute and loaded-account-data limits, simulation, RPC/read-path validation with `maxSupportedTransactionVersion: 1`, and a fresh wallet compatibility regression. Until then, version `0` is the single project policy.

## RPC boundaries

Execution and registry RPC are intentionally separate:

```text
execution RPC → mainnet-beta tokenized-equity/Jupiter activity
registry RPC  → configured registry cluster (commonly devnet during testing)
```

Backend registry verification checks the configured network's genesis hash before reading accounts. It then validates program ownership, exact data length, Anchor discriminator, creator, strategy ID, strategy/version linkage, version numbers, and canonical allocation hashes.

## Non-custodial boundary

The application never holds an investor signing key and never signs on the investor's behalf. Investors explicitly approve swap, fee, and rebalance transactions. The Anchor registry stores commitments only and never holds or trades investor assets.
