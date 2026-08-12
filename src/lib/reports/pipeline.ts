import type {
  AiProvider,
  EmailProvider,
  MarketDataProvider,
  NewsProvider,
} from "@/lib/providers/interfaces";
import type { ReportEdition } from "@/lib/providers/types";
import { clusterNewsItems } from "@/lib/domain/news-cluster";
import { detectMaterialMovers } from "@/lib/domain/material-movers";
import { AiOrchestration } from "@/lib/ai/orchestration";
import {
  CausalSynthesisSchema,
  ExecutiveSummarySchema,
  HeadlineClassificationSchema,
  PriorEditionAuditSchema,
} from "@/lib/ai/schemas";
import { EDITORIAL_MANDATE, PROMPT_VERSIONS } from "@/lib/ai/prompt-versions";
import { demoMarketSnapshot } from "@/lib/fixtures/demo-market";
import { demoNewsItems } from "@/lib/fixtures/demo-news";
import { demoReportDocument } from "@/lib/fixtures/demo-report";
import {
  buildReportDocument,
  evidenceBundleFromMarket,
  extraNumbersFromDocument,
  type ReportDocumentModel,
} from "@/lib/reports/content-builder";
import { priorEditionsFor } from "@/lib/reports/editions";
import { reportPdfFilename } from "@/lib/reports/filenames";
import {
  MemoryReportJobStore,
  type ReportJobStore,
  type ReportRunRecord,
} from "@/lib/reports/job-store";
import { runQualityGate, type QualityGateResult } from "@/lib/reports/quality-gate";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/reports/stages";
import { renderReportPdf } from "@/lib/reports/pdf/render-pdf";
import { freezeReportMarketSnapshot } from "@/lib/market-data/report-snapshot";
import { defaultSurfacesForScope } from "@/lib/market-data/licensing";
import { getEnv } from "@/lib/env";
import type { LicenseScope } from "@/lib/market-data/schemas";
import {
  canPublish,
  isPublishGatedStage,
} from "@/lib/scheduling/chicago-schedule";

export type PipelineProviders = {
  marketData: MarketDataProvider;
  news: NewsProvider;
  email: EmailProvider;
  ai?: AiProvider;
};

export type PipelineRunInput = {
  firmId: string;
  edition: ReportEdition;
  tradingDate: string;
  idempotencyKey: string;
  /** When true, use demo fixtures instead of live provider calls. */
  useFixtures?: boolean;
  recipients?: Array<{ userId: string; email: string; name?: string }>;
  archiveUrlBase?: string;
  firmName?: string;
  publishAfter?: string;
  collectAfter?: string;
  scheduledAt?: string;
  sessionCloseAt?: string;
  calendarKind?: "regular" | "early_close" | "holiday_skip";
  scheduleVersion?: string;
  now?: Date;
};

export type PersistArchiveInput = {
  firmId: string;
  runId: string;
  edition: ReportEdition;
  tradingDate: string;
  document: ReportDocumentModel;
  pdfBytes?: Uint8Array;
  archivePath: string;
  status: "completed" | "partial";
};

export type PipelineResult = {
  run: ReportRunRecord;
  document?: ReportDocumentModel;
  quality?: QualityGateResult;
  pdfBytes?: Uint8Array;
  archivePath?: string;
  reportId?: string;
  delivery?: unknown;
};

export type ReportPipelineOptions = {
  store?: ReportJobStore;
  providers: PipelineProviders;
  orchestration?: AiOrchestration;
  /** Skip actual PDF render (tests that only need document stages). */
  skipPdf?: boolean;
  /** Skip email delivery. */
  skipEmail?: boolean;
  persistArchive?: (
    input: PersistArchiveInput,
  ) => Promise<{ reportId: string; archivePath?: string }>;
};

type StageContext = {
  run: ReportRunRecord;
  input: PipelineRunInput;
  artifacts: Record<string, unknown>;
};

function asPdfBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  return undefined;
}

/**
 * Resumable report pipeline. Idempotent per completed stage.
 */
export class ReportPipeline {
  private readonly store: ReportJobStore;
  private readonly providers: PipelineProviders;
  private readonly orchestration: AiOrchestration;
  private readonly skipPdf: boolean;
  private readonly skipEmail: boolean;
  private readonly persistArchive?: ReportPipelineOptions["persistArchive"];

  constructor(options: ReportPipelineOptions) {
    this.store = options.store ?? new MemoryReportJobStore();
    this.providers = options.providers;
    this.orchestration =
      options.orchestration ??
      new AiOrchestration({
        useMock: true,
        providers: options.providers.ai
          ? { mock: options.providers.ai }
          : undefined,
      });
    this.skipPdf = options.skipPdf ?? false;
    this.skipEmail = options.skipEmail ?? false;
    this.persistArchive = options.persistArchive;
  }

  async run(input: PipelineRunInput): Promise<PipelineResult> {
    let run = await this.store.createRun({
      firmId: input.firmId,
      edition: input.edition,
      tradingDate: input.tradingDate,
      idempotencyKey: input.idempotencyKey,
      scheduleVersion: input.scheduleVersion,
      scheduledAt: input.scheduledAt,
      collectAfter: input.collectAfter,
      publishAfter: input.publishAfter,
      sessionCloseAt: input.sessionCloseAt,
      calendarKind: input.calendarKind,
    });

    const artifacts: Record<string, unknown> = { ...run.artifacts };
    let document: ReportDocumentModel | undefined;
    let quality: QualityGateResult | undefined;
    let pdfBytes: Uint8Array | undefined;
    let archivePath: string | undefined;
    let reportId: string | undefined;
    let delivery: unknown;

    for (const stage of PIPELINE_STAGES) {
      const now = input.now ?? new Date();
      const publishAfter = input.publishAfter ?? run.publishAfter;
      if (isPublishGatedStage(stage) && !canPublish(now, publishAfter)) {
        return {
          run,
          document:
            document ??
            (artifacts.analyzing_and_drafting as { document?: ReportDocumentModel })
              ?.document,
          quality,
          pdfBytes,
          archivePath:
            archivePath ??
            (artifacts.archiving as { archivePath?: string } | undefined)
              ?.archivePath,
          reportId:
            reportId ??
            (artifacts.archiving as { reportId?: string } | undefined)?.reportId,
          delivery,
        };
      }

      const existing = run.stages.find((s) => s.stage === stage);
      if (existing?.status === "completed") {
        // Resume: restore artifact into working set
        if (existing.artifact !== undefined) {
          artifacts[stage] = existing.artifact;
        }
        continue;
      }

      const claim = await this.store.claimStage(run.id, stage);
      run = claim.run;
      if (!claim.claimed) {
        const completed = run.stages.find((s) => s.stage === stage);
        if (completed?.artifact !== undefined) {
          artifacts[stage] = completed.artifact;
        }
        continue;
      }

      try {
        const ctx: StageContext = { run, input, artifacts };
        const artifact = await this.executeStage(stage, ctx);
        artifacts[stage] = artifact;
        run = await this.store.completeStage(run.id, stage, artifact, {
          keys: artifact && typeof artifact === "object"
            ? Object.keys(artifact as object)
            : [],
        });

        if (stage === "analyzing_and_drafting") {
          document = (artifact as { document: ReportDocumentModel }).document;
        }
        if (stage === "validating_claims") {
          quality = (artifact as { quality: QualityGateResult }).quality;
          if (quality.severity === "blocking") {
            const blocking = quality.issues
              .filter((issue) => issue.severity === "blocking")
              .slice(0, 6)
              .map((issue) =>
                issue.path
                  ? `${issue.code} (${issue.path}): ${issue.message}`
                  : `${issue.code}: ${issue.message}`,
              );
            run = await this.store.setRunStatus(
              run.id,
              "failed",
              blocking.length > 0
                ? `Quality gate blocking issues: ${blocking.join(" | ")}`
                : "Quality gate blocking issues",
            );
            return {
              run,
              document,
              quality,
              pdfBytes,
              archivePath,
              reportId,
              delivery,
            };
          }
        }
        if (stage === "rendering_pdf") {
          pdfBytes = (artifact as { pdfBytes?: Uint8Array }).pdfBytes;
        }
        if (stage === "archiving") {
          archivePath = (artifact as { archivePath: string }).archivePath;
          reportId = (artifact as { reportId?: string }).reportId;
        }
        if (stage === "delivering_email") {
          delivery = (artifact as { delivery: unknown }).delivery;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        run = await this.store.failStage(run.id, stage, message);
        return {
          run,
          document,
          quality,
          pdfBytes,
          archivePath,
          reportId,
          delivery,
        };
      }
    }

    const finalQuality =
      quality ??
      (artifacts.validating_claims as { quality?: QualityGateResult } | undefined)
        ?.quality;
    const terminal =
      finalQuality && finalQuality.severity === "warning" ? "partial" : "completed";
    run = await this.store.setRunStatus(run.id, terminal);

    return {
      run,
      document:
        document ??
        (artifacts.analyzing_and_drafting as { document?: ReportDocumentModel })
          ?.document,
      quality: finalQuality,
      pdfBytes,
      archivePath:
        archivePath ??
        (artifacts.archiving as { archivePath?: string } | undefined)
          ?.archivePath,
      reportId:
        reportId ??
        (artifacts.archiving as { reportId?: string } | undefined)?.reportId,
      delivery,
    };
  }

  private async executeStage(
    stage: PipelineStage,
    ctx: StageContext,
  ): Promise<unknown> {
    switch (stage) {
      case "queued":
        return { accepted: true, at: new Date().toISOString() };
      case "collecting_sources":
        return this.collectSources(ctx);
      case "normalizing_market_data":
        return this.normalizeMarket(ctx);
      case "detecting_material_events":
        return this.detectEvents(ctx);
      case "analyzing_and_drafting":
        return this.analyzeAndDraft(ctx);
      case "validating_claims":
        return this.validateClaims(ctx);
      case "rendering_pdf":
        return this.renderPdf(ctx);
      case "archiving":
        return this.archive(ctx);
      case "delivering_email":
        return this.deliverEmail(ctx);
      default: {
        const _exhaustive: never = stage;
        throw new Error(`Unhandled stage: ${_exhaustive}`);
      }
    }
  }

  private async collectSources(ctx: StageContext) {
    const useFixtures = ctx.input.useFixtures ?? false;
    if (useFixtures) {
      const market = demoMarketSnapshot(
        ctx.input.edition,
        ctx.input.tradingDate,
      );
      const news = demoNewsItems(ctx.input.edition);
      return {
        mode: "fixtures" as const,
        quoteSymbols: market.quotes.map((q) => q.ticker),
        newsCount: news.length,
        market,
        news,
      };
    }

    const symbols = [
      "SPY",
      "QQQ",
      "IWM",
      "DIA",
      "TLT",
      "UUP",
      "GLD",
      "USO",
      "NVDA",
      "MSFT",
      "AAPL",
      "AMD",
      "META",
      "VIXY",
      "IBIT",
    ];
    const [quotes, movers, breadth, news] = await Promise.all([
      this.providers.marketData.getQuotes(symbols),
      this.providers.marketData.getTopMovers({
        universe: "configured",
        direction: "both",
        limit: 25,
      }),
      this.providers.marketData.getMarketBreadth({ universe: "US" }),
      this.providers.news.search({ limit: 40 }),
    ]);

    return {
      mode: "live" as const,
      quoteSymbols: quotes.map((q) => q.ticker),
      newsCount: news.length,
      market: {
        edition: ctx.input.edition,
        tradingDate: ctx.input.tradingDate,
        asOf: new Date().toISOString(),
        note: "Live provider snapshot",
        quotes,
        movers,
        breadth: breadth ?? {
          exchangeOrUniverse: "US",
          advancing: null,
          declining: null,
          providerName: "none",
          providerTimestamp: new Date().toISOString(),
          retrievalTimestamp: new Date().toISOString(),
          delayStatus: "unknown" as const,
          sourceQuality: "estimated" as const,
        },
        watchlistTickers: ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "TLT"],
      },
      news,
    };
  }

  private async normalizeMarket(ctx: StageContext) {
    const collected = ctx.artifacts.collecting_sources as {
      market: ReturnType<typeof demoMarketSnapshot>;
      news: ReturnType<typeof demoNewsItems>;
      mode?: "fixtures" | "live";
    };
    const clusters = clusterNewsItems(collected.news);

    const useFixtures = ctx.input.useFixtures ?? false;
    let marketFreeze = null;
    if (!useFixtures && collected.mode !== "fixtures") {
      const env = getEnv();
      const scope = env.MARKET_DATA_LICENSE_SCOPE as LicenseScope;
      marketFreeze = freezeReportMarketSnapshot({
        quotes: collected.market.quotes,
        movers: collected.market.movers,
        breadth: collected.market.breadth,
        asOf: collected.market.asOf,
        sourceMode: "live",
        licenseScope: scope,
        licenseScopeId: `market_data:${scope}`,
        permittedSurfaces: defaultSurfacesForScope(scope),
      });
    }

    return {
      quotes: collected.market.quotes.length,
      movers: collected.market.movers.length,
      clusters: clusters.length,
      market: collected.market,
      news: collected.news,
      marketFreeze,
      clustersDetail: clusters.map((c) => ({
        clusterId: c.clusterId,
        title: c.representative.title,
        size: c.items.length,
      })),
    };
  }

  private async detectEvents(ctx: StageContext) {
    const normalized = ctx.artifacts.normalizing_market_data as {
      market: ReturnType<typeof demoMarketSnapshot>;
      news: ReturnType<typeof demoNewsItems>;
    };
    const material = detectMaterialMovers(
      normalized.market.quotes.map((q) => ({
        ticker: q.ticker,
        price: q.last,
        priorClose: q.priorClose ?? null,
        changePercent: q.changePercent,
        changeAbsolute: q.changeAbsolute,
        volume: q.volume,
        averageVolume: q.volume,
        session: q.marketSession,
        asOf: normalized.market.asOf,
        marketCapCategory: "large" as const,
        isWatchlist: normalized.market.watchlistTickers.includes(q.ticker),
        monitorEtf: ["SPY", "QQQ", "IWM", "DIA", "TLT"].includes(q.ticker),
        isEtf: ["SPY", "QQQ", "IWM", "DIA", "TLT", "UUP", "GLD", "USO", "VIXY"].includes(
          q.ticker,
        ),
      })),
    );

    // Prefer provider movers when materiality filter is empty (demo thresholds)
    const movers =
      material.length > 0
        ? material.map((m) => ({
            ticker: m.ticker,
            last: m.price,
            changePercent: m.percentMove,
            changeAbsolute: m.absoluteMove,
            volume: m.volume,
            name: m.company,
            direction: (m.percentMove >= 0 ? "up" : "down") as "up" | "down",
            marketSession: m.session,
            instrumentId: `detected:${m.ticker}`,
            providerName: "pipeline",
            providerTimestamp: m.asOf,
            retrievalTimestamp: m.asOf,
            delayStatus: "delayed" as const,
            currency: "USD",
            sourceQuality: "mock" as const,
          }))
        : normalized.market.movers;

    return {
      materialCount: material.length,
      movers,
      market: { ...normalized.market, movers },
      news: normalized.news,
    };
  }

  private async analyzeAndDraft(ctx: StageContext) {
    const detected = ctx.artifacts.detecting_material_events as {
      market: ReturnType<typeof demoMarketSnapshot>;
      news: ReturnType<typeof demoNewsItems>;
      movers: ReturnType<typeof demoMarketSnapshot>["movers"];
    };

    const headlineFixture = {
      labels: ["ai", "equities"],
      confidence: 0.8,
      tickers: detected.news[0]?.tickers ?? ["SPY"],
    };

    await this.orchestration.generateStructured({
      task: "headline_classification",
      userPrompt: `Classify themes for ${ctx.input.edition} ${ctx.input.tradingDate}`,
      schema: HeadlineClassificationSchema,
      promptVersion: PROMPT_VERSIONS.headline_classification,
      fixture: headlineFixture,
    });

    await this.orchestration.generateStructured({
      task: "causal_synthesis",
      systemPrompt: EDITORIAL_MANDATE,
      userPrompt: JSON.stringify({
        movers: detected.movers,
        news: detected.news.slice(0, 5),
      }),
      schema: CausalSynthesisSchema,
      promptVersion: PROMPT_VERSIONS.causal_synthesis,
      fixture: {
        causalStatus: "reported",
        summary:
          detected.news[0]?.title ??
          "DEMO: Tape firmer with AI-linked leadership.",
        sourceIds: detected.news[0] ? [detected.news[0].id] : [],
        claims: [],
        unresolvedQuestions: [],
      },
    });

    const priorDocuments: ReportDocumentModel[] = [];
    for (const priorEdition of priorEditionsFor(ctx.input.edition)) {
      let prior: unknown =
        (await this.store.getPriorDocument?.(
          ctx.input.firmId,
          ctx.input.tradingDate,
          priorEdition,
        )) ?? null;
      if (!prior && ctx.input.useFixtures) {
        prior = demoReportDocument(priorEdition, ctx.input.tradingDate);
      }
      if (prior && typeof prior === "object" && prior !== null && "theses" in prior) {
        priorDocuments.push(prior as ReportDocumentModel);
      }
    }

    await this.orchestration.generateStructured({
      task: "prior_edition_audit",
      systemPrompt: EDITORIAL_MANDATE,
      userPrompt: JSON.stringify({
        edition: ctx.input.edition,
        priorThesisIds: priorDocuments.flatMap((d) => d.theses.map((t) => t.id)),
      }),
      schema: PriorEditionAuditSchema,
      promptVersion: PROMPT_VERSIONS.prior_edition_audit,
      fixture: {
        notes: ["Deterministic thesis statuses applied; prior ids preserved."],
        preservedThesisIds: priorDocuments.flatMap((d) =>
          d.theses.map((t) => t.id),
        ),
      },
    });

    const ahNews =
      ctx.input.edition === "close_postmarket"
        ? detected.news.filter((n) => /after-hours|after hours|postmarket/i.test(n.title))
        : [];
    const ahMovers =
      ctx.input.edition === "close_postmarket"
        ? detected.market.movers.filter((m) => m.marketSession === "afterhours")
        : [];

    const document = buildReportDocument({
      edition: ctx.input.edition,
      tradingDate: ctx.input.tradingDate,
      firmName: ctx.input.firmName ?? "IB Market Data",
      market: detected.market,
      news: detected.news,
      isDemo: ctx.input.useFixtures ?? false,
      priorDocuments,
      afterHoursNews: ahNews,
      afterHoursMovers: ahMovers,
      promptVersion: PROMPT_VERSIONS.section_drafting,
      scheduledAt: ctx.input.scheduledAt,
      calendarKind: ctx.input.calendarKind,
    });

    await this.orchestration.generateStructured({
      task: "section_drafting",
      userPrompt: "Draft executive summary bullets from evidence.",
      schema: ExecutiveSummarySchema,
      promptVersion: PROMPT_VERSIONS.section_drafting,
      fixture: {
        headline: document.title,
        bullets: document.executiveBullets.map((text) => ({
          text,
          sourceIds: document.claims[0]?.sourceIds ?? [],
          material: true,
        })),
        labels: document.labels,
      },
    });

    return { document, priorThesisIds: priorDocuments.flatMap((d) => d.theses.map((t) => t.id)) };
  }

  private async validateClaims(ctx: StageContext) {
    const drafted = ctx.artifacts.analyzing_and_drafting as {
      document: ReportDocumentModel;
      priorThesisIds?: string[];
    };
    const detected = ctx.artifacts.detecting_material_events as {
      market: ReturnType<typeof demoMarketSnapshot>;
      news: ReturnType<typeof demoNewsItems>;
    };
    const normalized = ctx.artifacts.normalizing_market_data as {
      marketFreeze?: ReturnType<typeof freezeReportMarketSnapshot> | null;
    };

    const evidence = evidenceBundleFromMarket(detected.market, detected.news, {
      extraNumbers: extraNumbersFromDocument(drafted.document),
    });
    const freeze = normalized?.marketFreeze ?? null;
    const env = getEnv();
    const useFixtures = ctx.input.useFixtures ?? false;

    const quality = runQualityGate(
      {
        title: drafted.document.title,
        edition: drafted.document.edition,
        tradingDate: drafted.document.tradingDate,
        executiveSummary: drafted.document.executiveSummary,
        sections: drafted.document.sections,
        movers: drafted.document.movers.map((m) => ({
          ticker: m.ticker,
          price: m.price,
          changePercent: m.changePercent,
          catalystSummary: m.catalystSummary,
        })),
        claims: drafted.document.claims,
        sources: drafted.document.sources,
        labels: drafted.document.labels,
        theses: drafted.document.theses,
        afterHours: drafted.document.afterHours,
      },
      evidence,
      useFixtures || !freeze
        ? { priorThesisIds: drafted.priorThesisIds }
        : {
            priorThesisIds: drafted.priorThesisIds,
            marketData: {
              staleAfterSeconds: env.MARKET_DATA_STALE_AFTER_SECONDS,
              dataCutoff: freeze.provenance.dataCutoff,
              feedCoverage: freeze.provenance.feedCoverage,
              declaredLatencyLabel: freeze.provenance.latencyCoverageLabel,
              expectedLatencyLabel: freeze.provenance.latencyCoverageLabel,
              permittedSurfaces: freeze.provenance.permittedSurfaces,
              requestedSurfaces: [
                "pdf_inclusion",
                "ai_analysis_input",
                "in_app_reports",
                ...(!this.skipEmail &&
                freeze.provenance.permittedSurfaces.includes("email_attachment")
                  ? (["email_attachment"] as const)
                  : []),
              ],
            },
          },
    );

    return { quality, evidenceTokenCount: evidence.numberTokens.length };
  }

  private async renderPdf(ctx: StageContext) {
    const drafted = ctx.artifacts.analyzing_and_drafting as {
      document: ReportDocumentModel;
    };
    if (this.skipPdf) {
      return { skipped: true, pdfBytes: undefined };
    }
    const pdfBytes = await renderReportPdf(drafted.document);
    return { pdfBytes, byteLength: pdfBytes.byteLength };
  }

  private async archive(ctx: StageContext) {
    const pdf = ctx.artifacts.rendering_pdf as {
      pdfBytes?: unknown;
      skipped?: boolean;
    };
    const drafted = ctx.artifacts.analyzing_and_drafting as {
      document?: ReportDocumentModel;
    };
    const quality = (
      ctx.artifacts.validating_claims as { quality?: QualityGateResult } | undefined
    )?.quality;
    const archivePath = `reports/${ctx.input.tradingDate}/${ctx.input.edition}/${reportPdfFilename(ctx.input.tradingDate, ctx.input.edition)}`;
    const skippedPdf = Boolean(pdf.skipped);
    let pdfBytes = asPdfBytes(pdf.pdfBytes);

    if (this.persistArchive && !skippedPdf && !pdfBytes && drafted.document) {
      pdfBytes = await renderReportPdf(drafted.document);
    }

    let reportId: string | undefined;
    let storedPath = archivePath;
    if (this.persistArchive && drafted.document && (pdfBytes || skippedPdf)) {
      const persisted = await this.persistArchive({
        firmId: ctx.input.firmId,
        runId: ctx.run.id,
        edition: ctx.input.edition,
        tradingDate: ctx.input.tradingDate,
        document: drafted.document,
        pdfBytes,
        archivePath,
        status: quality?.severity === "warning" ? "partial" : "completed",
      });
      reportId = persisted.reportId;
      storedPath = persisted.archivePath ?? archivePath;
    }

    return {
      archivePath: storedPath,
      reportId,
      storedBytes: pdfBytes?.byteLength ?? 0,
      skippedPdf,
    };
  }

  private async deliverEmail(ctx: StageContext) {
    if (this.skipEmail) {
      return { skipped: true, delivery: null };
    }
    const drafted = ctx.artifacts.analyzing_and_drafting as {
      document: ReportDocumentModel;
    };
    const archived = ctx.artifacts.archiving as { archivePath: string };
    const pdf = ctx.artifacts.rendering_pdf as { pdfBytes?: Uint8Array };
    const recipients = ctx.input.recipients ?? [
      {
        userId: "demo-user",
        email: "demo@example.com",
        name: "Demo User",
      },
    ];
    const archiveUrl = `${ctx.input.archiveUrlBase ?? "http://localhost:3000/archive"}/${ctx.run.id}`;

    const delivery = await this.providers.email.sendReport({
      reportId: ctx.run.id,
      edition: ctx.input.edition,
      tradingDate: ctx.input.tradingDate,
      subject: `IB Market Data — ${drafted.document.title}`,
      headlineSummary: drafted.document.executiveSummary,
      recipients,
      archiveUrl,
      pdfPath: archived.archivePath,
      pdfBytesBase64: pdf.pdfBytes
        ? Buffer.from(pdf.pdfBytes).toString("base64")
        : undefined,
      status: "completed",
      dataCutoff: drafted.document.dataCutoff,
    });

    return { delivery };
  }
}
