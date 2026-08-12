export type ClaimForCitationCheck = {
  id: string;
  text: string;
  material: boolean;
  sourceIds: string[];
};

export type SourceForCitationCheck = {
  id: string;
  url?: string;
};

export type CitationValidationIssue = {
  claimId: string;
  reason: "missing_sources" | "unknown_source_id" | "empty_source_ids";
  detail: string;
  invalidSourceIds?: string[];
};

export type CitationValidationResult = {
  ok: boolean;
  issues: CitationValidationIssue[];
};

/**
 * Every material claim must reference one or more sourceIds that exist
 * in the provided sources list.
 */
export function validateClaimsHaveCitations(
  claims: ClaimForCitationCheck[],
  sources: SourceForCitationCheck[],
): CitationValidationResult {
  const sourceIds = new Set(sources.map((s) => s.id));
  const issues: CitationValidationIssue[] = [];

  for (const claim of claims) {
    if (!claim.material) continue;

    if (!claim.sourceIds || claim.sourceIds.length === 0) {
      issues.push({
        claimId: claim.id,
        reason: "empty_source_ids",
        detail: `Material claim "${claim.id}" has no sourceIds`,
      });
      continue;
    }

    const unknown = claim.sourceIds.filter((id) => !sourceIds.has(id));
    if (unknown.length > 0) {
      issues.push({
        claimId: claim.id,
        reason: "unknown_source_id",
        detail: `Material claim "${claim.id}" references unknown sourceIds`,
        invalidSourceIds: unknown,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
