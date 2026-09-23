# Stage 2 Asset And Liquidity Review

Initial review date: 2026-09-15

Provider expansion review: 2026-09-24

This review keeps StratIn issuer-agnostic while selecting a tiny initial asset set for the first execution spike. The shared registry should be treated as a reviewed shortlist, not a permanent universe of supported tokenized equities.

## Sources Checked

- Jupiter Swap API for $10 USDC exact-in routes into each candidate token with `instructionVersion=V2`.
- Jupiter Tokens V2 verified catalog for tokenized-equity discovery using Jupiter's `stocks` tag and market metadata.
- [PreStocks public API](https://prestocks.com/api/prestocks) for PreStocks discovery metadata and mint addresses.
- Solana mainnet RPC for independent mint existence, owner, initialization, and decimals checks.

## Candidate Set

| Asset  | Mint                                           | Token Program          | Quote Status | Route Labels                 | Price Impact                   |
| ------ | ---------------------------------------------- | ---------------------- | ------------ | ---------------------------- | ------------------------------ |
| NVDAx  | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`  | Token-2022, 8 decimals | Quoted       | Riptide                      | 0.0003122344570105684944220468 |
| AAPLx  | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`  | Token-2022, 8 decimals | Quoted       | Byreal, Flux, PancakeSwap    | 0.0018706156691716459250330669 |
| METAx  | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu`  | Token-2022, 8 decimals | Quoted       | SolFi V2, Flux, Meteora DLMM | 0.0015931862644325237928228696 |
| TSLAx  | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`  | Token-2022, 8 decimals | Quoted       | Flux, PancakeSwap            | 0.000167191563958949705759396  |
| GOOGLx | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN`  | Token-2022, 8 decimals | Quoted       | Quantum, Whirlpool           | 0.0018527129204458540585405198 |
| USDC   | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | SPL Token              | Cash leg     | Native                       | n/a                            |

## Review Notes

- This does not make StratIn xStocks-specific. Issuer behavior must remain in provider adapters.
- All quoted equity candidates are marked `token-2022`, so Stage 4 execution must use `instructionVersion=V2` and Token-2022-aware account handling.
- Before Stage 4, re-run quotes at the intended demo notional, not just $10 USDC.
- If any route becomes unavailable or shows unacceptable price impact, remove that asset from the demo strategy rather than working around it in the strategy engine.

## Provider Expansion

The strategy picker is separated into two explicit tabs, with cash retained internally for settlement and historical compatibility:

| Group                       | Market segment           | Source                           | Supported assets                                                            |
| --------------------------- | ------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| Stocks                      | Tokenized securities     | Jupiter Tokens V2 + route review | 43 Jupiter-tagged, liquid, route-verified assets                            |
| PreStocks                   | Private-company exposure | PreStocks public API             | ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX |
| Cash (internal/legacy only) | Stablecoin settlement    | Circle                           | USDC                                                                        |

All eight PreStocks mints were independently confirmed on Solana mainnet as initialized Token-2022 mint accounts with 9 decimals. On 2026-09-24, Jupiter's verified catalog contained 1,556 entries carrying its `stocks` tag. After excluding `prestocks` and `tessera`, 43 assets reported at least $100,000 of Jupiter liquidity; all 43 returned a Jupiter exact-in route for a 10 USDC review quote. The reviewed Stocks group includes Token-2022 assets issued by Backed Finance and Backpack Securities with their actual 8- and 6-decimal precision respectively.

The provider endpoints are discovery sources, not an automatic execution allowlist. New or changed remote entries must pass mint ownership, decimals, token-program, and Jupiter-route review before being added to `SUPPORTED_TOKENIZED_EQUITIES`. NAV and execution prices continue to come from Jupiter; provider mark prices are not treated as executable prices.

Jupiter documents `GET /tokens/v2/tag?query=stocks`, but the authenticated endpoint returned an application-level `Invalid tag provided` response during this review while its `verified` and `lst` tags worked. The reviewed snapshot therefore comes entirely from Jupiter's authenticated `verified` catalog, filtered by the `stocks` tag and Jupiter's own liquidity metadata, followed by live Jupiter quote validation. A remote tag alone never bypasses the local execution allowlist.

USDC remains recognized internally as the execution input/fee currency and for historical strategies, but it is not offered as a selectable strategy holding for new versions.
