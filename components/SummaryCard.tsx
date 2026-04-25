"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { CivicEdge, CivicNode } from "@/data/civic-graph";

export type SummaryResponse = {
  title: string;
  summary: string;
  interests: string[];
  funding: string[];
  alignment: string[];
  uncertainties: string[];
  sources: string[];
  generatedBy: "openai" | "openai_search" | "fallback";
};

const sourceLabels: Record<string, string> = {
  representative: "Official profile",
  proposition: "Ballot digest",
  pac: "Campaign filings",
  corporation: "Donor filings",
  bill: "Vote records",
  issue: "Policy memos",
  committee: "Committee roster"
};

export function SummaryCard({
  node,
  connectedEdges,
  connectedNodes,
  summary,
  isLoading
}: {
  node: CivicNode;
  connectedEdges: CivicEdge[];
  connectedNodes: CivicNode[];
  summary: SummaryResponse | null;
  isLoading: boolean;
}) {
  return (
    <aside className="flex h-full min-h-[560px] flex-col rounded-lg border border-black/10 bg-white p-5 shadow-panel">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-civic-green">
          {node.type.replace("_", " ")}
        </div>
        <h2 className="mt-2 text-2xl font-semibold leading-tight text-ink">{node.label}</h2>
        <div className="mt-2 text-sm text-slate-600">
          {node.meta.role ? `${node.meta.role} - ${node.meta.district}` : node.meta.focus ?? node.meta.title ?? node.meta.summary}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">AI Summary</h3>
          {summary?.generatedBy === "fallback" ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              demo mode
            </span>
          ) : summary?.generatedBy === "openai_search" ? (
            <span className="rounded-full bg-[#edf6f1] px-2.5 py-1 text-[11px] font-medium text-civic-green">
              web search
            </span>
          ) : null}
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Summarizing evidence...
          </div>
        ) : summary ? (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-slate-700">{summary.summary}</p>
            <Section title="Detected interests" items={summary.interests} />
            <Section title="Funding signals" items={summary.funding} />
            <Section title="Alignment" items={summary.alignment} />
            <Section title="Uncertainties" items={summary.uncertainties} />
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-ink">Visible relationships</h3>
        <div className="mt-3 space-y-2">
          {connectedEdges.map((edge) => {
            const otherNodeId = edge.source === node.id ? edge.target : edge.source;
            const otherNode = connectedNodes.find((item) => item.id === otherNodeId);
            return (
              <div key={edge.id} className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                <span className="font-semibold">{otherNode?.label}</span>
                <span className="text-slate-500"> - {edge.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-ink">Evidence on this node</h3>
        <div className="mt-3 space-y-2">
          <MetaRows node={node} />
          {node.evidence.slice(0, 4).map((item) => (
            <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700" key={item}>
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-5">
        <h3 className="text-sm font-semibold text-ink">Sources</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {buildSources(node, summary).map((source) => (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
              key={source}
            >
              {source}
              <ExternalLink aria-hidden className="h-3 w-3" />
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function MetaRows({ node }: { node: CivicNode }) {
  const rows = [
    ["Source", node.meta.source],
    ["Committee ID", node.meta.committeeId],
    ["Candidate ID", node.meta.candidateId],
    ["Designation", node.meta.designation],
    ["Committee type", node.meta.committeeType],
    ["URL", node.meta.url || node.meta.website]
  ].filter(([, value]) => typeof value === "string" && value.trim());

  if (!rows.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
      {rows.map(([label, value]) => (
        <div className="flex gap-2" key={String(label)}>
          <span className="min-w-[82px] font-semibold text-slate-500">{label}:</span>
          <span className="break-all">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function buildSources(node: CivicNode, summary: SummaryResponse | null) {
  const sources = new Set<string>();
  sources.add(sourceLabels[node.type]);

  if (node.meta.source) {
    sources.add(String(node.meta.source));
  }
  if (node.meta.committeeId || node.meta.candidateId) {
    sources.add("FEC filings");
  }
  if (node.type === "pac") {
    sources.add("Committee records");
  }
  summary?.sources?.forEach((source) => sources.add(source));

  return Array.from(sources).filter(Boolean).slice(0, 8);
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li className="text-sm leading-5 text-slate-700" key={item}>
            - {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
