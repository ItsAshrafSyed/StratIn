export function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatAtomic(amount: bigint, decimals: number) {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  const trimmedFraction = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

export function parseDecimalToAtomic(value: string, decimals: number) {
  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive amount.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");

  if (fractionPart.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }

  return (
    BigInt(wholePart) * 10n ** BigInt(decimals) +
    BigInt(fractionPart.padEnd(decimals, "0"))
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
