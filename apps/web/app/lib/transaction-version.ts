export const STRATIN_TRANSACTION_VERSION = 0 as const;

/** Require the transaction format used by StratIn's validated wallet flows. */
export function requireStratInTransactionSupport(
  supportedVersions: ReadonlySet<unknown>,
) {
  if (!supportedVersions.has(STRATIN_TRANSACTION_VERSION)) {
    throw new Error(
      "Connected wallet does not support Solana version-0 transactions required by StratIn.",
    );
  }

  return STRATIN_TRANSACTION_VERSION;
}
