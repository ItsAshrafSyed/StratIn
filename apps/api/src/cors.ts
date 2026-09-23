const LOCAL_WEB_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
] as const;

export function getAllowedOrigins(configuredOrigins?: string) {
  const origins = new Set<string>(LOCAL_WEB_ORIGINS);

  for (const origin of configuredOrigins?.split(",") ?? []) {
    const normalized = normalizeOrigin(origin);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

export function resolveCorsOrigin(
  requestOrigin: string,
  configuredOrigins?: string,
) {
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedRequestOrigin) {
    return undefined;
  }

  return getAllowedOrigins(configuredOrigins).has(normalizedRequestOrigin)
    ? requestOrigin
    : undefined;
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    if (
      url.origin === "null" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}
