import type {
  CreateStrategyInput,
  PublishRebalanceInput,
  RecordRebalanceInput,
  RecordInvestmentInput,
  StrategyDetail,
  StrategyInvestment,
  FeeConfig,
  StrategyListItem,
  StrategyVersionDto
} from "@stratin/shared";
import { appConfig } from "../config";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${appConfig.apiBaseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(
      `Expected JSON from ${url}, got ${response.status} ${response.statusText || "response"} (${contentType || "no content-type"}). ` +
        `Preview: ${body.slice(0, 120)}`
    );
  }

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `API request failed with status ${response.status}.`);
  }

  return payload;
}

export async function createStrategy(input: CreateStrategyInput) {
  return apiFetch<{ strategy: StrategyDetail }>("/strategies", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listStrategies() {
  return apiFetch<{ strategies: StrategyListItem[] }>("/strategies");
}

export async function getStrategy(id: string) {
  return apiFetch<{ strategy: StrategyDetail }>(`/strategies/${id}`);
}

export async function refreshStrategyNav(id: string) {
  return apiFetch<{ snapshot: NonNullable<StrategyDetail["latestNavSnapshot"]> }>(`/strategies/${id}/nav/refresh`, {
    method: "POST"
  });
}

export async function getFeeConfig() {
  return apiFetch<{ config: FeeConfig }>("/config/fees");
}

export async function listStrategyVersions(id: string) {
  return apiFetch<{ versions: StrategyVersionDto[] }>(`/strategies/${id}/versions`);
}

export async function verifyStrategyRegistry(id: string) {
  return apiFetch<{
    strategyId: string;
    registryStrategyPda: string | null;
    results: {
      version: number;
      canonicalHash: string;
      dbHash: string | null;
      onChainHash: string | null;
      status: "MATCH" | "MISMATCH";
    }[];
  }>(`/strategies/${id}/registry/verify`);
}

export async function publishRebalance(strategyId: string, input: PublishRebalanceInput) {
  return apiFetch<{ strategy: StrategyDetail }>(`/strategies/${strategyId}/rebalances`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listStrategistStrategies(wallet: string) {
  return apiFetch<{ strategies: StrategyListItem[] }>(`/strategists/${wallet}/strategies`);
}

export async function recordInvestment(strategyId: string, input: RecordInvestmentInput) {
  return apiFetch<{ investment: StrategyInvestment }>(`/strategies/${strategyId}/investments`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listInvestorInvestments(wallet: string) {
  return apiFetch<{ investments: StrategyInvestment[] }>(`/investors/${wallet}/investments`);
}

export async function getInvestment(id: string) {
  return apiFetch<{ investment: StrategyInvestment }>(`/investments/${id}`);
}

export async function recordRebalance(investmentId: string, input: RecordRebalanceInput) {
  return apiFetch<{ investment: StrategyInvestment }>(`/investments/${investmentId}/rebalances`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
