# Stage 2 Asset And Liquidity Review

Review date: 2026-09-15

This review keeps StratIn issuer-agnostic while selecting a tiny initial asset set for the first execution spike. The shared registry should be treated as a reviewed shortlist, not a permanent universe of supported tokenized equities.

## Sources Checked

- Backed/xStocks public Solana metadata URLs for token names and symbols.
- Public mint list for Backed Solana xStocks.
- Jupiter Lite quote API for $10 USDC exact-in routes into each candidate token with `instructionVersion=V2`.

## Candidate Set

| Asset | Mint | Token Program | Quote Status | Route Labels | Price Impact |
| --- | --- | --- | --- | --- | --- |
| NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | Token-2022, 8 decimals | Quoted | Riptide | 0.0003122344570105684944220468 |
| AAPLx | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | Token-2022, 8 decimals | Quoted | Byreal, Flux, PancakeSwap | 0.0018706156691716459250330669 |
| METAx | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu` | Token-2022, 8 decimals | Quoted | SolFi V2, Flux, Meteora DLMM | 0.0015931862644325237928228696 |
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | Token-2022, 8 decimals | Quoted | Flux, PancakeSwap | 0.000167191563958949705759396 |
| GOOGLx | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` | Token-2022, 8 decimals | Quoted | Quantum, Whirlpool | 0.0018527129204458540585405198 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | SPL Token | Cash leg | Native | n/a |

## Review Notes

- These are currently all Backed/xStocks assets because they were the easiest tokenized-equity SPL tokens to verify with issuer metadata and live Jupiter routes today.
- This does not make StratIn xStocks-specific. Issuer behavior must remain in provider adapters.
- All quoted equity candidates are marked `token-2022`, so Stage 4 execution must use `instructionVersion=V2` and Token-2022-aware account handling.
- Before Stage 4, re-run quotes at the intended demo notional, not just $10 USDC.
- If any route becomes unavailable or shows unacceptable price impact, remove that asset from the demo strategy rather than working around it in the strategy engine.
