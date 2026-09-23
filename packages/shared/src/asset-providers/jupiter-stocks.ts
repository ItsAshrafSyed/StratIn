import { USDC_MINT, type TokenizedEquityAsset } from "./types";

const REVIEWED_AT = "2026-09-23T18:32:59Z";

type ReviewedStockInput = {
  mint: string;
  symbol: string;
  name: string;
  issuer: string;
  decimals: number;
  iconUrl: string;
  outAmountAtomic: string;
  priceImpactPct: string;
  routeLabels: string[];
};

function reviewedStock(input: ReviewedStockInput): TokenizedEquityAsset {
  return {
    mint: input.mint,
    symbol: input.symbol,
    underlyingSymbol: input.symbol.endsWith("x")
      ? input.symbol.slice(0, -1)
      : input.symbol,
    name: input.name,
    issuer: input.issuer,
    providerId: "public-stocks",
    marketSegment: "public-equity",
    metadataSource: `https://api.jup.ag/tokens/v2/search?query=${input.mint}`,
    iconUrl: input.iconUrl,
    tokenProgram: "token-2022",
    decimals: input.decimals,
    assetClass: "tokenized-equity",
    priceSource: "jupiter-token-catalog+jupiter-quote-review",
    liquidityReview: {
      provider: "jupiter-platform",
      checkedAt: REVIEWED_AT,
      inputMint: USDC_MINT,
      inputAmountAtomic: "10000000",
      outAmountAtomic: input.outAmountAtomic,
      priceImpactPct: input.priceImpactPct,
      routeLabels: input.routeLabels,
      status: "quoted",
    },
  };
}

const backed = (
  input: Omit<ReviewedStockInput, "issuer" | "decimals">,
): TokenizedEquityAsset =>
  reviewedStock({ ...input, issuer: "Backed Finance", decimals: 8 });

const backpack = (
  input: Omit<ReviewedStockInput, "issuer" | "decimals">,
): TokenizedEquityAsset =>
  reviewedStock({ ...input, issuer: "Backpack Securities", decimals: 6 });

/**
 * Jupiter-reviewed stock snapshot.
 *
 * Inclusion criteria on REVIEWED_AT:
 * - present in Jupiter's verified catalog with the `stocks` tag
 * - not tagged `prestocks` or `tessera`
 * - at least $100,000 of liquidity reported by Jupiter
 * - a live 10 USDC -> asset Jupiter quote returned a route
 *
 * This remains a local allowlist so remote catalog changes cannot silently
 * enable executable assets.
 */
const REVIEWED_JUPITER_STOCK_ASSETS = [
  backed({
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    symbol: "SPYx",
    name: "SP500 xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/SPYx.png",
    outAmountAtomic: "1294148",
    priceImpactPct: "0.0001417139860589952562126615",
    routeLabels: ["Byreal"],
  }),
  backpack({
    mint: "MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1",
    symbol: "MU",
    name: "Micron Technology",
    iconUrl: "https://backpack.exchange/api/stock-logo/MU?cacheburst=1",
    outAmountAtomic: "9320",
    priceImpactPct: "0.000521396143020138880971591",
    routeLabels: ["GoonFi V2"],
  }),
  backed({
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    symbol: "NVDAx",
    name: "NVIDIA xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/NVDAx.png",
    outAmountAtomic: "4427856",
    priceImpactPct: "0",
    routeLabels: ["Riptide"],
  }),
  backpack({
    mint: "SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3",
    symbol: "SKHY",
    name: "SK Hynix",
    iconUrl: "https://backpack.exchange/api/stock-logo/SKHY",
    outAmountAtomic: "52747",
    priceImpactPct: "0",
    routeLabels: ["ZeroFi"],
  }),
  backed({
    mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
    symbol: "CRCLx",
    name: "Circle xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/CRCLx.png",
    outAmountAtomic: "10800940",
    priceImpactPct: "0.000293893330317735079874952",
    routeLabels: ["BinaryFi"],
  }),
  backed({
    mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    symbol: "QQQx",
    name: "Nasdaq xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png",
    outAmountAtomic: "1345229",
    priceImpactPct: "0.0000223769592968310843122917",
    routeLabels: ["Riptide"],
  }),
  backed({
    mint: "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8",
    symbol: "SPCXx",
    name: "SpaceX xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/SPCXx.png",
    outAmountAtomic: "6696149",
    priceImpactPct: "0.0001592001037314034626029713",
    routeLabels: ["ZeroFi", "Raydium CLMM"],
  }),
  backed({
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    symbol: "TSLAx",
    name: "Tesla xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/TSLAx.png",
    outAmountAtomic: "2637386",
    priceImpactPct: "0.0000486947979661283466687787",
    routeLabels: ["Riptide"],
  }),
  backed({
    mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",
    symbol: "HOODx",
    name: "Robinhood xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/HOODx.png",
    outAmountAtomic: "7991608",
    priceImpactPct: "0.0029207893227711759788610991",
    routeLabels: ["HumidiFi", "Meteora DLMM"],
  }),
  backed({
    mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",
    symbol: "COINx",
    name: "Coinbase xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/COINx.png",
    outAmountAtomic: "5026994",
    priceImpactPct: "0.0031342427884118355250339034",
    routeLabels: ["Manifest"],
  }),
  backed({
    mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
    symbol: "MSTRx",
    name: "MicroStrategy xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/MSTRx.png",
    outAmountAtomic: "6157357",
    priceImpactPct: "0.0001237106472780074417776059",
    routeLabels: ["Riptide"],
  }),
  backed({
    mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
    symbol: "GLDx",
    name: "Gold xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/GLDx.png",
    outAmountAtomic: "2542584",
    priceImpactPct: "0",
    routeLabels: ["Whirlpool"],
  }),
  backed({
    mint: "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc",
    symbol: "GMEx",
    name: "GameStop xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/GMEx.png",
    outAmountAtomic: "40404974",
    priceImpactPct: "0.0000044324646079467089476755",
    routeLabels: ["Raydium CLMM"],
  }),
  backpack({
    mint: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb",
    symbol: "SPCX",
    name: "SpaceX",
    iconUrl: "https://s3-symbol-logo.tradingview.com/spacex.svg",
    outAmountAtomic: "66973",
    priceImpactPct: "0.00036103488897157226887857",
    routeLabels: ["GoonFi V2"],
  }),
  backed({
    mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    symbol: "MSFTx",
    name: "Microsoft xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/MSFTx.png",
    outAmountAtomic: "1987649",
    priceImpactPct: "0.0019853899789205723882879634",
    routeLabels: ["Raydium CLMM"],
  }),
  backed({
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    symbol: "AAPLx",
    name: "Apple xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png",
    outAmountAtomic: "2954384",
    priceImpactPct: "0.0017534798623541432376185965",
    routeLabels: ["Kipseli", "Whirlpool"],
  }),
  backed({
    mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    symbol: "METAx",
    name: "Meta xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/METAx.png",
    outAmountAtomic: "1330786",
    priceImpactPct: "0.0022287669226093038585155645",
    routeLabels: ["Whirlpool"],
  }),
  backpack({
    mint: "SNDKbwMUQvZhnLnxLduradgLHG5KrPuKwpnrkkGRhfH",
    symbol: "SNDK",
    name: "Sandisk",
    iconUrl: "https://backpack.exchange/api/stock-logo/SNDK",
    outAmountAtomic: "5480",
    priceImpactPct: "0.0010010329793586043430741338",
    routeLabels: ["BinaryFi"],
  }),
  backed({
    mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    symbol: "GOOGLx",
    name: "Alphabet xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/GOOGLx.png",
    outAmountAtomic: "2939185",
    priceImpactPct: "0.0022651583025390564787087897",
    routeLabels: ["HumidiFi", "Whirlpool"],
  }),
  backpack({
    mint: "MSTRdWXMeZxdE8osAQy3fA4rvTY5rgummDSMEx6U7Nz",
    symbol: "MSTR",
    name: "Strategy",
    iconUrl: "https://backpack.exchange/api/stock-logo/MSTR?test=test",
    outAmountAtomic: "61539",
    priceImpactPct: "0",
    routeLabels: ["ZeroFi"],
  }),
  backed({
    mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
    symbol: "MCDx",
    name: "McDonald's xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/MCDx.png",
    outAmountAtomic: "4124447",
    priceImpactPct: "0.0013405906352554178016128428",
    routeLabels: ["HumidiFi", "Meteora DLMM"],
  }),
  backed({
    mint: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",
    symbol: "PLTRx",
    name: "Palantir xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/PLTRx.png",
    outAmountAtomic: "5229875",
    priceImpactPct: "0.0032199245611323490271505789",
    routeLabels: ["Whirlpool"],
  }),
  backpack({
    mint: "DKNGQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow",
    symbol: "DKNG",
    name: "DraftKings",
    iconUrl: "https://backpack.exchange/api/stock-logo/DKNG",
    outAmountAtomic: "474416",
    priceImpactPct: "0.0004657659899484435236494034",
    routeLabels: ["Raydium CLMM"],
  }),
  backed({
    mint: "Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH",
    symbol: "STRCx",
    name: "Strategy PP Variable xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/STRCx.png",
    outAmountAtomic: "9301875",
    priceImpactPct: "0.0012302247283035889076002885",
    routeLabels: ["GoonFi V2", "Raydium CLMM"],
  }),
  backed({
    mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
    symbol: "AMZNx",
    name: "Amazon xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/AMZNx.png",
    outAmountAtomic: "4008822",
    priceImpactPct: "0.0027721144536328156543627549",
    routeLabels: ["GoonFi V2", "Meteora DLMM"],
  }),
  backpack({
    mint: "TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo",
    symbol: "TTWO",
    name: "Take-Two Interactive Software",
    iconUrl: "https://backpack.exchange/api/stock-logo/TTWO",
    outAmountAtomic: "48147",
    priceImpactPct: "0.0013668260368833455528553634",
    routeLabels: ["ZeroFi"],
  }),
  backpack({
    mint: "DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF",
    symbol: "DJT",
    name: "Trump Media & Technology Group",
    iconUrl: "https://backpack.exchange/api/stock-logo/DJT",
    outAmountAtomic: "1104851",
    priceImpactPct: "0",
    routeLabels: ["Kipseli", "Raydium CLMM"],
  }),
  backpack({
    mint: "MRNAzXzhNcaEXJPibHEn8cd4vyekCDiivTyEwswLUCT",
    symbol: "MRNA",
    name: "Moderna",
    iconUrl: "https://backpack.exchange/api/stock-logo/MRNA",
    outAmountAtomic: "54487",
    priceImpactPct: "0.0069861491494960813340597827",
    routeLabels: ["Raydium CLMM"],
  }),
  backpack({
    mint: "CzLTZppPdZtTjyq3WGpHLstoc3GLhu7zH5Zg6xUa6Gv5",
    symbol: "COPX",
    name: "Global X Copper Miners ETF",
    iconUrl: "https://backpack.exchange/api/stock-logo/COPX",
    outAmountAtomic: "115495",
    priceImpactPct: "0.0012583639530614507792927755",
    routeLabels: ["Kipseli", "Meteora DLMM"],
  }),
  backpack({
    mint: "CYPHuMmCL1GxJWa2tsPhLKykC7GrHJTCHwbXD4g5uawK",
    symbol: "CYPH",
    name: "Cypherpunk Technologies",
    iconUrl: "https://backpack.exchange/api/stock-logo/CYPH",
    outAmountAtomic: "2792775",
    priceImpactPct: "0.0046087223959024174501834274",
    routeLabels: ["Kipseli", "Raydium CLMM"],
  }),
  backpack({
    mint: "DRAMjSWR7HRfJKjRkvQWYL2bcaejaVhuxEcjf4pAY4Cw",
    symbol: "DRAM",
    name: "Roundhill Memory ETF",
    iconUrl: "https://backpack.exchange/api/stock-logo/DRAM",
    outAmountAtomic: "161391",
    priceImpactPct: "0",
    routeLabels: ["GoonFi V2"],
  }),
  backpack({
    mint: "HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A",
    symbol: "HOOD",
    name: "Robinhood Markets",
    iconUrl: "https://backpack.exchange/api/stock-logo/HOOD",
    outAmountAtomic: "80222",
    priceImpactPct: "0",
    routeLabels: ["ZeroFi"],
  }),
  backpack({
    mint: "URARfsinxCRw4JpvQhuT4CxavdZXZEMjv9ZwWmWpwag",
    symbol: "URA",
    name: "Global X Uranium ETF",
    iconUrl: "https://backpack.exchange/api/stock-logo/URA",
    outAmountAtomic: "238738",
    priceImpactPct: "0",
    routeLabels: ["Manifest"],
  }),
  backpack({
    mint: "BoTx8y9ynfdxf5ZjWtCoBVkff52qKA82ysaLU8ZM6d8T",
    symbol: "BOT",
    name: "RoboStrategy",
    iconUrl: "https://backpack.exchange/api/stock-logo/BOT",
    outAmountAtomic: "349850",
    priceImpactPct: "0.0000272702262760690241489921",
    routeLabels: ["Raydium CLMM"],
  }),
  backpack({
    mint: "AMD8XwJXgQ9WV45Wyj9yFLejxzf2J6VM1PJY8bJEjeES",
    symbol: "AMD",
    name: "Advanced Micro Devices",
    iconUrl: "https://backpack.exchange/api/stock-logo/AMD",
    outAmountAtomic: "16306",
    priceImpactPct: "0.0007157082180439816493218384",
    routeLabels: ["Meteora DLMM"],
  }),
  backpack({
    mint: "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg",
    symbol: "NKE",
    name: "Nike",
    iconUrl: "https://backpack.exchange/api/stock-logo/NKE",
    outAmountAtomic: "278546",
    priceImpactPct: "0.0020527571224986250860321405",
    routeLabels: ["Whirlpool"],
  }),
  backpack({
    mint: "NQ5hSuXQZrbnrwcDVk2qN73njjd3E3v3badYHnj5thF",
    symbol: "IONQ",
    name: "IonQ",
    iconUrl: "https://backpack.exchange/api/stock-logo/IONQ",
    outAmountAtomic: "234033",
    priceImpactPct: "0",
    routeLabels: ["Flux", "Raydium CLMM"],
  }),
  backed({
    mint: "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ",
    symbol: "KOx",
    name: "Coca-Cola xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/KOx.png",
    outAmountAtomic: "11108056",
    priceImpactPct: "0",
    routeLabels: ["Whirlpool"],
  }),
  backpack({
    mint: "LMT3i1BHgixFqPUgcyteJhnEz2dpy9i3cYy4pi9BoeV",
    symbol: "LMT",
    name: "Lockheed Martin",
    iconUrl: "https://backpack.exchange/api/stock-logo/LMT",
    outAmountAtomic: "19001",
    priceImpactPct: "0.003008567274634637765909695",
    routeLabels: ["GoonFi V2", "Raydium CLMM"],
  }),
  backed({
    mint: "XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM",
    symbol: "INTCx",
    name: "Intel xStock",
    iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/INTCx.png",
    outAmountAtomic: "8277781",
    priceImpactPct: "0.0006217091890597909740481938",
    routeLabels: ["Quantum", "Raydium CLMM"],
  }),
  backpack({
    mint: "RBLXDGRD64AtRamHMFVcjqne3Ar7NLWtFtYNtsrf1cE",
    symbol: "RBLX",
    name: "Roblox",
    iconUrl: "https://backpack.exchange/api/stock-logo/RBLX",
    outAmountAtomic: "202151",
    priceImpactPct: "0.0015492644759565722284792603",
    routeLabels: ["Quantum", "Raydium CLMM"],
  }),
  backpack({
    mint: "RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh",
    symbol: "RDDT",
    name: "Reddit",
    iconUrl: "https://backpack.exchange/api/stock-logo/RDDT",
    outAmountAtomic: "66256",
    priceImpactPct: "0.004303973212523269453610812",
    routeLabels: ["Whirlpool"],
  }),
  backpack({
    mint: "GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2",
    symbol: "GRND",
    name: "Grindr",
    iconUrl: "https://backpack.exchange/api/stock-logo/GRND",
    outAmountAtomic: "643264",
    priceImpactPct: "0.0035458136134471055521900542",
    routeLabels: ["Whirlpool"],
  }),
] as const satisfies readonly TokenizedEquityAsset[];

const LEGACY_ASSET_ORDER = new Map(
  ["NVDAx", "AAPLx", "METAx", "TSLAx", "GOOGLx"].map((symbol, index) => [
    symbol,
    index,
  ]),
);

/** Preserve the original registry prefix because deterministic fixtures and
 * historical client defaults use those first five entries. */
export const JUPITER_STOCK_ASSETS = [...REVIEWED_JUPITER_STOCK_ASSETS].sort(
  (left, right) =>
    (LEGACY_ASSET_ORDER.get(left.symbol) ?? Number.MAX_SAFE_INTEGER) -
    (LEGACY_ASSET_ORDER.get(right.symbol) ?? Number.MAX_SAFE_INTEGER),
);
