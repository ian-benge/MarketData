export type FixtureProposal = {
  id: string;
  type:
    "watchlist_add" | "watchlist_remove" | "sector_change" | "threshold_change";
  title: string;
  detail: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export const fixtureProposals: FixtureProposal[] = [
  {
    id: "prop-1",
    type: "watchlist_add",
    title: "Add SMCI to AI stack",
    detail:
      "Request to add Super Micro Computer for data-center hardware coverage.",
    status: "pending",
    submittedBy: "member@demo.local",
    submittedAt: "2026-08-09T15:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
  },
  {
    id: "prop-2",
    type: "threshold_change",
    title: "Raise equity mover threshold to 2.5%",
    detail: "Reduce noise on large-cap tape during high-vol sessions.",
    status: "approved",
    submittedBy: "member@demo.local",
    submittedAt: "2026-08-05T18:20:00.000Z",
    reviewedBy: "admin@demo.local",
    reviewedAt: "2026-08-06T12:10:00.000Z",
  },
];
