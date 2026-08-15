import type { EvidenceBundle } from "@/lib/reports/quality-gate";
import {
  extractNumbersFromText,
  normalizeNumberToken,
} from "@/lib/reports/quality-gate";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";
import type { CausalSynthesis, EditorialPass, ExecutiveSummary } from "@/lib/ai/schemas";

function supported(token: string, evidence: EvidenceBundle): boolean {
  const set = new Set(evidence.numberTokens);
  const blob = [...evidence.numberTokens, ...(evidence.textBlobs ?? [])].join(" ");
  if (set.has(token) || blob.includes(token)) return true;
  const n = Number(token);
  if (!Number.isFinite(n)) return false;
  if (Number.isInteger(n) && Math.abs(n) < 10) return true;
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true;
  return normalizeNumberToken(n).some((candidate) => set.has(candidate) || blob.includes(candidate));
}

function textGrounded(text: string, evidence: EvidenceBundle): boolean {
  return extractNumbersFromText(text).every((token) => supported(token, evidence));
}

function validSources(ids: string[], document: ReportDocumentModel): string[] {
  const allowed = new Set(document.sources.map((source) => source.id));
  return ids.filter((id) => allowed.has(id));
}

export function applyModelDraft(
  document: ReportDocumentModel,
  input: {
    synthesis?: CausalSynthesis | null;
    executive?: ExecutiveSummary | null;
    editorial?: EditorialPass | null;
  },
  evidence: EvidenceBundle,
): { document: ReportDocumentModel; applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  let next: ReportDocumentModel = {
    ...document,
    sections: document.sections.map((section) => ({ ...section })),
    claims: [...document.claims],
    executiveBullets: [...document.executiveBullets],
  };

  if (input.synthesis) {
    const sourceIds = validSources(input.synthesis.sourceIds, next);
    const claimsOk = input.synthesis.claims.every(
      (claim) =>
        textGrounded(claim.text, evidence) &&
        validSources(claim.sourceIds, next).length === claim.sourceIds.length,
    );
    if (textGrounded(input.synthesis.summary, evidence) && claimsOk) {
      const target = next.sections.find((section) => section.sectionKey === "what_is_moving");
      if (target) {
        target.body = `Desk synthesis [${input.synthesis.causalStatus}] (cited):\n${input.synthesis.summary}\n\n${target.body}`;
        target.sourceIds = [
          ...new Set([...(target.sourceIds ?? []), ...sourceIds]),
        ];
      }
      for (const claim of input.synthesis.claims) {
        next.claims.push({
          id: claim.id,
          text: claim.text,
          material: claim.material,
          sourceIds: validSources(claim.sourceIds, next),
          tickers: claim.tickers,
        });
      }
      applied.push("causal_synthesis");
    } else {
      skipped.push("causal_synthesis");
    }
  }

  if (input.executive) {
    const bullets = input.executive.bullets.filter((bullet) =>
      textGrounded(bullet.text, evidence),
    );
    if (textGrounded(input.executive.headline, evidence) && bullets.length) {
      next = {
        ...next,
        title: next.title,
        executiveSummary: [input.executive.headline, ...bullets.map((bullet) => bullet.text)].join(
          " ",
        ),
        executiveBullets: bullets.map((bullet) => bullet.text),
      };
      applied.push("section_drafting");
    } else {
      skipped.push("section_drafting");
    }
  }

  if (input.editorial) {
    if (input.editorial.flags.some((flag) => flag.severity === "blocking")) {
      skipped.push("editorial_pass");
    } else {
      let used = false;
      if (
        input.editorial.revisedHeadline &&
        textGrounded(input.editorial.revisedHeadline, evidence)
      ) {
        next = { ...next, executiveSummary: input.editorial.revisedHeadline };
        used = true;
      }
      for (const edit of input.editorial.sectionEdits) {
        if (!textGrounded(edit.revisedBody, evidence)) continue;
        const section = next.sections.find((row) => row.sectionKey === edit.sectionKey);
        if (!section) continue;
        section.body = edit.revisedBody;
        used = true;
      }
      if (used) applied.push("editorial_pass");
      else skipped.push("editorial_pass");
    }
  }

  return { document: next, applied, skipped };
}
