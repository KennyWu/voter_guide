"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileSearch, MapPin, Search, SlidersHorizontal } from "lucide-react";
import { CivicGraph } from "@/components/CivicGraph";
import { SummaryCard, SummaryResponse } from "@/components/SummaryCard";
import { CivicGraph as CivicGraphData, filterGraphByYears } from "@/data/civic-graph";
import type { ProviderStatus, ResearchResponse } from "@/lib/civic-research";

const demoAddresses = [
  "123 Market St",
  "District 3",
  "Springfield",
  "94103"
];

export default function Home() {
  const [address, setAddress] = useState("123 Market St");
  const [query, setQuery] = useState("");
  const [submittedAddress, setSubmittedAddress] = useState("123 Market St");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [range, setRange] = useState<2 | 4>(4);
  const [selectedNodeId, setSelectedNodeId] = useState("rep_jane_doe");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [graph, setGraph] = useState<CivicGraphData>(() => filterGraphByYears(4));
  const [districtSummary, setDistrictSummary] = useState(
    "123 Market St is using the demo graph until API keys are configured."
  );
  const [providerStatus, setProviderStatus] = useState<ProviderStatus[]>([]);
  const [mode, setMode] = useState<"live" | "mock">("mock");

  const selectedEvidence = useMemo(
    () => getEvidenceFromGraph(graph, selectedNodeId) ?? getEvidenceFromGraph(graph, graph.nodes[0]?.id),
    [selectedNodeId, graph]
  );

  useEffect(() => {
    void runResearch(submittedAddress, submittedQuery, range);
  }, [range, submittedAddress, submittedQuery]);

  useEffect(() => {
    if (!selectedEvidence) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        range,
        priorities: submittedQuery
          ? `User search: ${submittedQuery}. Also consider housing affordability, public safety, and campaign finance transparency.`
          : "Housing affordability, public safety, campaign finance transparency",
        ...selectedEvidence
      })
    })
      .then((response) => response.json())
      .then((data: SummaryResponse) => {
        if (!cancelled) {
          setSummary(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEvidence, range]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedAddress(address.trim() || "District 3");
    setSubmittedQuery(query.trim());
    setSelectedNodeId("rep_jane_doe");
  }

  async function runResearch(nextAddress: string, nextQuery: string, nextRange: 2 | 4) {
    setIsResearching(true);
    setResearchError(null);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: nextAddress, query: nextQuery, range: nextRange })
      });

      if (!response.ok) {
        throw new Error("Research lookup failed.");
      }

      const data = (await response.json()) as ResearchResponse;
      setGraph(data.graph);
      setDistrictSummary(data.districtSummary);
      setProviderStatus(data.providerStatus);
      setMode(data.mode);

      const queryNode = data.query
        ? data.graph.nodes.find((node) => node.label.toLowerCase() === data.query.toLowerCase())
        : null;

      if (queryNode) {
        setSelectedNodeId(queryNode.id);
      } else if (!data.graph.nodes.some((node) => node.id === selectedNodeId)) {
        setSelectedNodeId(data.graph.nodes[0]?.id ?? "rep_jane_doe");
      }
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Research lookup failed.");
      const fallbackGraph = filterGraphByYears(nextRange);
      setGraph(fallbackGraph);
      setMode("mock");
      setDistrictSummary(`${nextAddress} is using the demo graph because live research could not be loaded.`);
      setSelectedNodeId(fallbackGraph.nodes[0]?.id ?? "rep_jane_doe");
    } finally {
      setIsResearching(false);
    }
  }

  if (!selectedEvidence) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef]">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
              Civic Influence Graph
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Trace relationships between representatives, PACs, donors, ballot measures, votes, and issue areas.
            </p>
          </div>

          <form className="grid w-full gap-3 lg:max-w-3xl" onSubmit={handleSearch}>
            <label className="relative flex-1">
              <span className="sr-only">City or address</span>
              <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-civic-blue focus:ring-4 focus:ring-civic-blue/15"
                list="demo-addresses"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Enter city or address"
                value={address}
              />
              <datalist id="demo-addresses">
                {demoAddresses.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Search bills propositions representatives or money</span>
                <FileSearch aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-civic-blue focus:ring-4 focus:ring-civic-blue/15"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search bills, props, representatives, PACs, donors, issues"
                  value={query}
                />
              </label>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-civic-navy px-4 text-sm font-semibold text-white transition hover:bg-ink" type="submit">
                <Search aria-hidden className="h-4 w-4" />
                Research
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-5 px-5 py-5 xl:grid-cols-[1fr_390px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                Civic research lookup
                <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                  mode === "live" ? "bg-[#edf6f1] text-civic-green" : "bg-slate-100 text-slate-600"
                }`}>
                  {mode}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {isResearching ? "Researching location and configured providers..." : districtSummary}
              </div>
              {submittedQuery ? (
                <div className="mt-1 text-sm text-slate-600">
                  Search expanded graph for: <span className="font-medium text-ink">{submittedQuery}</span>
                </div>
              ) : null}
              {researchError ? <div className="mt-1 text-sm text-civic-red">{researchError}</div> : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <SlidersHorizontal aria-hidden className="h-4 w-4" />
                Time range
              </div>
              <div className="grid grid-cols-2 rounded-lg border border-slate-300 bg-slate-50 p-1">
                {[2, 4].map((value) => (
                  <button
                    className={`h-9 rounded-md px-3 text-sm font-semibold transition ${
                      range === value ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"
                    }`}
                    key={value}
                    onClick={() => setRange(value as 2 | 4)}
                    type="button"
                  >
                    {value} years
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-2 md:grid-cols-3">
            {providerStatus.map((status) => (
              <div className="rounded-lg border border-black/10 bg-white p-3 text-sm shadow-sm" key={status.provider}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{status.provider}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                    status.status === "ok"
                      ? "bg-[#edf6f1] text-civic-green"
                      : status.status === "error"
                        ? "bg-[#faeeee] text-civic-red"
                        : "bg-slate-100 text-slate-600"
                  }`}>
                    {status.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-600">{status.detail}</div>
              </div>
            ))}
          </div>

          <CivicGraph
            edges={graph.edges}
            nodes={graph.nodes}
            onSelectNode={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />
        </div>

        <SummaryCard
          connectedEdges={selectedEvidence.connectedEdges}
          connectedNodes={selectedEvidence.connectedNodes}
          isLoading={isLoading}
          node={selectedEvidence.node}
          summary={summary}
        />
      </section>
    </main>
  );
}

function getEvidenceFromGraph(graph: CivicGraphData, nodeId?: string | null) {
  if (!nodeId) {
    return null;
  }

  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return null;
  }

  const connectedEdges = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const connectedIds = new Set(
    connectedEdges.flatMap((edge) => [edge.source, edge.target]).filter((id) => id !== node.id)
  );
  const connectedNodes = graph.nodes.filter((item) => connectedIds.has(item.id));

  return {
    node,
    connectedEdges,
    connectedNodes
  };
}
