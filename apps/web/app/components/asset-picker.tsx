"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  STRATEGY_SELECTABLE_ASSETS,
  getSupportedAssetByMint,
} from "@stratin/shared";

type AssetTabId = "all" | "public-stocks" | "prestocks";

const TABS = [
  { id: "all", label: "All" },
  { id: "public-stocks", label: "Stocks" },
  { id: "prestocks", label: "PreStocks" },
] as const satisfies readonly { id: AssetTabId; label: string }[];

export function AssetPicker({
  currentMint,
  usedMints,
  disabled = false,
  onChange,
}: {
  currentMint: string;
  usedMints?: ReadonlySet<string>;
  disabled?: boolean;
  onChange: (mint: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentAsset = getSupportedAssetByMint(currentMint);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AssetTabId>(() =>
    currentAsset?.providerId === "prestocks" ? "prestocks" : "public-stocks",
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return STRATEGY_SELECTABLE_ASSETS.filter((asset) => {
      const matchesTab = activeTab === "all" || asset.providerId === activeTab;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        asset.symbol.toLowerCase().includes(normalizedQuery) ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.underlyingSymbol.toLowerCase().includes(normalizedQuery);
      return matchesTab && matchesQuery;
    });
  }, [activeTab, query]);

  const tabCount = (tabId: AssetTabId) =>
    tabId === "all"
      ? STRATEGY_SELECTABLE_ASSETS.length
      : STRATEGY_SELECTABLE_ASSETS.filter((asset) => asset.providerId === tabId)
          .length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-left text-white outline-none hover:border-white/20 disabled:opacity-50"
        disabled={disabled}
        onClick={() => {
          setIsOpen((open) => !open);
          setQuery("");
          if (currentAsset?.providerId === "prestocks") {
            setActiveTab("prestocks");
          } else if (currentAsset?.providerId === "public-stocks") {
            setActiveTab("public-stocks");
          }
        }}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={
              currentAsset?.providerId === "prestocks"
                ? "relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-400/15 text-xs font-semibold text-violet-200"
                : "relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-teal-300/15 text-xs font-semibold text-teal-100"
            }
          >
            {currentAsset?.symbol.slice(0, 2) ?? "?"}
            {currentAsset?.iconUrl ? (
              // The URL is part of StratIn's reviewed static asset allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="absolute inset-0 h-full w-full bg-white object-cover"
                src={currentAsset.iconUrl}
              />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {currentAsset?.symbol ?? "Choose asset"}
            </span>
            <span className="block truncate text-xs text-slate-400">
              {currentAsset?.name ?? currentMint}
            </span>
          </span>
        </span>
        <span className="text-xs text-slate-400">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(30rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-white/15 bg-[#111318] shadow-2xl shadow-black/60">
          <div className="flex gap-1 border-b border-white/10 px-3 pt-3">
            {TABS.map((tab) => (
              <button
                className={
                  activeTab === tab.id
                    ? "border-b-2 border-teal-300 px-3 pb-2 text-xs font-medium text-white"
                    : "border-b-2 border-transparent px-3 pb-2 text-xs text-slate-400 hover:text-white"
                }
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
                <span className="ml-1 text-[10px] text-slate-500">
                  {tabCount(tab.id)}
                </span>
              </button>
            ))}
          </div>

          <div className="border-b border-white/10 p-3">
            <input
              autoFocus
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-300/50"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol or company"
              value={query}
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2" role="listbox">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((asset) => {
                const isSelected = asset.mint === currentMint;
                const isUsed = usedMints?.has(asset.mint) && !isSelected;

                return (
                  <button
                    aria-selected={isSelected}
                    className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={isUsed}
                    key={asset.mint}
                    onClick={() => {
                      onChange(asset.mint);
                      setIsOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={
                          asset.providerId === "prestocks"
                            ? "relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-400/15 text-xs font-semibold text-violet-200"
                            : "relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-teal-300/15 text-xs font-semibold text-teal-100"
                        }
                      >
                        {asset.symbol.slice(0, 2)}
                        {asset.iconUrl ? (
                          // The URL is part of StratIn's reviewed static asset allowlist.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt=""
                            className="absolute inset-0 h-full w-full bg-white object-cover"
                            src={asset.iconUrl}
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">
                          {asset.symbol}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          {asset.name} · {asset.issuer}
                        </span>
                      </span>
                    </span>
                    {isSelected ? (
                      <span className="text-sm text-teal-300">✓</span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                No assets match this search.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
