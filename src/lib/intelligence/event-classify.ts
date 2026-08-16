import type { EventType, SentimentState } from "./types";
import { EVENT_TYPE_LABELS } from "./types";

type Rule = {
  type: EventType;
  score: number;
  pattern: RegExp;
};

const RULES: Rule[] = [
  {
    type: "export_control",
    score: 98,
    pattern:
      /export[- ]control|entity list|\bbis\b|chip ban|semiconductor ban|export ban|foreign[- ]direct product/i,
  },
  { type: "tariff", score: 96, pattern: /\btariffs?\b|section 301|import duty/i },
  {
    type: "trade",
    score: 88,
    pattern: /trade war|trade policy|trade restriction|sanctions?\b|wto\b/i,
  },
  {
    type: "cyber",
    score: 94,
    pattern:
      /cyber(?:security|attack| incident)|ransomware|data breach|hacked|intrusion/i,
  },
  {
    type: "outage",
    score: 90,
    pattern: /\boutage\b|plant shutdown|service disruption|went dark|blackout/i,
  },
  {
    type: "investigation",
    score: 92,
    pattern: /\binvestigat(?:ion|es|ing)\b|subpoena|probe\b|inquiry into/i,
  },
  {
    type: "litigation",
    score: 90,
    pattern: /\blawsuit\b|\bsued\b|litigation|class action|court (?:rules|filing)/i,
  },
  {
    type: "regulatory",
    score: 86,
    pattern:
      /regulat(?:ory|or|ion)|antitrust|doj\b|ftc\b|sec (?:charges|settles)|consent decree/i,
  },
  {
    type: "ma",
    score: 93,
    pattern:
      /\bacquir(?:e|es|ed|ing)\b|\bmerger\b|take[- ]private|buyout|all[- ]stock deal|to buy\b/i,
  },
  {
    type: "offering",
    score: 91,
    pattern:
      /secondary offering|follow[- ]on offering|share offering|priced offering|atm offering/i,
  },
  {
    type: "financing",
    score: 84,
    pattern:
      /convertible notes?|raises? \$\d|debt offering|credit facility|term loan|capital raise/i,
  },
  { type: "buyback", score: 88, pattern: /buyback|share repurchase|repurchase program/i },
  { type: "dividend", score: 86, pattern: /\bdividend\b|special dividend|payout hike/i },
  {
    type: "management",
    score: 85,
    pattern:
      /ceo (?:steps down|resigns|appointed)|cfo (?:resigns|appointed)|management change|succession/i,
  },
  {
    type: "guidance",
    score: 89,
    pattern:
      /\bguidance\b|raises? (?:full[- ]year |fy )?outlook|cuts? (?:full[- ]year |fy )?outlook|forecast cut|outlook cut/i,
  },
  {
    type: "earnings",
    score: 87,
    pattern:
      /\bearnings\b|\beps\b|quarterly results|beats estimates|misses estimates|q[1-4] results/i,
  },
  {
    type: "filing",
    score: 92,
    pattern: /\b8-k\b|\b10-q\b|\b10-k\b|\b6-k\b|\bs-1\b|\bsc 13|\b13d\b|\b13g\b|form 4\b/i,
  },
  {
    type: "analyst",
    score: 80,
    pattern:
      /upgrad(?:e|es|ed)|downgrad(?:e|es|ed)|price target|initiates coverage|overweight|underweight/i,
  },
  {
    type: "contract",
    score: 86,
    pattern:
      /wins? (?:a )?contract|awarded (?:a )?contract|power purchase|ppa\b|government contract|dod award/i,
  },
  {
    type: "customer",
    score: 78,
    pattern: /customer win|design win|selected as|new customer|major customer/i,
  },
  {
    type: "partnership",
    score: 76,
    pattern: /\bpartnership\b|\balliance\b|joint venture|\bcollaborat/i,
  },
  {
    type: "product",
    score: 74,
    pattern:
      /unveil(?:s|ed)|launches? (?:new |its )?|announces? (?:new )?(?:chip|gpu|product|platform)|next[- ]gen/i,
  },
  {
    type: "supply_chain",
    score: 82,
    pattern: /supply chain|shortage|lead time|foundry|wafer allocation|capacity crunch/i,
  },
  {
    type: "commodity",
    score: 83,
    pattern:
      /\bwti\b|\bbrent\b|crude oil|natural gas|\blng\b|henry hub|gold prices?|copper prices?|uranium/i,
  },
  {
    type: "central_bank",
    score: 90,
    pattern: /\bfomc\b|\bfed\b(?:eral reserve)?|ecb\b|boj\b|rate decision|dot plot/i,
  },
  {
    type: "economic",
    score: 84,
    pattern:
      /\bcpi\b|\bppe\b|\bpce\b|payrolls|nonfarm|jobless|\bgdp\b|retail sales|\bism (?:manufacturing|services|index|report)\b|\bpmi\b|unemployment/i,
  },
  {
    type: "rates",
    score: 78,
    pattern: /treasury yield|bond yield|rate[- ]cut|rate hike|duration/i,
  },
  {
    type: "geopolitics",
    score: 80,
    pattern: /geopolit|missile|ceasefire|invasion|strait of hormuz|taiwan strait/i,
  },
  {
    type: "ir",
    score: 70,
    pattern: /investor (?:day|presentation)|shareholder letter|press release/i,
  },
  {
    type: "sector",
    score: 60,
    pattern:
      /semiconductor|photonic|hyperscaler|data[- ]centers?|ai infrastructure|grid equipment|robotics|\bnuclear\b|\bsmr\b|natural gas/i,
  },
];

const POSITIVE =
  /\bbeats?\b|raises? (?:outlook|guidance|forecast)|upgrade|awarded|wins? (?:a )?contract|buyback|dividend hike/i;
const NEGATIVE =
  /\bmisses?\b|cuts? (?:outlook|guidance|forecast)|downgrade|lawsuit|investigation|outage|breach|layoff|offering|dilut/i;

export type ClassifiedEvent = {
  eventType: EventType;
  eventTypeLabel: string;
  score: number;
  sentiment: SentimentState;
  sentimentNote: string | null;
};

function bestRule(text: string): Rule | null {
  let best: Rule | null = null;
  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    if (!best || rule.score > best.score) best = rule;
  }
  return best;
}

export function classifyHeadline(
  title: string,
  summary = "",
): ClassifiedEvent {
  const text = `${title}\n${summary}`;
  const titleBest = bestRule(title);
  const textBest = bestRule(text);
  // Macro keywords in the body must not override a company/feature title
  // that did not itself match (SpaceX recap + "ISM" in the related blurb).
  const best =
    titleBest ??
    (textBest && !MACRO_TYPES.has(textBest.type) ? textBest : null);
  const eventType = best?.type ?? "other";
  const pos = POSITIVE.test(text);
  const neg = NEGATIVE.test(text);
  let sentiment: SentimentState = "unscored";
  let sentimentNote: string | null = null;
  if (pos && neg) {
    sentiment = "mixed";
    sentimentNote = "Keyword tone mixed; not a model judgment of market impact.";
  } else if (pos) {
    sentiment = "positive";
    sentimentNote = "Keyword tone only (beat/raise/award). Not a price forecast.";
  } else if (neg) {
    sentiment = "negative";
    sentimentNote = "Keyword tone only (miss/cut/legal/dilution). Not a price forecast.";
  }

  return {
    eventType,
    eventTypeLabel: EVENT_TYPE_LABELS[eventType],
    score: best?.score ?? 20,
    sentiment,
    sentimentNote,
  };
}

export const COMPANY_SPECIFIC_TYPES = new Set<EventType>([
  "earnings",
  "guidance",
  "filing",
  "ir",
  "management",
  "ma",
  "financing",
  "offering",
  "buyback",
  "dividend",
  "analyst",
  "contract",
  "regulatory",
  "litigation",
  "investigation",
  "product",
  "customer",
  "partnership",
  "supply_chain",
  "outage",
  "cyber",
]);

export const MACRO_TYPES = new Set<EventType>([
  "commodity",
  "economic",
  "central_bank",
  "rates",
  "geopolitics",
  "trade",
  "tariff",
  "export_control",
  "sector",
]);
