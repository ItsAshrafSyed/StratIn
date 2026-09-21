# Solana Implementation Notes

Review date: 2026-09-15

## Current Decision

- Use `@solana/kit` for new Solana code.
- Use `@solana/kit-plugin-wallet` for browser wallet discovery and connection via Wallet Standard.
- Use `@solana/react` only to provide the Kit client to React components.
- Do not introduce `@solana/wallet-adapter-*` for new code.
- Avoid legacy `@solana/web3.js` v1 transaction construction unless a third-party SDK forces an interop boundary.

## Transaction Policy For Stage 4

- Prefer Solana transaction version `1` for StratIn-built transactions once the target wallet reports support for version `1`.
- Check `client.wallet.getState().connected?.supportedTransactionVersions.has(1)` before attempting to sign/send a version `1` transaction.
- Fall back only by explicit decision at the execution spike review point, not silently inside the strategy engine.
- Token-2022 assets require Token-2022-aware instruction/account handling.
- Jupiter routes must request `instructionVersion=V2` for Token-2022 candidates.

## Boundaries

- The web app may connect wallets in Stage 1, but it should not build execution transactions before Stage 4.
- The strategy engine remains issuer-agnostic and should never know whether an asset is Token-2022, xStocks, or another issuer-specific format.
- Provider adapters handle token-program, metadata, balance normalization, and execution quirks.
