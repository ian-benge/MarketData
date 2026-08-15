import {
  assetClassFor,
  type SecurityType,
} from "./taxonomy";

export type InstrumentClassification = {
  name: string;
  securityType: SecurityType;
  assetClass: string;
  exchange?: string | null;
  issuer?: string | null;
  underlyingSymbol?: string | null;
  leverageMultiple?: number | null;
  isInverse?: boolean;
  isOtc?: boolean;
  country?: string | null;
  quoteSource?: string;
};

const LEVERAGED: Record<
  string,
  Pick<InstrumentClassification, "name" | "underlyingSymbol" | "leverageMultiple" | "isInverse">
> = {
  SOXL: {
    name: "Direxion Daily Semiconductor Bull 3X",
    underlyingSymbol: "SOXX",
    leverageMultiple: 3,
    isInverse: false,
  },
  RAM: {
    name: "Roundhill Daily 2x Long DRAM ETF",
    underlyingSymbol: "DRAM",
    leverageMultiple: 2,
    isInverse: false,
  },
  HIMZ: {
    name: "Defiance Daily Target 2X Long HIMS ETF",
    underlyingSymbol: "HIMS",
    leverageMultiple: 2,
    isInverse: false,
  },
  VIXY: {
    name: "ProShares VIX Short-Term Futures ETF",
    underlyingSymbol: "VIX",
    leverageMultiple: 1,
    isInverse: false,
  },
};

const INDEXES: Record<string, string> = {
  DXY: "U.S. Dollar Index",
};

const ADRS: Record<string, InstrumentClassification> = {
  SKHY: {
    name: "SK hynix Inc. ADR",
    securityType: "adr",
    assetClass: "equity",
    exchange: "NASDAQ",
    issuer: "SK hynix",
    country: "KR",
  },
  TSM: {
    name: "Taiwan Semiconductor Manufacturing Co. ADR",
    securityType: "adr",
    assetClass: "equity",
    exchange: "NYSE",
    issuer: "TSMC",
    country: "TW",
  },
  NVO: {
    name: "Novo Nordisk A/S ADR",
    securityType: "adr",
    assetClass: "equity",
    exchange: "NYSE",
    issuer: "Novo Nordisk",
    country: "DK",
  },
  BABA: {
    name: "Alibaba Group Holding ADR",
    securityType: "adr",
    assetClass: "equity",
    exchange: "NYSE",
    country: "CN",
  },
  ASML: {
    name: "ASML Holding N.V. NYRS",
    securityType: "adr",
    assetClass: "equity",
    exchange: "NASDAQ",
    country: "NL",
  },
};

const OTC: Record<string, string> = {
  BESIY: "BE Semiconductor Industries N.V. OTC",
  LYSCF: "Lynas Rare Earths Ltd. OTC",
  SIVEF: "Sivers Semiconductors OTC",
  SBGSY: "Schneider Electric SE OTC",
};

const ETFS: Record<string, string> = {
  SPY: "SPDR S&P 500 ETF Trust",
  QQQ: "Invesco QQQ Trust",
  IWM: "iShares Russell 2000 ETF",
  DIA: "SPDR Dow Jones Industrial Average ETF",
  RSP: "Invesco S&P 500 Equal Weight ETF",
  TLT: "iShares 20+ Year Treasury Bond ETF",
  IEF: "iShares 7-10 Year Treasury Bond ETF",
  SHY: "iShares 1-3 Year Treasury Bond ETF",
  SGOV: "iShares 0-3 Month Treasury Bond ETF",
  TIP: "iShares TIPS Bond ETF",
  HYG: "iShares iBoxx $ High Yield Corporate Bond ETF",
  LQD: "iShares iBoxx $ Investment Grade Corporate Bond ETF",
  JNK: "SPDR Bloomberg High Yield Bond ETF",
  BKLN: "Invesco Senior Loan ETF",
  EMB: "iShares J.P. Morgan USD Emerging Markets Bond ETF",
  UUP: "Invesco DB US Dollar Index Bullish Fund",
  GLD: "SPDR Gold Shares",
  SLV: "iShares Silver Trust",
  USO: "United States Oil Fund",
  VXX: "iPath Series B S&P 500 VIX Short-Term Futures ETN",
  IBIT: "iShares Bitcoin Trust",
  BITO: "ProShares Bitcoin Strategy ETF",
  ETHA: "iShares Ethereum Trust ETF",
  XLE: "Energy Select Sector SPDR Fund",
  XLB: "Materials Select Sector SPDR Fund",
  XLI: "Industrial Select Sector SPDR Fund",
  XLY: "Consumer Discretionary Select Sector SPDR Fund",
  XLP: "Consumer Staples Select Sector SPDR Fund",
  XLV: "Health Care Select Sector SPDR Fund",
  XLF: "Financial Select Sector SPDR Fund",
  XLK: "Technology Select Sector SPDR Fund",
  XLC: "Communication Services Select Sector SPDR Fund",
  XLU: "Utilities Select Sector SPDR Fund",
  XLRE: "Real Estate Select Sector SPDR Fund",
  SMH: "VanEck Semiconductor ETF",
  SOXX: "iShares Semiconductor ETF",
  XSD: "SPDR S&P Semiconductor ETF",
  CIBR: "First Trust NASDAQ Cybersecurity ETF",
  TAN: "Invesco Solar ETF",
  URA: "Global X Uranium ETF",
  URNM: "Sprott Uranium Miners ETF",
  COPX: "Global X Copper Miners ETF",
  XME: "SPDR S&P Metals & Mining ETF",
  GDX: "VanEck Gold Miners ETF",
  ITA: "iShares U.S. Aerospace & Defense ETF",
  XBI: "SPDR S&P Biotech ETF",
  IBB: "iShares Biotechnology ETF",
  BBH: "VanEck Biotech ETF",
  KRE: "SPDR S&P Regional Banking ETF",
  KWEB: "KraneShares CSI China Internet ETF",
  FXI: "iShares China Large-Cap ETF",
  XRT: "SPDR S&P Retail ETF",
  XHB: "SPDR S&P Homebuilders ETF",
  XTN: "SPDR S&P Transportation ETF",
  JETS: "U.S. Global Jets ETF",
  PAVE: "Global X U.S. Infrastructure Development ETF",
  BOTZ: "Global X Robotics & Artificial Intelligence ETF",
  ARKK: "ARK Innovation ETF",
  FDN: "First Trust Dow Jones Internet ETF",
  IGV: "iShares Expanded Tech-Software Sector ETF",
  MAGS: "Roundhill Magnificent Seven ETF",
  MGK: "Vanguard Mega Cap Growth ETF",
  IPO: "Renaissance IPO ETF",
  MJ: "Amplify Alternative Harvest ETF",
  SLX: "VanEck Steel ETF",
  PDBC: "Invesco Optimum Yield Diversified Commodity Strategy ETF",
  XOP: "SPDR S&P Oil & Gas Exploration & Production ETF",
  CPER: "United States Copper Index Fund",
  FXY: "Invesco CurrencyShares Japanese Yen Trust",
  NCLD: "Roundhill Neocloud ETF",
  HUMN: "Roundhill Humanoid Robotics ETF",
  DRAM: "Roundhill Memory ETF",
  MARS: "Roundhill Ball Metaverse / Mars theme ETF",
  POWR: "iShares U.S. Power Infrastructure ETF",
  OZEM: "Roundhill GLP-1 & Weight Loss ETF",
  QQQE: "Direxion NASDAQ-100 Equal Weighted Index Shares",
};

const EQUITY_NAMES: Record<string, string> = {
  NVDA: "NVIDIA Corporation",
  MSFT: "Microsoft Corporation",
  AAPL: "Apple Inc.",
  GOOGL: "Alphabet Inc. Class A",
  AMZN: "Amazon.com Inc.",
  META: "Meta Platforms Inc.",
  AVGO: "Broadcom Inc.",
  AMD: "Advanced Micro Devices Inc.",
  TSLA: "Tesla Inc.",
  ORCL: "Oracle Corporation",
  PLTR: "Palantir Technologies Inc.",
  NFLX: "Netflix Inc.",
  JPM: "JPMorgan Chase & Co.",
  INTC: "Intel Corporation",
  MU: "Micron Technology Inc.",
  SNDK: "Sandisk Corporation",
  WDC: "Western Digital Corporation",
  STX: "Seagate Technology Holdings",
  SIMO: "Silicon Motion Technology",
  ARM: "Arm Holdings",
  MRVL: "Marvell Technology",
  QCOM: "Qualcomm Inc.",
  AMAT: "Applied Materials Inc.",
  LRCX: "Lam Research Corporation",
  KLAC: "KLA Corporation",
  ENTG: "Entegris Inc.",
  ONTO: "Onto Innovation Inc.",
  TER: "Teradyne Inc.",
  KLIC: "Kulicke and Soffa Industries",
  AMKR: "Amkor Technology",
  ASX: "ASE Technology Holding",
  CAMT: "Camtek Ltd.",
  COHU: "Cohu Inc.",
  ACLS: "Axcelis Technologies",
  ACMR: "ACM Research",
  AEHR: "Aehr Test Systems",
  MKSI: "MKS Inc.",
  TSEM: "Tower Semiconductor",
  ANET: "Arista Networks",
  CRDO: "Credo Technology Group",
  ALAB: "Astera Labs",
  CSCO: "Cisco Systems",
  CIEN: "Ciena Corporation",
  AAOI: "Applied Optoelectronics Inc.",
  COHR: "Coherent Corp.",
  LITE: "Lumentum Holdings Inc.",
  FN: "Fabrinet",
  GLW: "Corning Inc.",
  AXTI: "AXT Inc.",
  POET: "POET Technologies",
  VRT: "Vertiv Holdings",
  ETN: "Eaton Corporation",
  MOD: "Modine Manufacturing",
  CARR: "Carrier Global",
  TT: "Trane Technologies",
  JCI: "Johnson Controls",
  NVT: "nVent Electric",
  HUBB: "Hubbell Inc.",
  POWL: "Powell Industries",
  VICR: "Vicor Corporation",
  MPWR: "Monolithic Power Systems",
  GEV: "GE Vernova",
  FPS: "Forgent Power Solutions",
  PWR: "Quanta Services",
  FIX: "Comfort Systems USA",
  EME: "EMCOR Group",
  ACM: "AECOM",
  MTZ: "MasTec Inc.",
  DELL: "Dell Technologies",
  HPE: "Hewlett Packard Enterprise",
  SMCI: "Super Micro Computer",
  PSTG: "Pure Storage",
  NTAP: "NetApp Inc.",
  SANM: "Sanmina Corporation",
  TTMI: "TTM Technologies",
  CRWV: "CoreWeave",
  NBIS: "Nebius Group",
  IREN: "IREN Limited",
  APLD: "Applied Digital",
  WULF: "TeraWulf Inc.",
  CORZ: "Core Scientific",
  WYFI: "WhiteFiber Inc.",
  SEI: "Solaris Energy Infrastructure",
  CRWD: "CrowdStrike Holdings",
  PANW: "Palo Alto Networks",
  FTNT: "Fortinet Inc.",
  ZS: "Zscaler Inc.",
  OKTA: "Okta Inc.",
  RBRK: "Rubrik Inc.",
  NET: "Cloudflare Inc.",
  CHKP: "Check Point Software",
  CEG: "Constellation Energy",
  VST: "Vistra Corp.",
  NRG: "NRG Energy",
  TLN: "Talen Energy",
  NEE: "NextEra Energy",
  SO: "Southern Company",
  DUK: "Duke Energy",
  AEP: "American Electric Power",
  EXC: "Exelon Corporation",
  PPL: "PPL Corporation",
  EQT: "EQT Corporation",
  AR: "Antero Resources",
  CTRA: "Coterra Energy",
  LNG: "Cheniere Energy",
  KMI: "Kinder Morgan",
  WMB: "Williams Companies",
  TRGP: "Targa Resources",
  ET: "Energy Transfer",
  EPD: "Enterprise Products Partners",
  LMT: "Lockheed Martin",
  RTX: "RTX Corporation",
  NOC: "Northrop Grumman",
  GD: "General Dynamics",
  LHX: "L3Harris Technologies",
  DRS: "Leonardo DRS",
  AVAV: "AeroVironment",
  KTOS: "Kratos Defense & Security",
  RKLB: "Rocket Lab",
  ASTS: "AST SpaceMobile",
  LUNR: "Intuitive Machines",
  RDW: "Redwire Corporation",
  PL: "Planet Labs",
  BKSY: "BlackSky Technology",
  SPIR: "Spire Global",
  VSAT: "Viasat Inc.",
  FCX: "Freeport-McMoRan",
  SCCO: "Southern Copper",
  TECK: "Teck Resources",
  HBM: "Hudbay Minerals",
  BHP: "BHP Group",
  RIO: "Rio Tinto",
  LLY: "Eli Lilly and Company",
  AMGN: "Amgen Inc.",
  VKTX: "Viking Therapeutics",
  GPCR: "Structure Therapeutics",
  ALT: "Altimmune Inc.",
  HIMS: "Hims & Hers Health",
  ISRG: "Intuitive Surgical",
  BSX: "Boston Scientific",
  SYK: "Stryker Corporation",
  MDT: "Medtronic",
  EW: "Edwards Lifesciences",
  ABT: "Abbott Laboratories",
  TMO: "Thermo Fisher Scientific",
  DHR: "Danaher Corporation",
  IQV: "IQVIA Holdings",
  IBKR: "Interactive Brokers Group",
  HOOD: "Robinhood Markets",
  CME: "CME Group",
  CBOE: "Cboe Global Markets",
  ICE: "Intercontinental Exchange",
  NDAQ: "Nasdaq Inc.",
  MKTX: "MarketAxess Holdings",
  COIN: "Coinbase Global",
  MSTR: "MicroStrategy / Strategy Inc.",
  MARA: "MARA Holdings",
  RIOT: "Riot Platforms",
  CLSK: "CleanSpark Inc.",
  HIVE: "HIVE Digital Technologies",
  UNH: "UnitedHealth Group",
  ELV: "Elevance Health",
  CI: "The Cigna Group",
  HUM: "Humana Inc.",
  CNC: "Centene Corporation",
  MOH: "Molina Healthcare",
  CVS: "CVS Health",
  OSCR: "Oscar Health",
  ALHC: "Alignment Healthcare",
  NOW: "ServiceNow Inc.",
  SNOW: "Snowflake Inc.",
  DDOG: "Datadog Inc.",
  MDB: "MongoDB Inc.",
  PATH: "UiPath Inc.",
  DLR: "Digital Realty Trust",
  EQIX: "Equinix Inc.",
  AMT: "American Tower",
  CCI: "Crown Castle",
  IRM: "Iron Mountain",
  SMR: "NuScale Power",
  OKLO: "Oklo Inc.",
  FSLR: "First Solar",
  ENPH: "Enphase Energy",
  SEDG: "SolarEdge Technologies",
  RUN: "Sunrun Inc.",
  ARRY: "Array Technologies",
  NXT: "Nextracker Inc.",
  FLNC: "Fluence Energy",
  EOSE: "Eos Energy Enterprises",
  STEM: "Stem Inc.",
  SHLS: "Shoals Technologies",
  IONQ: "IonQ Inc.",
  RGTI: "Rigetti Computing",
  QBTS: "D-Wave Quantum",
  QUBT: "Quantum Computing Inc.",
  ARQQ: "Arqit Quantum",
  LAES: "SEALSQ Corp.",
  CCJ: "Cameco Corporation",
  LEU: "Centrus Energy",
  BWXT: "BWX Technologies",
  UEC: "Uranium Energy",
  UUUU: "Energy Fuels",
  NXE: "NexGen Energy",
  DNN: "Denison Mines",
  NNE: "Nano Nuclear Energy",
  MP: "MP Materials",
  ALB: "Albemarle Corporation",
  LAC: "Lithium Americas",
  UAMY: "United States Antimony",
  CRML: "Critical Metals",
  METC: "Ramaco Resources",
  USAR: "USA Rare Earth",
  ASPI: "ASP Isotopes",
  NB: "NioCorp Developments",
  MTRN: "Materion Corporation",
  ROK: "Rockwell Automation",
  CGNX: "Cognex Corporation",
  SYM: "Symbotic Inc.",
  IRBT: "iRobot Corporation",
  SERV: "Serve Robotics",
  MBOT: "Microbot Medical",
  KITT: "Nauticus Robotics",
  ARBE: "Arbe Robotics",
  RR: "Richtech Robotics",
  SWMR: "Swarmer Inc.",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  AXP: "American Express",
  COF: "Capital One Financial",
  PYPL: "PayPal Holdings",
  AFRM: "Affirm Holdings",
  SQ: "Block Inc.",
  SYF: "Synchrony Financial",
  SEZL: "Sezzle Inc.",
  KLAR: "Klarna Group",
  C: "Citigroup Inc.",
  APO: "Apollo Global Management",
  BX: "Blackstone Inc.",
  KKR: "KKR & Co.",
  BAM: "Brookfield Asset Management",
  BLK: "BlackRock Inc.",
  GS: "Goldman Sachs Group",
  GLXY: "Galaxy Digital",
  SPCX: "SPAC and New Issue ETF",
  ACHR: "Archer Aviation",
  BE: "Bloom Energy",
  CVNA: "Carvana Co.",
  LULU: "Lululemon Athletica",
  EBAY: "eBay Inc.",
  FIG: "Figma Inc.",
  ZM: "Zoom Communications",
  CRCL: "Circle Internet Group",
  GME: "GameStop Corp.",
  HALO: "Halozyme Therapeutics",
  FROG: "JFrog Ltd.",
  AEVA: "Aeva Technologies",
  MXL: "MaxLinear Inc.",
  FCEL: "FuelCell Energy",
  CIFR: "Cipher Mining",
  PENG: "Penguin Solutions",
  SMTC: "Semtech Corporation",
  SITM: "SiTime Corporation",
  AGX: "Argan Inc.",
  WOLF: "Wolfspeed Inc.",
  PDFS: "PDF Solutions",
  AOSL: "Alpha and Omega Semiconductor",
  DOCN: "DigitalOcean",
  DGXX: "Digi Power X",
  BLZE: "Backblaze Inc.",
  UMAC: "Unusual Machines",
  OXY: "Occidental Petroleum",
  SM: "SM Energy",
  TLRY: "Tilray Brands",
  CGC: "Canopy Growth",
  CRON: "Cronos Group",
  SNDL: "SNDL Inc.",
  ACB: "Aurora Cannabis",
  GRWG: "GrowGeneration",
  APH: "Amphenol Corporation",
  SON: "Sonoco Products",
  FNNY: "FNNY",
};

export const QUARANTINE_SYMBOLS = [
  "BRUN",
  "CBRS",
  "MCRP",
  "PELI",
  "PTPA",
  "QNT",
  "INFQ",
  "HQ",
  "XNDU",
  "RBNE",
  "FNNY",
] as const;

const QUARANTINE = new Set<string>(QUARANTINE_SYMBOLS);

export function isQuarantineSymbol(symbol: string): boolean {
  return QUARANTINE.has(symbol.trim().toUpperCase());
}

export function classifyInstrument(
  symbol: string,
): InstrumentClassification | null {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;

  const leveraged = LEVERAGED[ticker];
  if (leveraged) {
    return {
      name: leveraged.name,
      securityType: ticker === "VXX" ? "etn" : "etf",
      assetClass: "etf",
      underlyingSymbol: leveraged.underlyingSymbol ?? null,
      leverageMultiple: leveraged.leverageMultiple ?? 1,
      isInverse: Boolean(leveraged.isInverse),
      quoteSource: "catalog",
    };
  }

  if (INDEXES[ticker]) {
    return {
      name: INDEXES[ticker]!,
      securityType: "index",
      assetClass: "index",
      quoteSource: "catalog",
    };
  }

  if (ADRS[ticker]) return { ...ADRS[ticker]!, quoteSource: "catalog" };

  if (OTC[ticker]) {
    return {
      name: OTC[ticker]!,
      securityType: "otc",
      assetClass: "equity",
      isOtc: true,
      quoteSource: "catalog",
    };
  }

  if (ETFS[ticker]) {
    const etn = ticker === "VXX";
    return {
      name: ETFS[ticker]!,
      securityType: etn ? "etn" : "etf",
      assetClass: "etf",
      quoteSource: "catalog",
    };
  }

  if (EQUITY_NAMES[ticker]) {
    return {
      name: EQUITY_NAMES[ticker]!,
      securityType: "common_stock",
      assetClass: "equity",
      quoteSource: "catalog",
    };
  }

  if (QUARANTINE.has(ticker)) {
    return {
      name: ticker,
      securityType: "unknown",
      assetClass: "equity",
      quoteSource: "catalog",
    };
  }

  return null;
}

export function classificationFromYahoo(input: {
  symbol: string;
  name: string | null;
  quoteType: string | null;
}): InstrumentClassification {
  const catalog = classifyInstrument(input.symbol);
  const quoteType = (input.quoteType ?? "").toUpperCase();
  let securityType: SecurityType = catalog?.securityType ?? "unknown";
  if (!catalog || catalog.securityType === "unknown" || catalog.securityType === "common_stock") {
    if (quoteType === "ETF") securityType = "etf";
    else if (quoteType === "ECNQUOTE" || quoteType === "INDEX") securityType = "index";
    else if (quoteType === "MUTUALFUND") securityType = "etf";
    else if (quoteType === "CRYPTOCURRENCY") securityType = "crypto";
    else if (quoteType === "FUTURE") securityType = "future";
    else if (quoteType === "EQUITY") securityType = catalog?.securityType === "adr" ? "adr" : "common_stock";
  }
  const name =
    catalog && catalog.name !== catalog.name.toUpperCase()
      ? catalog.name
      : input.name?.trim() || catalog?.name || input.symbol.toUpperCase();
  return {
    name,
    securityType,
    assetClass: assetClassFor(securityType),
    exchange: catalog?.exchange ?? null,
    issuer: catalog?.issuer ?? null,
    underlyingSymbol: catalog?.underlyingSymbol ?? null,
    leverageMultiple: catalog?.leverageMultiple ?? 1,
    isInverse: catalog?.isInverse ?? false,
    isOtc: catalog?.isOtc ?? false,
    country: catalog?.country ?? null,
    quoteSource: catalog ? "catalog+yahoo" : "yahoo",
  };
}

export function seedInstrumentRow(symbol: string): {
  symbol: string;
  name: string;
  asset_class: string;
  security_type: SecurityType;
  leverage_multiple: number | null;
  is_inverse: boolean;
  is_otc: boolean;
  underlying_symbol: string | null;
  issuer: string | null;
  exchange: string | null;
  country: string | null;
  resolution_status: "resolved" | "unverified" | "quarantined";
  quote_source: string | null;
} {
  const ticker = symbol.toUpperCase();
  const hit = classifyInstrument(ticker);
  const quarantined = isQuarantineSymbol(ticker);
  const name = hit?.name && hit.name !== ticker ? hit.name : ticker;
  return {
    symbol: ticker,
    name,
    asset_class: hit?.assetClass ?? (ticker.includes("-") ? "crypto" : "equity"),
    security_type: hit?.securityType ?? "unknown",
    leverage_multiple: hit?.leverageMultiple ?? 1,
    is_inverse: hit?.isInverse ?? false,
    is_otc: hit?.isOtc ?? false,
    underlying_symbol: hit?.underlyingSymbol ?? null,
    issuer: hit?.issuer ?? null,
    exchange: hit?.exchange ?? null,
    country: hit?.country ?? null,
    resolution_status: quarantined
      ? "quarantined"
      : hit && hit.name !== ticker
        ? "resolved"
        : "unverified",
    quote_source: hit?.quoteSource ?? null,
  };
}
