-- Restructure coverage collections and backfill instrument identity.
-- Preserves existing memberships: originals are renamed, split, or archived
-- rather than deleted. Unresolved tickers are quarantined, not dropped.

create or replace function public._cov_instrument(
  p_symbol text,
  p_name text,
  p_security_type text default 'common_stock',
  p_asset_class text default 'equity',
  p_exchange text default null,
  p_leverage numeric default 1,
  p_inverse boolean default false,
  p_otc boolean default false,
  p_underlying text default null,
  p_issuer text default null,
  p_country text default null,
  p_status text default 'resolved'
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_symbol text := upper(btrim(p_symbol));
begin
  insert into public.instruments (
    symbol, name, asset_class, security_type, exchange,
    leverage_multiple, is_inverse, is_otc, underlying_symbol,
    issuer, country, resolution_status, quote_source, last_verified_at
  )
  values (
    v_symbol, p_name, p_asset_class, p_security_type, p_exchange,
    p_leverage, p_inverse, p_otc, p_underlying,
    p_issuer, p_country, p_status, 'catalog', timezone('utc', now())
  )
  on conflict (symbol) do update set
    name = case
      when public.instruments.name = public.instruments.symbol then excluded.name
      else public.instruments.name
    end,
    asset_class = case
      when public.instruments.security_type is distinct from 'unknown' then public.instruments.asset_class
      else excluded.asset_class
    end,
    security_type = case
      when public.instruments.security_type is distinct from 'unknown' then public.instruments.security_type
      else excluded.security_type
    end,
    exchange = coalesce(public.instruments.exchange, excluded.exchange),
    leverage_multiple = coalesce(public.instruments.leverage_multiple, excluded.leverage_multiple),
    is_inverse = public.instruments.is_inverse or excluded.is_inverse,
    is_otc = public.instruments.is_otc or excluded.is_otc,
    underlying_symbol = coalesce(public.instruments.underlying_symbol, excluded.underlying_symbol),
    issuer = coalesce(public.instruments.issuer, excluded.issuer),
    country = coalesce(public.instruments.country, excluded.country),
    resolution_status = case
      when public.instruments.resolution_status in ('resolved', 'quarantined', 'inactive')
        then public.instruments.resolution_status
      else excluded.resolution_status
    end,
    quote_source = coalesce(public.instruments.quote_source, excluded.quote_source),
    last_verified_at = coalesce(public.instruments.last_verified_at, excluded.last_verified_at),
    updated_at = timezone('utc', now());

  select id into v_id from public.instruments where symbol = v_symbol;
  return v_id;
end;
$$;

create or replace function public._cov_ensure_sector(
  p_firm uuid,
  p_slug text,
  p_name text,
  p_kind text,
  p_nav text,
  p_description text,
  p_benchmark text,
  p_parent_slug text,
  p_sort integer,
  p_screen text,
  p_review date,
  p_expires date,
  p_source text,
  p_system boolean default true
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_parent uuid;
begin
  if p_parent_slug is not null then
    select id into v_parent
    from public.sectors
    where firm_id = p_firm and slug = p_parent_slug
    limit 1;
  end if;

  insert into public.sectors (
    firm_id, slug, name, kind, nav_group, description, benchmark_symbol,
    parent_id, sort_order, screen_key, review_by, expires_at, source_url,
    is_system, last_reviewed_at
  )
  values (
    p_firm, p_slug, p_name, p_kind, p_nav, p_description, p_benchmark,
    v_parent, p_sort, p_screen, p_review, p_expires, p_source,
    p_system, timezone('utc', now())
  )
  on conflict (firm_id, slug) do update set
    name = excluded.name,
    kind = excluded.kind,
    nav_group = excluded.nav_group,
    description = excluded.description,
    benchmark_symbol = excluded.benchmark_symbol,
    parent_id = excluded.parent_id,
    sort_order = excluded.sort_order,
    screen_key = excluded.screen_key,
    review_by = excluded.review_by,
    expires_at = excluded.expires_at,
    source_url = excluded.source_url,
    is_system = excluded.is_system,
    last_reviewed_at = excluded.last_reviewed_at,
    updated_at = timezone('utc', now());

  select id into v_id from public.sectors where firm_id = p_firm and slug = p_slug;
  return v_id;
end;
$$;

create or replace function public._cov_add_member(
  p_sector uuid,
  p_symbol text,
  p_sort integer,
  p_role text default null,
  p_tier text default 'core',
  p_rationale text default null
) returns void
language plpgsql
as $$
declare
  v_instrument uuid;
begin
  v_instrument := public._cov_instrument(p_symbol, p_symbol, 'unknown', 'equity', null, 1, false, false, null, null, null, 'unverified');
  insert into public.sector_instruments (
    sector_id, instrument_id, sort_order, role, tier, rationale
  )
  values (p_sector, v_instrument, p_sort, p_role, p_tier, p_rationale)
  on conflict (sector_id, instrument_id) do update set
    sort_order = excluded.sort_order,
    role = coalesce(excluded.role, public.sector_instruments.role),
    tier = coalesce(excluded.tier, public.sector_instruments.tier),
    rationale = coalesce(excluded.rationale, public.sector_instruments.rationale);
end;
$$;

-- Known identity backfill. Name is only applied when the current name is the ticker.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('SKHY','SK hynix Inc. ADR','adr','equity','NASDAQ',1,false,false,null,'SK hynix','KR','resolved'),
      ('NCLD','Roundhill Neocloud ETF','etf','etf',null,1,false,false,null,'Roundhill',null,'resolved'),
      ('HUMN','Roundhill Humanoid Robotics ETF','etf','etf',null,1,false,false,null,'Roundhill',null,'resolved'),
      ('DRAM','Roundhill Memory ETF','etf','etf',null,1,false,false,null,'Roundhill',null,'resolved'),
      ('RAM','Roundhill Daily 2x Long DRAM ETF','etf','etf',null,2,false,false,'DRAM','Roundhill',null,'resolved'),
      ('FPS','Forgent Power Solutions','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SEI','Solaris Energy Infrastructure','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('WYFI','WhiteFiber Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SWMR','Swarmer Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SOXL','Direxion Daily Semiconductor Bull 3X','etf','etf',null,3,false,false,'SOXX','Direxion',null,'resolved'),
      ('HIMZ','Defiance Daily Target 2X Long HIMS ETF','etf','etf',null,2,false,false,'HIMS','Defiance',null,'resolved'),
      ('DXY','U.S. Dollar Index','index','index',null,1,false,false,null,null,null,'resolved'),
      ('VXX','iPath Series B S&P 500 VIX Short-Term Futures ETN','etn','etf',null,1,false,false,'VIX',null,null,'resolved'),
      ('VIXY','ProShares VIX Short-Term Futures ETF','etf','etf',null,1,false,false,'VIX','ProShares',null,'resolved'),
      ('BESIY','BE Semiconductor Industries N.V. OTC','otc','equity',null,1,false,true,null,null,'NL','resolved'),
      ('LYSCF','Lynas Rare Earths Ltd. OTC','otc','equity',null,1,false,true,null,null,'AU','resolved'),
      ('SIVEF','Sivers Semiconductors OTC','otc','equity',null,1,false,true,null,null,'SE','resolved'),
      ('SBGSY','Schneider Electric SE OTC','otc','equity',null,1,false,true,null,null,'FR','resolved'),
      ('SNDK','Sandisk Corporation','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('JPM','JPMorgan Chase & Co.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('IBIT','iShares Bitcoin Trust','etf','etf','NASDAQ',1,false,false,null,'BlackRock',null,'resolved'),
      ('SMH','VanEck Semiconductor ETF','etf','etf',null,1,false,false,null,'VanEck',null,'resolved'),
      ('SOXX','iShares Semiconductor ETF','etf','etf',null,1,false,false,null,'BlackRock',null,'resolved'),
      ('CIBR','First Trust NASDAQ Cybersecurity ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('TAN','Invesco Solar ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('URA','Global X Uranium ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('URNM','Sprott Uranium Miners ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('COPX','Global X Copper Miners ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XME','SPDR S&P Metals & Mining ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('GDX','VanEck Gold Miners ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('ITA','iShares U.S. Aerospace & Defense ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XBI','SPDR S&P Biotech ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('BBH','VanEck Biotech ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('KRE','SPDR S&P Regional Banking ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('KWEB','KraneShares CSI China Internet ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('FXI','iShares China Large-Cap ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('HYG','iShares iBoxx $ High Yield Corporate Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('LQD','iShares iBoxx $ Investment Grade Corporate Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('DIA','SPDR Dow Jones Industrial Average ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('RSP','Invesco S&P 500 Equal Weight ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('SGOV','iShares 0-3 Month Treasury Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('SHY','iShares 1-3 Year Treasury Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('IEF','iShares 7-10 Year Treasury Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('TIP','iShares TIPS Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('JNK','SPDR Bloomberg High Yield Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('BKLN','Invesco Senior Loan ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('EMB','iShares J.P. Morgan USD Emerging Markets Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('QQQE','Direxion NASDAQ-100 Equal Weighted Index Shares','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('POWR','iShares U.S. Power Infrastructure ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('MARS','Roundhill Mars Exploration ETF','etf','etf',null,1,false,false,null,'Roundhill',null,'resolved'),
      ('OZEM','Roundhill GLP-1 & Weight Loss ETF','etf','etf',null,1,false,false,null,'Roundhill',null,'resolved'),
      ('CRWV','CoreWeave Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('NBIS','Nebius Group','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('IREN','IREN Limited','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('APLD','Applied Digital','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('WULF','TeraWulf Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ARM','Arm Holdings','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('MRVL','Marvell Technology','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ANET','Arista Networks','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('CRDO','Credo Technology Group','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ALAB','Astera Labs','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('VRT','Vertiv Holdings','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('ETN','Eaton Corporation','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('MOD','Modine Manufacturing','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('MPWR','Monolithic Power Systems','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('VICR','Vicor Corporation','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('POWL','Powell Industries','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('GLW','Corning Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('AXTI','AXT Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('POET','POET Technologies','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('DELL','Dell Technologies','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('SMCI','Super Micro Computer','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SANM','Sanmina Corporation','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('TTMI','TTM Technologies','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('FIX','Comfort Systems USA','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('ENTG','Entegris Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ONTO','Onto Innovation','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('TER','Teradyne Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('KLIC','Kulicke and Soffa','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('AMKR','Amkor Technology','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ASX','ASE Technology Holding','adr','equity','NYSE',1,false,false,null,null,'TW','resolved'),
      ('CAMT','Camtek Ltd.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('COHU','Cohu Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ACLS','Axcelis Technologies','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ACMR','ACM Research','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('AEHR','Aehr Test Systems','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('MKSI','MKS Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('TSEM','Tower Semiconductor','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('WDC','Western Digital','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('STX','Seagate Technology','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SIMO','Silicon Motion Technology','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('PANW','Palo Alto Networks','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('FTNT','Fortinet Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('OKTA','Okta Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('RBRK','Rubrik Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('UNH','UnitedHealth Group','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('ELV','Elevance Health','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('HUM','Humana Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('CI','The Cigna Group','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('CNC','Centene Corporation','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('MOH','Molina Healthcare','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('CVS','CVS Health','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('OSCR','Oscar Health','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('ALHC','Alignment Healthcare','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('LLY','Eli Lilly and Company','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('NVO','Novo Nordisk A/S ADR','adr','equity','NYSE',1,false,false,null,null,'DK','resolved'),
      ('HIMS','Hims & Hers Health','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('HALO','Halozyme Therapeutics','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ISRG','Intuitive Surgical','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('FCX','Freeport-McMoRan','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('SCCO','Southern Copper','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('RKLB','Rocket Lab','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ASTS','AST SpaceMobile','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('LUNR','Intuitive Machines','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('AVAV','AeroVironment','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('KTOS','Kratos Defense & Security','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('DRS','Leonardo DRS','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('LHX','L3Harris Technologies','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('COIN','Coinbase Global','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('HOOD','Robinhood Markets','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('MSTR','Strategy Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('RIOT','Riot Platforms','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('HIVE','HIVE Digital Technologies','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('BABA','Alibaba Group Holding ADR','adr','equity','NYSE',1,false,false,null,null,'CN','resolved'),
      ('IONQ','IonQ Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('RGTI','Rigetti Computing','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('QBTS','D-Wave Quantum','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('QUBT','Quantum Computing Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('FSLR','First Solar','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ENPH','Enphase Energy','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SEDG','SolarEdge Technologies','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('V','Visa Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('MA','Mastercard Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('AXP','American Express','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('PYPL','PayPal Holdings','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('AFRM','Affirm Holdings','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('APO','Apollo Global Management','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('BX','Blackstone Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('KKR','KKR & Co.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('GS','Goldman Sachs Group','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('BLK','BlackRock Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('ROK','Rockwell Automation','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('CGNX','Cognex Corporation','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('SYM','Symbotic Inc.','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('CCJ','Cameco Corporation','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('LEU','Centrus Energy','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('BWXT','BWX Technologies','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('MP','MP Materials','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('ALB','Albemarle Corporation','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('GEV','GE Vernova','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('HUBB','Hubbell Inc.','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('NVT','nVent Electric','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('PWR','Quanta Services','common_stock','equity','NYSE',1,false,false,null,null,null,'resolved'),
      ('IBKR','Interactive Brokers Group','common_stock','equity','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('ETHA','iShares Ethereum Trust ETF','etf','etf','NASDAQ',1,false,false,null,null,null,'resolved'),
      ('XHB','SPDR S&P Homebuilders ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XRT','SPDR S&P Retail ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('JETS','U.S. Global Jets ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('PAVE','Global X U.S. Infrastructure Development ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('BOTZ','Global X Robotics & Artificial Intelligence ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('MJ','Amplify Alternative Harvest ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('SPY','SPDR S&P 500 ETF Trust','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('QQQ','Invesco QQQ Trust','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('IWM','iShares Russell 2000 ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('TLT','iShares 20+ Year Treasury Bond ETF','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('UUP','Invesco DB US Dollar Index Bullish Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('GLD','SPDR Gold Shares','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('USO','United States Oil Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLE','Energy Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLB','Materials Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLI','Industrial Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLY','Consumer Discretionary Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLP','Consumer Staples Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLV','Health Care Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLF','Financial Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLK','Technology Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLC','Communication Services Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLU','Utilities Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('XLRE','Real Estate Select Sector SPDR Fund','etf','etf',null,1,false,false,null,null,null,'resolved'),
      ('IBB','iShares Biotechnology ETF','etf','etf',null,1,false,false,null,null,null,'resolved')
    ) as t(symbol, name, security_type, asset_class, exchange, leverage, inverse, otc, underlying, issuer, country, status)
  loop
    perform public._cov_instrument(
      r.symbol, r.name, r.security_type, r.asset_class, r.exchange,
      r.leverage, r.inverse, r.otc, r.underlying, r.issuer, r.country, r.status
    );
  end loop;
end $$;

-- Quarantine unresolved symbols without deleting memberships.
insert into public.instrument_resolution_queue (instrument_id, symbol, status, reason)
select i.id, i.symbol, 'open', 'No authoritative match after catalog review. Do not guess a replacement.'
from public.instruments i
where i.symbol in ('BRUN','CBRS','MCRP','PELI','PTPA','QNT','INFQ','HQ','XNDU','RBNE','FNNY')
on conflict (instrument_id) do update
  set status = 'open',
      reason = excluded.reason,
      updated_at = timezone('utc', now());

update public.instruments
set resolution_status = 'quarantined',
    updated_at = timezone('utc', now())
where symbol in ('BRUN','CBRS','MCRP','PELI','PTPA','QNT','INFQ','HQ','XNDU','RBNE','FNNY');

-- Mark remaining ETFs that already have a non-ticker name.
update public.instruments
set security_type = 'etf',
    asset_class = 'etf',
    resolution_status = 'resolved',
    last_verified_at = timezone('utc', now())
where security_type = 'unknown'
  and asset_class = 'etf'
  and name is distinct from symbol;

do $$
declare
  firm uuid;
  sid uuid;
  tape uuid;
  owner uuid;
begin
  for firm in select id from public.firms loop
    select coalesce(
      (
        select w.created_by
        from public.watchlists w
        where w.firm_id = firm and w.created_by is not null
        order by w.is_default desc, w.created_at
        limit 1
      ),
      (
        select tm.user_id
        from public.team_memberships tm
        where tm.firm_id = firm and tm.is_active
        order by tm.created_at
        limit 1
      )
    ) into owner;

    -- Watchlists: preserve Core/Active* data by renaming and splitting.
    update public.watchlists
    set name = 'Market Tape',
        purpose = 'tape',
        nav_group = 'market_tape',
        is_default = true,
        description = 'Compact cross-asset landing tape: indexes, rates, credit, dollar, commodities, volatility, and bitcoin.',
        updated_at = timezone('utc', now())
    where firm_id = firm
      and visibility = 'shared'
      and archived_at is null
      and lower(name) in ('core', 'market tape');

    select id into tape
    from public.watchlists
    where firm_id = firm and visibility = 'shared' and archived_at is null and lower(name) = 'market tape'
    limit 1;

    if tape is not null then
      delete from public.watchlist_items where watchlist_id = tape;
      perform public._cov_instrument(sym, sym, 'etf', 'etf')
      from unnest(array['SPY','QQQ','IWM','DIA','RSP','TLT','HYG','UUP','GLD','USO','VIXY','IBIT']) as sym;
      insert into public.watchlist_items (watchlist_id, instrument_id, sort_order, role, tier)
      select tape, i.id, ord * 10, 'benchmark', 'core'
      from unnest(array['SPY','QQQ','IWM','DIA','RSP','TLT','HYG','UUP','GLD','USO','VIXY','IBIT']) with ordinality as t(sym, ord)
      join public.instruments i on i.symbol = t.sym;
    end if;

    insert into public.watchlists (
      firm_id, name, description, is_default, visibility, purpose, nav_group, created_by, sort_order
    )
    select firm,
      'Market Leaders',
      'Large liquid names with high index weight or direct relevance to the desk core themes.',
      false, 'shared', 'leaders', 'market_tape', owner, 20
    where not exists (
      select 1 from public.watchlists w
      where w.firm_id = firm and w.visibility = 'shared' and w.archived_at is null and lower(w.name) = 'market leaders'
    );

    select id into sid from public.watchlists
    where firm_id = firm and visibility = 'shared' and archived_at is null and lower(name) = 'market leaders';
    if sid is not null then
      delete from public.watchlist_items where watchlist_id = sid;
      perform public._cov_instrument(sym, sym)
      from unnest(array['NVDA','MSFT','AAPL','GOOGL','AMZN','META','AVGO','AMD','TSM','TSLA','ORCL','PLTR']) as sym;
      insert into public.watchlist_items (watchlist_id, instrument_id, sort_order, role, tier)
      select sid, i.id, ord * 10, 'leader', 'core'
      from unnest(array['NVDA','MSFT','AAPL','GOOGL','AMZN','META','AVGO','AMD','TSM','TSLA','ORCL','PLTR']) with ordinality as t(sym, ord)
      join public.instruments i on i.symbol = t.sym;
    end if;

    update public.watchlists
    set name = 'Research Queue',
        purpose = 'research',
        nav_group = 'tactical',
        description = 'High-beta research queue with user-set priority. Names should migrate into canonical themes rather than live here permanently.',
        sort_order = 40,
        updated_at = timezone('utc', now())
    where firm_id = firm and visibility = 'shared' and archived_at is null and lower(name) in ('active', 'research queue');

    update public.watchlists
    set name = 'AI Infrastructure Tactical',
        purpose = 'tactical',
        nav_group = 'ai_compute',
        description = 'Tactical AI supply-chain tape. Leveraged products are kept out of ordinary-equity ranking.',
        sort_order = 50,
        updated_at = timezone('utc', now())
    where firm_id = firm and visibility = 'shared' and archived_at is null and lower(name) in ('active 2', 'ai infrastructure tactical');

    -- Strip leveraged products from the AI tactical list.
    delete from public.watchlist_items wi
    using public.watchlists w, public.instruments i
    where wi.watchlist_id = w.id
      and wi.instrument_id = i.id
      and w.firm_id = firm
      and lower(w.name) = 'ai infrastructure tactical'
      and i.symbol in ('SOXL','RAM','HIMZ');

    update public.watchlists
    set name = 'Optical & Networking Tactical',
        purpose = 'tactical',
        nav_group = 'ai_compute',
        description = 'Optical components, interconnect, and networking systems.',
        sort_order = 60,
        updated_at = timezone('utc', now())
    where firm_id = firm and visibility = 'shared' and archived_at is null and lower(name) in ('active 3', 'optical & networking tactical');

    -- Move commodities/biotech/cyber off the optical list; they remain on other collections.
    delete from public.watchlist_items wi
    using public.watchlists w, public.instruments i
    where wi.watchlist_id = w.id
      and wi.instrument_id = i.id
      and w.firm_id = firm
      and lower(w.name) = 'optical & networking tactical'
      and i.symbol in ('FCX','SCCO','BBH','HALO','CRWD','PANW','FTNT','OKTA','RBRK','NET');

    insert into public.watchlists (
      firm_id, name, description, is_default, visibility, purpose, nav_group, created_by, sort_order
    )
    select firm,
      'Cybersecurity Tactical',
      'Liquid cybersecurity platforms split from the former Active 3 mixed tape.',
      false, 'shared', 'tactical', 'ai_compute', owner, 70
    where not exists (
      select 1 from public.watchlists w
      where w.firm_id = firm and w.visibility = 'shared' and w.archived_at is null and lower(w.name) = 'cybersecurity tactical'
    );

    select id into sid from public.watchlists
    where firm_id = firm and visibility = 'shared' and archived_at is null and lower(name) = 'cybersecurity tactical';
    if sid is not null then
      delete from public.watchlist_items where watchlist_id = sid;
      perform public._cov_instrument(sym, sym)
      from unnest(array['CIBR','CRWD','PANW','FTNT','ZS','OKTA','RBRK','NET','CHKP']) as sym;
      insert into public.watchlist_items (watchlist_id, instrument_id, sort_order, role, tier)
      select sid, i.id, ord * 10, null, 'core'
      from unnest(array['CIBR','CRWD','PANW','FTNT','ZS','OKTA','RBRK','NET','CHKP']) with ordinality as t(sym, ord)
      join public.instruments i on i.symbol = t.sym;
    end if;

    -- Existing sectors: reclassify in place.
    update public.sectors set
      name = 'Solar, Inverters & Storage',
      kind = 'theme',
      nav_group = 'energy_materials',
      benchmark_symbol = 'TAN',
      description = 'Solar manufacturers, inverters, trackers, residential installers, and grid-scale storage. Smaller names carry high-beta/liquidity risk.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 4100
    where firm_id = firm and slug = 'solar-battery-storage';

    update public.sectors set
      name = 'Legacy Cross-Asset Tape',
      kind = 'macro',
      nav_group = 'market_tape',
      archived_at = coalesce(archived_at, timezone('utc', now())),
      description = 'Archived mixed ETF dashboard. Official GICS, rates, credit, and volatility collections replace this flat tape. Memberships preserved.',
      last_reviewed_at = timezone('utc', now()),
      sort_order = 1990
    where firm_id = firm and slug = 'sectors';

    update public.sectors set
      kind = 'theme',
      nav_group = 'industrials_defense',
      benchmark_symbol = 'HUMN',
      description = 'Parent robotics theme. Drill into industrial automation, humanoids, and autonomous systems — medical and maritime names are not the same economic exposure.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 5100
    where firm_id = firm and slug = 'robotics';

    update public.sectors set
      name = 'Critical Minerals',
      kind = 'theme',
      nav_group = 'energy_materials',
      description = 'Rare earths, lithium, uranium/fuel cycle, copper, and specialty metals. FCX is copper exposure, not rare earths.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 4300
    where firm_id = firm and slug = 'rare-earth-materials';

    update public.sectors set
      kind = 'theme',
      nav_group = 'ai_compute',
      description = 'Credible quantum-compute and quantum-security names. Diversified enablers sit in a secondary tier; storage, battery, and biotech tickers are not quantum core.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3450
    where firm_id = firm and slug = 'quantum';

    update public.sector_instruments si
    set tier = 'secondary',
        role = 'speculative',
        rationale = 'Not a quantum-compute pure play; retained for history, excluded from core ranking.'
    from public.sectors s, public.instruments i
    where si.sector_id = s.id and si.instrument_id = i.id
      and s.firm_id = firm and s.slug = 'quantum'
      and i.symbol in ('QMCO','QS','RXRX','QSI');

    update public.sectors set
      name = 'Nuclear Energy',
      kind = 'theme',
      nav_group = 'energy_materials',
      benchmark_symbol = 'URA',
      description = 'Parent nuclear theme spanning generation, SMRs, uranium miners, and fuel cycle. Utilities are not interchangeable with pre-revenue developers.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 4200
    where firm_id = firm and slug = 'nukes';

    update public.sectors set
      kind = 'screen',
      nav_group = 'tactical',
      screen_key = 'high_beta_oil',
      name = 'High-Beta Oil',
      description = 'Rule-generated high-beta oil tape from the energy universe. Not a stable sector classification.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 8120
    where firm_id = firm and slug = 'oil-high-beta';

    update public.sectors set
      kind = 'catalyst',
      nav_group = 'tactical',
      review_by = date '2026-11-15',
      expires_at = date '2027-02-15',
      benchmark_symbol = 'MJ',
      description = 'Niche cannabis catalyst theme. Illiquid microcaps should not carry equal visual weight to liquid leaders. Track regulatory dates.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 8300
    where firm_id = firm and slug = 'mary-jane';

    update public.sectors set
      name = 'Managed Care & Health Insurers',
      kind = 'industry',
      nav_group = 'health_consumer',
      description = 'Managed-care and health-insurance companies — not broad health care. Separate biotech, medtech, and GLP-1 themes cover the rest of the complex.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 6100
    where firm_id = firm and slug = 'healthcare';

    update public.sectors set
      kind = 'catalyst',
      nav_group = 'tactical',
      review_by = date '2026-10-01',
      expires_at = date '2026-12-31',
      source_url = 'https://www.nvidia.com/',
      description = 'Temporary financing-thesis basket around large NVIDIA-related capital needs. Plausible lenders are not confirmed counterparties without evidence.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 8200
    where firm_id = firm and slug = '500b-nvda-financiers';

    update public.sectors set
      name = 'AI Compute Financing Beneficiaries',
      kind = 'catalyst',
      nav_group = 'ai_compute',
      review_by = date '2026-10-01',
      expires_at = date '2026-12-31',
      benchmark_symbol = 'NCLD',
      description = 'Borrowers, infrastructure recipients, GPU suppliers, and ETF benchmarks tied to NVIDIA compute financing. NCLD is a neocloud reference ETF, not an operating company.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3480
    where firm_id = firm and slug = '500b-nvda-recipients';

    update public.sector_instruments si
    set role = case i.symbol
        when 'NCLD' then 'benchmark'
        when 'NVDA' then 'supplier'
        when 'SPCX' then 'speculative'
        else 'customer'
      end,
      tier = case i.symbol when 'SPCX' then 'high_beta' when 'NCLD' then 'core' else 'core' end,
      rationale = case i.symbol
        when 'NCLD' then 'Roundhill Neocloud ETF reference, not a recipient company.'
        when 'NVDA' then 'Supplier / thesis anchor.'
        when 'SPCX' then 'No documented financing role — retained pending review.'
        else si.rationale
      end
    from public.sectors s, public.instruments i
    where si.sector_id = s.id and si.instrument_id = i.id
      and s.firm_id = firm and s.slug = '500b-nvda-recipients';

    update public.sectors set
      kind = 'theme',
      nav_group = 'industrials_defense',
      description = 'Parent drone theme. Defense/counter-UAS and commercial drones are separate economic tapes.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 5300
    where firm_id = firm and slug = 'drone-companies';

    update public.sectors set
      kind = 'theme',
      nav_group = 'financial_digital',
      description = 'Parent payments theme. Networks, card issuers, and BNPL/fintechs have different credit and take-rate drivers.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 7100
    where firm_id = firm and slug = 'credit-cards-buy-now-pay-later';

    update public.sectors set
      kind = 'theme',
      nav_group = 'ai_compute',
      description = 'Parent AI supply-chain map. Use subgroup collections for attribution across memory, optics, networking, equipment, power, and construction.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3000
    where firm_id = firm and slug = 'bottleneck';

    update public.sectors set
      kind = 'industry',
      nav_group = 'ai_compute',
      benchmark_symbol = 'SMH',
      description = 'Semiconductor designers, foundries, and equipment. SMH is the liquid benchmark; analog/power and packaging names belong in subgroups.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3100
    where firm_id = firm and slug = 'semiconductors';

    update public.sectors set
      kind = 'theme',
      nav_group = 'ai_compute',
      description = 'Lasers, transceivers, fiber/materials, and optical networking systems. Networking silicon is tagged separately.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3300
    where firm_id = firm and slug = 'photonics';

    update public.sectors set
      kind = 'theme',
      nav_group = 'ai_compute',
      description = 'Cloud platforms driving AI training and inference capex. Keep this list concise; China/ADR cloud sits in a separate tier.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3400
    where firm_id = firm and slug = 'hyperscalers';

    update public.sectors set
      name = 'Digital Infrastructure REITs & Towers',
      kind = 'theme',
      nav_group = 'ai_compute',
      description = 'Data-center REITs and towers. Operators/neoclouds, servers, construction, and power/thermal are separate collections.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3410
    where firm_id = firm and slug = 'data-centers';

    update public.sectors set
      kind = 'theme',
      nav_group = 'energy_materials',
      description = 'Parent power theme. Split generation, grid equipment, gas/LNG, and nuclear sub-baskets for bottleneck attribution.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 4000
    where firm_id = firm and slug = 'power-grid-nuclear-gas';

    update public.sectors set
      kind = 'theme',
      nav_group = 'ai_compute',
      description = 'Enterprise AI platforms, data/observability, and automation. CrowdStrike belongs primarily in cybersecurity.',
      last_reviewed_at = timezone('utc', now()),
      is_system = true,
      sort_order = 3460
    where firm_id = firm and slug = 'ai-software';
  end loop;
end $$;
