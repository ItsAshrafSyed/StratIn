# Recovery and Mainnet Readiness

## Environment matrix

### Local marketplace development

- `DATABASE_URL`
- `NEXT_PUBLIC_STRATIN_API_URL`
- `SOLANA_RPC_URL` or `HELIUS_API_KEY`
- `HELIUS_RPC_BASE_URL`
- `NEXT_PUBLIC_SOLANA_RPC_PROXY_URL` and `NEXT_PUBLIC_SOLANA_RPC_URL`
- `JUPITER_SWAP_API_BASE_URL` and `NEXT_PUBLIC_JUPITER_SWAP_API_BASE_URL`
- `ENTRY_FEE_BPS`, `REBALANCE_FEE_BPS`, `PROTOCOL_FEE_SHARE_BPS`, and `PROTOCOL_TREASURY`

### Devnet registry testing with mainnet execution

- Set `REGISTRY_SOLANA_RPC_URL` to the intended devnet endpoint and `REGISTRY_NETWORK=devnet`.
- Set `NEXT_PUBLIC_REGISTRY_SOLANA_RPC_PROXY_URL`, `NEXT_PUBLIC_REGISTRY_SOLANA_RPC_URL`, and `NEXT_PUBLIC_REGISTRY_NETWORK=devnet` for the same registry cluster.
- Keep execution variables and `NEXT_PUBLIC_WALLET_CHAIN` on mainnet for Jupiter/tokenized-equity execution unless a test explicitly says otherwise.
- For the explicit integration script only, set `STRATIN_REGISTRY_SIGNER_PATH` or configure the Solana CLI keypair path. Never place the signer file in the repository.

### Mainnet execution

- Execution RPC: `SOLANA_RPC_URL` or `HELIUS_API_KEY` plus `HELIUS_RPC_BASE_URL`.
- Browser proxy/public metadata: `NEXT_PUBLIC_SOLANA_RPC_PROXY_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`, and `NEXT_PUBLIC_WALLET_CHAIN`.
- Jupiter: `JUPITER_SWAP_API_BASE_URL` and `NEXT_PUBLIC_JUPITER_SWAP_API_BASE_URL`.
- Confirm fee configuration and the public protocol treasury address.

### Production

- Store `DATABASE_URL`, RPC credentials, and other secrets using the deployment platform's secret facility, not committed configuration.
- Set `ALLOWED_ORIGINS` to a comma-separated exact allowlist containing the production Vercel origin and only deliberately supported preview origins.
- Set `REGISTRY_NETWORK=mainnet-beta` and `REGISTRY_SOLANA_RPC_URL` to a mainnet endpoint, and verify the mainnet genesis hash during preflight.
- Keep registry and execution RPC variables separate even when both target mainnet.
- Configure allowed production web origins and production web/API URLs.
- Apply all Drizzle migrations to the intended Neon database before traffic.
- Confirm the NAV cron, observability, and failure alerts.
- Build and test the exact deployment commit.

## Known MVP trust limitations

The API still accepts caller-originated wallet addresses, transaction signatures, attributed positions, and rebalance fee-basis data. Fee splits and entry-fee action amounts are now derived server-side from configured fee rules, but the backend does not yet prove that submitted signatures contain the claimed swaps/transfers or that submitted positions match transaction balance changes.

Minimum production remediation:

1. wallet-signed nonce/challenge authentication for write endpoints;
2. server-side signature, instruction, recipient, mint, amount, and confirmation validation;
3. derive attributed positions and rebalance notional from validated transactions/quotes;
4. idempotency keys and reconciliation/backfill tooling.

## Atomicity and recovery boundary

Related PostgreSQL writes for strategy creation, strategy-version publication, investment recording, position updates, events, and fee events are grouped in database transactions. This cannot make Solana and PostgreSQL globally atomic.

```text
Solana succeeds
→ DB persistence or verification fails
→ on-chain commitment/trade remains valid
→ reconciliation/backfill is required
```

Automated reconciliation remains future work.

## Deployment state

- Registry behavior was validated on Solana devnet.
- The registry is deployed on mainnet at `3twgH9P4Knu51EqMZb5Fx2CSX1vUkw5Da4GYSUjiNzNs`.
- Mainnet deployment transaction: `2SVxMJfB1jeiksEXpC3upUVtjwNxxJgXc7N2n4Zk4JMLNqSmqzwmiyt6cc7RDA5wsG7WQ26btaCDEmkREbkfJUs4`.
- Do not redeploy, upgrade, close, or modify upgrade authority without separate explicit approval and preflight.
