/**
 * Prints classifications at chosen thresholds, so verify.mjs can pin the number
 * the strong/weak split turns on.
 *
 * DIRECT_OVERLAP_THRESHOLD decides whether a row ships as evidence-backed or goes
 * to a reviewer. Nothing else in the suite would notice it moving: every fixture
 * row sits well clear of the boundary, so the whole questionnaire classifies
 * identically anywhere between roughly 0.30 and 0.39. A later "tidy-up" nudging
 * it to 0.45 would silently downgrade rows and every check would stay green.
 *
 * Emits JSON on stdout. verify.mjs runs under plain node and cannot import the
 * TypeScript library directly, so it spawns this.
 */
import { classify, citationOverlap } from '../lib/grounding.ts';
import { loadFixtureResponses, parseClientChatResponse } from '../lib/chat.ts';

const CASES: Record<string, string> = {
  'SEC-08': 'Describe your at-rest encryption, including key length.',
  'ACC-03': 'Describe your self-service credential reset flow.',
};

const fixtures = loadFixtureResponses();
const out: Record<
  string,
  { bestOverlap: number; at025: string; at034: string; at045: string }
> = {};

for (const [id, question] of Object.entries(CASES)) {
  const { answer, citations } = parseClientChatResponse(fixtures[id]);
  const confidenceAt = (threshold: number) =>
    classify(question, answer, citations, threshold).confidence;
  out[id] = {
    bestOverlap: Math.max(
      ...citations.map((citation) => citationOverlap(question, citation)),
    ),
    at025: confidenceAt(0.25),
    at034: confidenceAt(0.34),
    at045: confidenceAt(0.45),
  };
}

console.log(JSON.stringify(out));
