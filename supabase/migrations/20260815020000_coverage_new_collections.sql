-- High-priority missing collections, subgroup splits, live screens, and
-- leveraged-product isolation. Memberships are additive; existing rows stay.

do $$
declare
  firm uuid;
  sid uuid;
  parent uuid;
  sym text;
  ord integer;
begin
  for firm in select id from public.firms loop
    -- Official GICS tape
    sid := public._cov_ensure_sector(
      firm, 'official-sector-tape', 'Official U.S. Sector Tape', 'sector', 'official_sectors',
      'The 11 GICS sector SPDRs. Stable market classification; custom themes may overlap but this layer does not.',
      'SPY', null, 2000, null, null, null, 'https://www.spglobal.com/spdji/en/landing/topic/gics/', true
    );
    ord := 0;
    foreach sym in array array['XLE','XLB','XLI','XLY','XLP','XLV','XLF','XLK','XLC','XLU','XLRE'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'benchmark', 'core', 'GICS sector benchmark ETF');
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'rates-yield-curve', 'Rates & Yield Curve', 'macro', 'market_tape',
      'Treasury duration proxies. 2s10s and real-yield series are derived when the provider supports them — these ETFs are not the yields themselves.',
      'TLT', null, 1100, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['SGOV','SHY','IEF','TLT','TIP'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'benchmark', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'credit-liquidity', 'Credit & Liquidity', 'macro', 'market_tape',
      'High-yield versus investment-grade proxies, bank loans, and EM dollar credit. Use for equity/credit divergence, not as a bond-pricing engine.',
      'HYG', null, 1200, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['HYG','LQD','JNK','BKLN','EMB'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'benchmark', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'volatility-breadth', 'Volatility, Breadth & Positioning', 'macro', 'market_tape',
      'Volatility ETPs plus equal-weight versus cap-weight and small-cap breadth proxies. VIXY/VXX are daily-reset products, not the VIX index.',
      'VIXY', null, 1300, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['VIXY','VXX','RSP','QQQE','IWM','HYG'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('VIXY','VXX') then 'proxy' else 'benchmark' end, 'core', null);
    end loop;

    -- AI compute stack
    sid := public._cov_ensure_sector(
      firm, 'ai-accelerators', 'AI Accelerators & Custom Silicon', 'theme', 'ai_compute',
      'GPU, custom ASIC, and foundry leaders that capture AI training and inference silicon spend.',
      'NVDA', 'bottleneck', 3110, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['NVDA','AMD','AVGO','MRVL','ARM','TSM','INTC','QCOM'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'NVDA' then 'leader' else 'pure_play' end, 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'memory-storage', 'Memory & Storage', 'theme', 'ai_compute',
      'HBM, DRAM, NAND, and HDD/SSD suppliers. DRAM is the reference ETF; RAM belongs in leveraged products only.',
      'DRAM', 'bottleneck', 3120, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['MU','SKHY','SNDK','WDC','STX','SIMO','DRAM'] loop
      ord := ord + 1;
      perform public._cov_add_member(
        sid, sym, ord * 10,
        case when sym = 'DRAM' then 'benchmark' when sym = 'SKHY' then 'leader' else 'pure_play' end,
        'core',
        case when sym = 'SKHY' then 'SK hynix U.S.-listed ADR; Memory/HBM constituent.' when sym = 'DRAM' then 'Roundhill Memory ETF reference.' else null end
      );
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'semicap-packaging', 'Semiconductor Equipment, Foundry & Advanced Packaging', 'industry', 'ai_compute',
      'WFE, foundry, and OSAT/test. Use subgroup tags rather than a single flat ranking.',
      'ASML', 'bottleneck', 3130, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['ASML','TSM','AMAT','LRCX','KLAC','ENTG','ONTO','TER','KLIC','AMKR','ASX','CAMT','COHU','ACLS','ACMR','AEHR','MKSI','TSEM'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('ASML','TSM') then 'leader' else 'supplier' end, case when ord <= 10 then 'core' else 'secondary' end, null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'networking-optical', 'Networking, Interconnect & Optical Chain', 'theme', 'ai_compute',
      'Networking silicon/systems plus the optical component chain. Pure-play optics sit in Photonics; this list is the interconnect tape.',
      'AVGO', 'bottleneck', 3200, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['ANET','AVGO','MRVL','CRDO','ALAB','CSCO','CIEN','AAOI','COHR','LITE','FN','GLW','AXTI','POET'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('ANET','AVGO') then 'leader' else 'pure_play' end, 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'dc-power-thermal', 'Data-Center Power, Thermal & Electrical Equipment', 'theme', 'ai_compute',
      'Power conversion, thermal management, and electrical equipment for AI data centers.',
      'VRT', 'bottleneck', 3210, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['VRT','ETN','MOD','CARR','TT','JCI','NVT','HUBB','POWL','VICR','MPWR','GEV','FPS'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'VRT' then 'leader' when sym = 'FPS' then 'speculative' else 'supplier' end, case when sym = 'FPS' then 'high_beta' else 'core' end, case when sym = 'FPS' then 'Forgent Power Solutions — classify in power equipment after liquidity review.' else null end);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'dc-construction-servers', 'Data-Center Construction, Servers & Storage', 'theme', 'ai_compute',
      'Electrical contractors, server OEMs, and enterprise storage shipping into AI buildouts.',
      'PWR', 'bottleneck', 3220, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['PWR','FIX','EME','ACM','MTZ','DELL','HPE','SMCI','PSTG','NTAP','SANM','TTMI'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'supplier', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'neoclouds-hpc', 'Neoclouds, GPU Infrastructure & HPC Hosts', 'theme', 'ai_compute',
      'GPU clouds and HPC hosts, including names transitioning from crypto mining. NCLD is the reference ETF.',
      'NCLD', 'bottleneck', 3230, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['CRWV','NBIS','IREN','APLD','WULF','CORZ','WYFI','ORCL','NCLD'] loop
      ord := ord + 1;
      perform public._cov_add_member(
        sid, sym, ord * 10,
        case when sym = 'NCLD' then 'benchmark' when sym = 'ORCL' then 'customer' else 'pure_play' end,
        case when sym in ('WYFI','CORZ') then 'high_beta' else 'core' end,
        case when sym = 'WYFI' then 'WhiteFiber — neocloud/data-center infrastructure if liquidity holds.' when sym = 'NCLD' then 'Roundhill Neocloud ETF reference.' else null end
      );
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'cybersecurity', 'Cybersecurity', 'theme', 'ai_compute',
      'Platform cybersecurity vendors. CRWD is primarily here; NET can carry multiple tags with an explicit role.',
      'CIBR', null, 3470, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['CIBR','CRWD','PANW','FTNT','ZS','OKTA','RBRK','NET','CHKP'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'CIBR' then 'benchmark' when sym = 'NET' then 'proxy' else 'leader' end, 'core', case when sym = 'NET' then 'Connectivity/security adjacency — not a pure-play endpoint vendor.' else null end);
    end loop;

    -- Energy & materials splits
    sid := public._cov_ensure_sector(
      firm, 'grid-electrification', 'Grid Equipment & Electrification', 'theme', 'energy_materials',
      'Grid equipment and electrification suppliers. POWR is a U.S. power-infrastructure reference.',
      'POWR', 'power-grid-nuclear-gas', 4010, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['POWR','ETN','HUBB','POWL','GEV','NVT','PWR','MYRG','MTZ'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'POWR' then 'benchmark' else 'supplier' end, 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'power-producers', 'Power Producers & Utilities', 'industry', 'energy_materials',
      'Independent power producers and regulated utilities. Distinguishes generation from pre-revenue nuclear developers.',
      'XLU', 'power-grid-nuclear-gas', 4020, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['XLU','CEG','VST','NRG','TLN','NEE','SO','DUK','AEP','EXC','PPL'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'XLU' then 'benchmark' when sym in ('CEG','VST') then 'leader' else 'pure_play' end, 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'lng-midstream', 'Natural Gas, LNG & Midstream', 'industry', 'energy_materials',
      'Gas producers, LNG, and midstream. Separate from nuclear and grid-equipment bottlenecks.',
      'LNG', 'power-grid-nuclear-gas', 4030, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['EQT','AR','CTRA','LNG','KMI','WMB','TRGP','ET','EPD'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'pure_play', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'nuclear-generation', 'Nuclear Generation', 'industry', 'energy_materials',
      'Nuclear-exposed utilities and IPPs already producing power.',
      'CEG', 'nukes', 4210, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['CEG','VST'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'leader', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'smr-developers', 'Advanced Reactors & SMRs', 'theme', 'energy_materials',
      'Pre-revenue or early-revenue advanced reactor and SMR developers. Not interchangeable with nuclear utilities.',
      'SMR', 'nukes', 4220, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['SMR','OKLO','NNE'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'speculative', 'high_beta', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'uranium-miners', 'Uranium Miners', 'industry', 'energy_materials',
      'Uranium miners and developers. URA/URNM are benchmarks, not operating companies.',
      'URA', 'nukes', 4230, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['URA','URNM','CCJ','UEC','UUUU','NXE','DNN'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('URA','URNM') then 'benchmark' else 'pure_play' end, 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'fuel-cycle', 'Fuel Cycle & Enrichment', 'industry', 'energy_materials',
      'Enrichment, conversion, and nuclear components.',
      'LEU', 'nukes', 4240, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['LEU','BWXT'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'pure_play', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'copper-metals', 'Copper, Metals & Mining', 'theme', 'energy_materials',
      'Copper and diversified miners plus metal ETFs. Separate price proxies from producers.',
      'COPX', 'rare-earth-materials', 4310, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['COPX','FCX','SCCO','TECK','HBM','BHP','RIO','XME'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('COPX','XME') then 'benchmark' else 'leader' end, 'core', case when sym = 'FCX' then 'Copper producer — not a rare-earth name.' else null end);
    end loop;

    -- Industrials & defense
    sid := public._cov_ensure_sector(
      firm, 'defense-aerospace', 'Defense & Aerospace', 'industry', 'industrials_defense',
      'Primes and defense electronics. Drone microcaps stay in a high-beta satellite list.',
      'ITA', null, 5200, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['ITA','LMT','RTX','NOC','GD','LHX','DRS','AVAV','KTOS','PLTR'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'ITA' then 'benchmark' when sym = 'PLTR' then 'proxy' else 'leader' end, 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'space-economy', 'Space Economy', 'theme', 'industrials_defense',
      'Launch, satellite, and space infrastructure. MARS is a theme reference after liquidity validation.',
      'MARS', null, 5400, null, null, null, 'https://www.roundhillinvestments.com/etf/mars/', true
    );
    ord := 0;
    foreach sym in array array['MARS','RKLB','ASTS','LUNR','RDW','PL','BKSY','SPIR','VSAT'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'MARS' then 'benchmark' when sym = 'RKLB' then 'leader' else 'speculative' end, case when sym in ('MARS','RKLB','VSAT') then 'core' else 'high_beta' end, null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'industrial-automation', 'Industrial Automation', 'theme', 'industrials_defense',
      'Factory automation and machine vision. Distinct from humanoids and medical robotics.',
      'ROK', 'robotics', 5110, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['ROK','TER','CGNX','SYM'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'pure_play', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'humanoids', 'Humanoids & Physical AI', 'theme', 'industrials_defense',
      'Humanoid and physical-AI names. HUMN is the reference ETF, not an operating company.',
      'HUMN', 'robotics', 5120, null, null, null, 'https://www.roundhillinvestments.com/etf/humn/', true
    );
    ord := 0;
    foreach sym in array array['HUMN','TSLA','SERV','RR'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'HUMN' then 'benchmark' else 'speculative' end, case when sym = 'HUMN' then 'core' else 'high_beta' end, case when sym = 'HUMN' then 'Roundhill Humanoid Robotics ETF reference.' else null end);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'defense-drones', 'Defense Drones & Counter-UAS', 'theme', 'industrials_defense',
      'Defense drone platforms, autonomy, and primes. Commercial drones are a separate tape.',
      'AVAV', 'drone-companies', 5310, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['AVAV','KTOS','DRS','LHX','ONDS','RCAT','SWMR'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('AVAV','KTOS') then 'leader' when sym = 'SWMR' then 'speculative' else 'supplier' end, case when sym in ('RCAT','SWMR','ONDS') then 'high_beta' else 'core' end, case when sym = 'SWMR' then 'Swarmer — defense/autonomous drone software after validation.' else null end);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'commercial-drones', 'Commercial & Industrial Drones', 'theme', 'industrials_defense',
      'Commercial/industrial UAV platforms and components.',
      'UAVS', 'drone-companies', 5320, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['UAVS','DPRO','UMAC'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'speculative', 'high_beta', null);
    end loop;

    -- Health
    sid := public._cov_ensure_sector(
      firm, 'glp1-obesity', 'GLP-1, Obesity & Metabolic Health', 'theme', 'health_consumer',
      'Commercial GLP-1 leaders versus clinical-stage catalysts. OZEM is the reference ETF.',
      'OZEM', null, 6200, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['OZEM','LLY','NVO','AMGN','VKTX','GPCR','ALT','HIMS'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym = 'OZEM' then 'benchmark' when sym in ('LLY','NVO') then 'leader' else 'speculative' end, case when sym in ('VKTX','GPCR','ALT') then 'high_beta' else 'core' end, null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'biotech', 'Biotech', 'industry', 'health_consumer',
      'Liquid biotech benchmarks. Not a catch-all health-care list.',
      'XBI', null, 6300, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['XBI','IBB','BBH'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'benchmark', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'medtech', 'MedTech', 'industry', 'health_consumer',
      'Medical devices and surgical robotics. ISRG is medtech, not industrial robotics.',
      'ISRG', null, 6400, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['ISRG','BSX','SYK','MDT','EW','ABT'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'leader', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'life-science-tools', 'Life-Science Tools', 'industry', 'health_consumer',
      'Tools and diagnostics suppliers to biopharma.',
      'TMO', null, 6500, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['TMO','DHR','IQV'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'leader', 'core', null);
    end loop;

    -- Financial & digital
    sid := public._cov_ensure_sector(
      firm, 'payment-networks', 'Payment Networks', 'industry', 'financial_digital',
      'Card networks. Distinct from issuers and BNPL originators.',
      'V', 'credit-cards-buy-now-pay-later', 7110, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['V','MA'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'leader', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'card-issuers', 'Card Issuers & Consumer Credit', 'industry', 'financial_digital',
      'Issuers — compare on charge-offs and delinquencies, not network take rate.',
      'AXP', 'credit-cards-buy-now-pay-later', 7120, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['AXP','COF','SYF','JPM','C'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'pure_play', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'fintech-bnpl', 'Fintech & BNPL', 'theme', 'financial_digital',
      'Fintech originators and BNPL. Funding cost and origination growth matter more than interchange.',
      'PYPL', 'credit-cards-buy-now-pay-later', 7130, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['PYPL','AFRM','SQ','SEZL','KLAR'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'pure_play', case when sym in ('SEZL','KLAR') then 'high_beta' else 'core' end, null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'brokers-exchanges', 'Brokers, Exchanges & Market Infrastructure', 'industry', 'financial_digital',
      'Trading venues, brokers, and market infrastructure — distinct from commercial banks.',
      'CME', null, 7200, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['IBKR','HOOD','CME','CBOE','ICE','NDAQ','MKTX','COIN'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'leader', 'core', null);
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'crypto-ecosystem', 'Crypto Ecosystem', 'theme', 'financial_digital',
      'Spot-token ETFs, exchanges/brokers, treasury companies, and miners/HPC-transition names. Keep those roles distinct.',
      'IBIT', null, 7300, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['IBIT','ETHA','COIN','MSTR','HOOD','MARA','RIOT','CLSK','HIVE','IREN'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, case when sym in ('IBIT','ETHA') then 'benchmark' when sym in ('COIN','HOOD') then 'leader' when sym = 'MSTR' then 'proxy' else 'pure_play' end, 'core', null);
    end loop;

    -- Tactical: leveraged products + screens
    sid := public._cov_ensure_sector(
      firm, 'leveraged-products', 'Leveraged Products', 'leveraged_product', 'tactical',
      'Short-horizon leveraged and inverse products. Daily reset. Never ranked as ordinary operating-company constituents.',
      'SOXL', null, 8400, null, null, null, null, true
    );
    ord := 0;
    foreach sym in array array['SOXL','RAM','HIMZ'] loop
      ord := ord + 1;
      perform public._cov_add_member(sid, sym, ord * 10, 'proxy', 'high_beta', 'Daily-reset leveraged product.');
    end loop;

    sid := public._cov_ensure_sector(
      firm, 'premarket-movers', 'Premarket Movers', 'screen', 'tactical',
      'Live screen: material premarket gap with liquidity. Membership is computed each refresh from the quoted universe.',
      null, null, 8000, 'premarket_movers', null, null, null, true
    );
    sid := public._cov_ensure_sector(
      firm, 'relative-volume', 'Relative Volume Leaders', 'screen', 'tactical',
      'Live screen: current volume versus recent average. Refreshes with the tape; not a hand-maintained list.',
      null, null, 8010, 'relative_volume', null, null, null, true
    );
    sid := public._cov_ensure_sector(
      firm, 'unusual-activity', 'Unusual Activity', 'screen', 'tactical',
      'Live screen: high relative volume combined with a material price move.',
      null, null, 8020, 'unusual_activity', null, null, null, true
    );
    sid := public._cov_ensure_sector(
      firm, 'earnings-today', 'Earnings Today', 'screen', 'tactical',
      'Live screen: names reporting today (BMO/AMC when known).',
      null, null, 8030, 'earnings_today', null, null, null, true
    );
    sid := public._cov_ensure_sector(
      firm, 'earnings-this-week', 'Earnings This Week', 'screen', 'tactical',
      'Live screen: earnings within the next five trading days.',
      null, null, 8040, 'earnings_week', null, null, null, true
    );

    -- Photonics expansion (additive)
    select id into parent from public.sectors where firm_id = firm and slug = 'photonics';
    if parent is not null then
      foreach sym in array array['GLW','AXTI','POET','ANET','CRDO'] loop
        perform public._cov_add_member(parent, sym, 900, 'supplier', 'secondary', 'Optical-chain adjacency added in the coverage redesign.');
      end loop;
    end if;

    -- Semiconductors expansion
    select id into parent from public.sectors where firm_id = firm and slug = 'semiconductors';
    if parent is not null then
      foreach sym in array array['SMH','QCOM','MRVL','ARM','ONTO','TER'] loop
        perform public._cov_add_member(parent, sym, 900, case when sym = 'SMH' then 'benchmark' else 'pure_play' end, case when sym = 'SMH' then 'core' else 'secondary' end, null);
      end loop;
    end if;
  end loop;
end $$;

drop function if exists public._cov_add_member(uuid, text, integer, text, text, text);
drop function if exists public._cov_ensure_sector(uuid, text, text, text, text, text, text, text, integer, text, date, date, text, boolean);
drop function if exists public._cov_instrument(text, text, text, text, text, numeric, boolean, boolean, text, text, text, text);
