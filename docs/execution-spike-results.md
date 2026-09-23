# Execution Spike Results

Date/time: 2026-09-15

Status: real wallet execution confirmed

## Scope

This spike is limited to:

USDC in the connected investor wallet -> allocation engine -> Jupiter quotes -> wallet-signed sequential swaps -> supported tokenized-equity SPL tokens in the same wallet.

No strategy CRUD, database persistence, marketplace, NAV, rebalances, fees, notifications, custody, or Anchor registry are part of this spike.

## Network

- Solana mainnet-beta
- RPC: local Next proxy using `SOLANA_RPC_URL` or `HELIUS_API_KEY`
- Wallet path: Solana Kit + Wallet Standard
- Execution provider: Jupiter Lite Swap API v1
- Jupiter instruction version: `V2`
- Jupiter transaction mode: versioned transaction, `asLegacyTransaction=false`

## Test Strategy

| Asset | Mint                                           | Weight | Target On 100 USDC |
| ----- | ---------------------------------------------- | -----: | -----------------: |
| NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`  |    40% |            40 USDC |
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`  |    25% |            25 USDC |
| METAx | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu`  |    25% |            25 USDC |
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |    10% |   10 USDC retained |

## Pre-Execution Verification

- Stage 3 allocation tests passed: 8/8.
- Next production build passed.
- Jupiter quote checks at intended 100 USDC split:

| Leg           |   Input |  Expected Output | Route     |                   Price Impact |
| ------------- | ------: | ---------------: | --------- | -----------------------------: |
| USDC -> NVDAx | 40 USDC | 0.18788889 NVDAx | Whirlpool | 0.0000071648750109917976972909 |
| USDC -> TSLAx | 25 USDC | 0.06940113 TSLAx | Whirlpool |                              0 |
| USDC -> METAx | 25 USDC | 0.03750131 METAx | Byreal    | 0.0054079392458496061693325162 |

- Jupiter swap-build sanity check returned a serialized unsigned swap transaction for a small NVDAx quote.

## Real Execution Log

Executed from `/execution-spike` with connected wallet `5b6k98Aj5rkkUwaSN1AQJdDygGu8rVsJQNRwBvRmioCb`.

Observed input was 10 USDC, so the effective allocation was 4 USDC NVDAx, 2.5 USDC TSLAx, 2.5 USDC METAx, and 1 USDC retained.

| Leg           | Status    | Signature                                                                                  | Resulting Balance                  |
| ------------- | --------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| NVDAx         | Confirmed | `5eLEhJxAerh9iexqWUhbuuXgg8pkmgWAm8Bvnk1vnU2HC6Du3GErRRXWRhkrxHkRyTVyc9dC5WjCXRQ9tWCZcdpz` | +0.01879320 NVDAx                  |
| TSLAx         | Confirmed | `4d5Sr9Z67NngWFMSRZm71z3RyE87ehMQJkMhym717gqw6ceKJPVponFfmDRX7aidc8rqFQZtYsvGPAzKwn6hBnAs` | +0.00694881 TSLAx                  |
| METAx         | Confirmed | `5KUWjqHqriB7zxnJHEkjJXVjeRkuxsvGUfsdYo6VqrTF577brugxb7EpbjF7yNoCe2CRrFGh2NdfCs3RMvyj8tT8` | +0.00375306 METAx                  |
| USDC retained | Confirmed | n/a                                                                                        | 1 USDC retained from 10 USDC input |

## Failures / Issues

- The real execution used 10 USDC, not 100 USDC.
- Registry decimals were corrected after execution: Backed Token-2022 equity balances report 8 decimals on-chain.
