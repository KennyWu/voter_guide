import { NextResponse } from "next/server";
import OpenAI from "openai";
import { CivicEdge, CivicNode } from "@/data/civic-graph";

type RequestBody = {
  node: CivicNode;
  connectedEdges: CivicEdge[];
  connectedNodes: CivicNode[];
  priorities?: string;
  range: 2 | 4;
};

type SummaryPayload = {
  title: string;
  summary: string;
  interests: string[];
  funding: string[];
  alignment: string[];
  uncertainties: string[];
  sources: string[];
  generatedBy: "openai" | "openai_search" | "fallback";
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;

  if (!body.node) {
    return NextResponse.json({ error: "Missing node evidence." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(buildFallbackSummary(body));
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      instructions:
        "You are a neutral civic research assistant building voter-guide summary cards. First inspect the structured graph evidence. Then use web search only to find public, source-backed context for tracing money, offices, votes, bills, committees, donors, PACs, or ballot measures. Separate evidence from uncertainty. Do not call anyone corrupt, bought, biased, or controlled. Do not infer motives. Return only valid JSON.",
      tools: [
        {
          type: "web_search_preview",
          search_context_size: "medium"
        }
      ],
      tool_choice: "auto",
      input: `Summarize the selected civic graph node.

Return JSON with keys: title, summary, interests, funding, alignment, uncertainties, sources.
Each list should have 2-4 concise strings.

Research and analysis steps:
1. Identify what the structured graph already proves about the selected node.
2. If useful, search public sources to understand where a voter should follow the money or verify related records.
3. Compare the search context against the structured evidence.
4. Create the card fields only from supported evidence and cautious context.

Rules:
- Use structured evidence as the primary source of truth.
- Use web search only to add cautious context about how to trace money or verify public records for this node.
- Prefer official and high-quality public sources such as fec.gov, congress.gov, openstates.org, city or county official sites, govinfo.gov, ballotpedia.org, and opensecrets.org.
- If search results do not directly support a claim, put it in uncertainties instead of alignment or funding.
- Include source names or URLs in sources when available.
- Do not create graph edges, accusations, or motive claims.
- If money trails are incomplete, explain exactly which records would be needed next, such as FEC receipts, independent expenditures, state campaign finance reports, city ethics filings, or ballot committee reports.

Default time range: last ${body.range} years.
User priorities: ${body.priorities ?? "Not provided"}

Structured evidence:
${JSON.stringify(
  {
    nodeData: body.node,
    connectedEdges: body.connectedEdges,
    connectedNodes: body.connectedNodes
  },
  null,
  2
)}`
    });

    const parsed = JSON.parse(response.output_text || "{}") as Omit<SummaryPayload, "generatedBy">;

    return NextResponse.json({
      ...normalizeSummary(parsed, body),
      generatedBy: response.output.some((item) => item.type === "web_search_call") ? "openai_search" : "openai"
    });
  } catch {
    return NextResponse.json(buildFallbackSummary(body));
  }
}

function buildFallbackSummary(body: RequestBody): SummaryPayload {
  const { node, connectedEdges, connectedNodes, range } = body;
  const relationships = connectedEdges.map((edge) => {
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = connectedNodes.find((item) => item.id === otherId);
    return `${other?.label ?? "Connected node"}: ${edge.label}`;
  });

  const funding = relationships.filter((item) =>
    ["funded", "donated", "supports", "opposes"].some((keyword) => item.toLowerCase().includes(keyword))
  );
  const evidenceText = [...node.evidence, ...connectedEdges.map((edge) => edge.evidence)].join(" ");
  const housingSignal = /housing|zoning|development|transit/i.test(evidenceText);
  const safetySignal = /safety|police|public safety/i.test(evidenceText);
  const businessSignal = /business|permit|construction|developer|real estate/i.test(evidenceText);

  return {
    title: node.label,
    summary: `${node.label} is shown in this demo as a ${node.type.replace("_", " ")} connected to ${connectedNodes.length} visible node${connectedNodes.length === 1 ? "" : "s"} over the last ${range} years. The evidence points to civic activity around ${housingSignal ? "housing, zoning, and development" : "the listed policy area"} without making claims beyond the mock filings and vote records.`,
    interests: [
      housingSignal ? "Housing development and land-use rules" : "Policy area reflected by connected records",
      safetySignal ? "Public safety spending appears in the evidence" : "Campaign and governance relationships",
      businessSignal ? "Business growth or construction-sector activity" : "Local voter-facing accountability"
    ],
    funding: funding.length ? funding.slice(0, 4) : ["No direct funding relationship is shown for this node."],
    alignment: relationships.length
      ? relationships.slice(0, 4)
      : ["No visible alignment can be inferred without connected records."],
    uncertainties: [
      "This is demo data, not a complete campaign finance or voting record.",
      "Relationship labels do not prove motive or coordination.",
      "Missing source records could change the interpretation."
    ],
    sources: ["Mock votes", "Mock bills", "Mock donor filings", "Mock official profile"],
    generatedBy: "fallback"
  };
}

function normalizeSummary(parsed: Partial<SummaryPayload>, body: RequestBody): Omit<SummaryPayload, "generatedBy"> {
  const fallback = buildFallbackSummary(body);

  return {
    title: toText(parsed.title, fallback.title),
    summary: toText(parsed.summary, fallback.summary),
    interests: toTextList(parsed.interests, fallback.interests),
    funding: toTextList(parsed.funding, fallback.funding),
    alignment: toTextList(parsed.alignment, fallback.alignment),
    uncertainties: toTextList(parsed.uncertainties, fallback.uncertainties),
    sources: toTextList(parsed.sources, fallback.sources)
  };
}

function toText(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const joined = value.filter((item) => typeof item === "string" && item.trim()).join(" ");
    return joined || fallback;
  }

  return fallback;
}

function toTextList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => toText(item, ""))
    .filter(Boolean)
    .slice(0, 5);

  return items.length ? items : fallback;
}
