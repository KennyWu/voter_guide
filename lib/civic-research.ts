import { civicGraph, CivicEdge, CivicGraph, CivicNode } from "@/data/civic-graph";

export type ProviderStatus = {
  provider: string;
  configured: boolean;
  status: "ready" | "missing_key" | "ok" | "error" | "skipped";
  detail: string;
};

export type ResearchResponse = {
  address: string;
  query: string;
  range: 2 | 4;
  mode: "live" | "mock";
  districtSummary: string;
  graph: CivicGraph;
  providerStatus: ProviderStatus[];
};

type GoogleOffice = {
  name?: string;
  divisionId?: string;
  officialIndices?: number[];
};

type GoogleOfficial = {
  name?: string;
  party?: string;
  phones?: string[];
  urls?: string[];
  channels?: { type?: string; id?: string }[];
};

type GoogleCivicResponse = {
  normalizedInput?: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  offices?: GoogleOffice[];
  officials?: GoogleOfficial[];
  divisions?: Record<string, { name?: string }>;
};

type OpenStatesGeoPerson = {
  id?: string;
  name?: string;
  current_role?: {
    title?: string;
    org_classification?: string;
    district?: string;
    jurisdiction?: string;
  };
  party?: string;
  links?: { url?: string }[];
};

type OpenStatesGeoResponse = {
  results?: OpenStatesGeoPerson[];
};

type CiceroOfficial = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  party?: string;
  office?: {
    title?: string;
    district?: {
      label?: string;
      district_type?: string;
    };
    chamber?: {
      name?: string;
      type?: string;
    };
  };
  addresses?: {
    phone_1?: string;
    address_1?: string;
    city?: string;
    state?: string;
  }[];
  urls?: { url?: string }[];
};

type CiceroOfficialResponse = {
  response?: {
    errors?: unknown[];
    results?: {
      officials?: CiceroOfficial[];
    };
  };
};

type CensusGeocodeResponse = {
  result?: {
    addressMatches?: {
      coordinates?: {
        x?: number;
        y?: number;
      };
    }[];
  };
};

type CensusGeoLookupResponse = {
  result?: {
    geographies?: Record<
      string,
      {
        CENTLAT?: string;
        CENTLON?: string;
      }[]
    >;
  };
};

type FecCandidate = {
  candidate_id?: string;
  name?: string;
  office_full?: string;
  party_full?: string;
};

type FecCommittee = {
  committee_id?: string;
  name?: string;
  designation_full?: string;
  committee_type_full?: string;
};

type FecCandidateResponse = {
  results?: FecCandidate[];
};

type CongressBill = {
  number?: string;
  originChamber?: string;
  title?: string;
  type?: string;
  updateDate?: string;
  url?: string;
  latestAction?: {
    text?: string;
    actionDate?: string;
  };
};

type CongressBillResponse = {
  bills?: CongressBill[];
};

type QueryIntent = "location" | "representative" | "bill" | "proposition" | "money" | "general";

const currentYear = 2026;

export async function researchCivicGraph(address: string, range: 2 | 4, query = ""): Promise<ResearchResponse> {
  const statuses: ProviderStatus[] = [];
  const normalizedAddress = address.trim() || "District 3";
  const normalizedQuery = query.trim();
  const intent = classifyQuery(normalizedQuery);

  const google = {
    data: null,
    status: skipped(
      "Google Civic",
      "Skipped because Google's Representatives API was turned down in April 2025. Cicero is used for address-to-official lookup."
    )
  };
  statuses.push(google.status);

  const openStates = await getOpenStatesData(normalizedAddress);
  statuses.push(openStates.status);

  const cicero = await getCiceroData(normalizedAddress);
  statuses.push(cicero.status);

  const liveNodes: CivicNode[] = [];
  const liveEdges: CivicEdge[] = [];

  if (openStates.data) {
    const extracted = buildOpenStatesNodes(openStates.data);
    liveNodes.push(...extracted.nodes);
    liveEdges.push(...extracted.edges);
  }

  if (cicero.data) {
    const extracted = buildCiceroNodes(cicero.data);
    liveNodes.push(...extracted.nodes);
    liveEdges.push(...extracted.edges);
  }

  const representativeNodes = uniqueByLabel(liveNodes.filter((node) => node.type === "representative")).slice(0, 6);
  const fec = await getFecCandidateData(representativeNodes);
  statuses.push(fec.status);

  if (fec.nodes.length) {
    liveNodes.push(...fec.nodes);
    liveEdges.push(...fec.edges);
  }

  const queryResearch = await getQueryResearchData(normalizedQuery, intent, representativeNodes);
  statuses.push(queryResearch.status);

  if (queryResearch.nodes.length) {
    liveNodes.push(...queryResearch.nodes);
    liveEdges.push(...queryResearch.edges);
  }

  const hasLiveData = liveNodes.length > 0;
  const graph = hasLiveData
    ? { nodes: liveNodes, edges: liveEdges }
    : cloneGraph(civicGraph);

  return {
    address: normalizedAddress,
    query: normalizedQuery,
    range,
    mode: hasLiveData ? "live" : "mock",
    districtSummary: buildDistrictSummary(normalizedAddress, normalizedQuery, intent, openStates.data, cicero.data, queryResearch.nodes.length, hasLiveData),
    graph: filterGraph(graph, range),
    providerStatus: statuses
  };
}

async function getGoogleCivicData(address: string) {
  const key = process.env.GOOGLE_CIVIC_API_KEY;

  if (!key) {
    return {
      data: null,
      status: missing("Google Civic", "Set GOOGLE_CIVIC_API_KEY for address-to-representative lookup.")
    };
  }

  try {
    const url = new URL("https://www.googleapis.com/civicinfo/v2/representatives");
    url.searchParams.set("key", key);
    url.searchParams.set("address", address);
    url.searchParams.set("levels", "country");
    url.searchParams.append("levels", "administrativeArea1");
    url.searchParams.append("levels", "administrativeArea2");
    url.searchParams.append("levels", "locality");
    url.searchParams.append("roles", "legislatorUpperBody");
    url.searchParams.append("roles", "legislatorLowerBody");
    url.searchParams.append("roles", "headOfGovernment");

    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      throw new Error(`Google Civic returned ${response.status}`);
    }

    return {
      data: (await response.json()) as GoogleCivicResponse,
      status: ok("Google Civic", "Loaded representatives and political divisions for this address.")
    };
  } catch (error) {
    return {
      data: null,
      status: failed("Google Civic", error)
    };
  }
}

async function getOpenStatesData(address: string) {
  const key = process.env.OPENSTATES_API_KEY;

  if (!key) {
    return {
      data: null,
      status: missing("Open States", "Set OPENSTATES_API_KEY for state legislators, bills, votes, and committees.")
    };
  }

  try {
    const coordinates = await geocodeAddress(address);

    if (!coordinates) {
      throw new Error("Could not geocode address for Open States lat/lng lookup.");
    }

    const url = new URL("https://v3.openstates.org/people.geo");
    url.searchParams.set("lat", String(coordinates.lat));
    url.searchParams.set("lng", String(coordinates.lng));
    url.searchParams.set("apikey", key);

    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      throw new Error(`Open States returned ${response.status}`);
    }

    return {
      data: (await response.json()) as OpenStatesGeoResponse,
      status: ok("Open States", "Loaded state legislative people for this address.")
    };
  } catch (error) {
    return {
      data: null,
      status: failed("Open States", error)
    };
  }
}

async function getCiceroData(address: string) {
  const key = process.env.CICERO_API_KEY;

  if (!key) {
    return {
      data: null,
      status: missing("Cicero", "Set CICERO_API_KEY for local district and official lookup.")
    };
  }

  try {
    const coordinates = await geocodeAddress(address);

    if (!coordinates) {
      throw new Error("Could not geocode address for Cicero official lookup.");
    }

    const url = new URL("https://app.cicerodata.com/v3.1/official");
    url.searchParams.set("key", key);
    url.searchParams.set("lat", String(coordinates.lat));
    url.searchParams.set("lon", String(coordinates.lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("max", "12");

    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      throw new Error(`Cicero returned ${response.status}`);
    }

    const data = (await response.json()) as CiceroOfficialResponse;
    const errorCount = data.response?.errors?.length ?? 0;

    if (errorCount > 0) {
      throw new Error("Cicero returned an error for this address.");
    }

    return {
      data,
      status: ok("Cicero", "Loaded local, state, or federal officials for this address.")
    };
  } catch (error) {
    return {
      data: null,
      status: failed("Cicero", error)
    };
  }
}

async function geocodeAddress(address: string) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { next: { revalidate: 86400 } });

  if (!response.ok) {
    throw new Error(`Census geocoder returned ${response.status}`);
  }

  const data = (await response.json()) as CensusGeocodeResponse;
  const coordinates = data.result?.addressMatches?.[0]?.coordinates;

  if (typeof coordinates?.x !== "number" || typeof coordinates.y !== "number") {
    return (await geocodePlace(address)) ?? geocodeOpenStreetMap(address);
  }

  return {
    lng: coordinates.x,
    lat: coordinates.y
  };
}

async function geocodePlace(address: string) {
  const { city, state } = parsePlace(address);

  if (!city || !state) {
    return null;
  }

  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/address");
  url.searchParams.set("street", "1 Main St");
  url.searchParams.set("city", city);
  url.searchParams.set("state", state);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { next: { revalidate: 86400 } });

  if (!response.ok) {
    throw new Error(`Census place geocoder returned ${response.status}`);
  }

  const data = (await response.json()) as CensusGeoLookupResponse;
  const geographies = Object.values(data.result?.geographies ?? {}).flat();
  const match = geographies.find((item) => item.CENTLAT && item.CENTLON);

  if (!match?.CENTLAT || !match.CENTLON) {
    return null;
  }

  return {
    lat: Number(match.CENTLAT),
    lng: Number(match.CENTLON)
  };
}

async function geocodeOpenStreetMap(address: string) {
  const { city, state } = parsePlace(address);

  if (!city) {
    return null;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", [city, state || "CA", "USA"].filter(Boolean).join(", "));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "civic-influence-graph/0.1 local development"
    },
    next: { revalidate: 86400 }
  });

  if (!response.ok) {
    throw new Error(`OpenStreetMap geocoder returned ${response.status}`);
  }

  const data = (await response.json()) as { lat?: string; lon?: string }[];
  const match = data[0];

  if (!match?.lat || !match.lon) {
    return null;
  }

  return {
    lat: Number(match.lat),
    lng: Number(match.lon)
  };
}

async function getFecCandidateData(representatives: CivicNode[]) {
  const key = process.env.FEC_API_KEY;

  if (!key) {
    return {
      nodes: [],
      edges: [],
      status: missing("FEC", "Set FEC_API_KEY for federal candidate and committee finance lookup.")
    };
  }

  if (!representatives.length) {
    return {
      nodes: [],
      edges: [],
      status: skipped("FEC", "Skipped because no representative names were found yet.")
    };
  }

  try {
    const nodes: CivicNode[] = [];
    const edges: CivicEdge[] = [];

    await Promise.all(
      representatives.map(async (representative) => {
        const url = new URL("https://api.open.fec.gov/v1/candidates/search/");
        url.searchParams.set("api_key", key);
        url.searchParams.set("q", representative.label);
        url.searchParams.set("per_page", "3");
        url.searchParams.set("sort", "-cycles");

        const response = await fetch(url, { next: { revalidate: 86400 } });
        if (!response.ok) {
          throw new Error(`FEC returned ${response.status}`);
        }

        const data = (await response.json()) as FecCandidateResponse;
        data.results?.slice(0, 1).forEach((candidate) => {
          if (!candidate.candidate_id || !candidate.name) {
            return;
          }

          const candidateNodeId = `fec_candidate_${slug(candidate.candidate_id)}`;
          nodes.push({
            id: candidateNodeId,
            type: "committee",
            label: `${candidate.name} FEC Profile`,
            years: yearsForRange(4),
            meta: {
              source: "FEC",
              candidateId: candidate.candidate_id,
              office: candidate.office_full ?? "Federal candidate",
              party: candidate.party_full ?? "Unknown"
            },
            evidence: [
              `FEC candidate search matched ${candidate.name} (${candidate.candidate_id}).`,
              "Use this node as the entry point for federal receipts, disbursements, committees, and independent expenditures."
            ]
          });
          edges.push({
            id: `fec_match_${candidateNodeId}_${representative.id}`,
            source: candidateNodeId,
            target: representative.id,
            label: "FEC match",
            years: yearsForRange(4),
            evidence: `FEC candidate search matched the representative name ${representative.label}.`
          });
        });
      })
    );

    return {
      nodes,
      edges,
      status: ok("FEC", nodes.length ? "Matched representative names to FEC candidate records." : "No FEC candidate matches found.")
    };
  } catch (error) {
    return {
      nodes: [],
      edges: [],
      status: failed("FEC", error)
    };
  }
}

async function getQueryResearchData(query: string, intent: QueryIntent, representatives: CivicNode[]) {
  if (!query) {
    return {
      nodes: [],
      edges: [],
      status: skipped("Query Research", "Enter a bill, proposition, representative, PAC, donor, or issue to expand the graph.")
    };
  }

  if (intent === "bill") {
    return getCongressBillData(query, representatives);
  }

  if (intent === "representative" || intent === "money" || intent === "general") {
    return getFecQueryData(query, representatives);
  }

  if (intent === "proposition") {
    return buildSearchContextNode(query, "proposition", representatives);
  }

  return buildSearchContextNode(query, "issue", representatives);
}

async function getCongressBillData(query: string, representatives: CivicNode[]) {
  const key = process.env.CONGRESS_GOV_API_KEY;

  if (!key) {
    return {
      nodes: [],
      edges: [],
      status: missing("Congress.gov", "Set CONGRESS_GOV_API_KEY to search federal bills.")
    };
  }

  try {
    const url = new URL("https://api.congress.gov/v3/bill");
    url.searchParams.set("api_key", key);
    url.searchParams.set("limit", "8");
    url.searchParams.set("sort", "updateDate+desc");
    url.searchParams.set("format", "json");
    url.searchParams.set("query", query);

    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      throw new Error(`Congress.gov returned ${response.status}`);
    }

    const data = (await response.json()) as CongressBillResponse;
    const nodes: CivicNode[] = [];
    const edges: CivicEdge[] = [];
    const issueId = `query_issue_${slug(query)}`;

    nodes.push({
      id: issueId,
      type: "issue",
      label: query,
      years: yearsForRange(4),
      meta: {
        source: "User search",
        queryType: "Bill / policy search"
      },
      evidence: [`User searched for: ${query}.`]
    });

    data.bills?.slice(0, 5).forEach((bill) => {
      const billKey = [bill.type, bill.number, bill.originChamber].filter(Boolean).join("_") || bill.title || query;
      const billId = `congress_bill_${slug(billKey)}`;
      const label = [bill.type?.toUpperCase(), bill.number].filter(Boolean).join(" ") || bill.title || "Congressional bill";

      nodes.push({
        id: billId,
        type: "bill",
        label,
        years: yearsForRange(4),
        meta: {
          source: "Congress.gov",
          title: bill.title ?? "Untitled bill",
          chamber: bill.originChamber ?? "Unknown chamber",
          latestAction: bill.latestAction?.text ?? "No latest action returned",
          url: bill.url ?? ""
        },
        evidence: [
          `Congress.gov search for "${query}" returned ${label}.`,
          bill.title ? `Title: ${bill.title}.` : "No bill title returned.",
          bill.latestAction?.text ? `Latest action: ${bill.latestAction.text}.` : "No latest action text returned."
        ]
      });
      edges.push({
        id: `query_affects_${billId}_${issueId}`,
        source: billId,
        target: issueId,
        label: "matched search",
        years: yearsForRange(4),
        evidence: `Congress.gov returned this bill for the user search "${query}".`
      });
      representatives.slice(0, 4).forEach((representative) => {
        edges.push({
          id: `rep_context_${representative.id}_${billId}`,
          source: representative.id,
          target: billId,
          label: "research context",
          years: yearsForRange(4),
          evidence: `The selected location's representative ${representative.label} is shown for context; sponsorship or vote is not established by this edge.`
        });
      });
    });

    return {
      nodes,
      edges,
      status: ok("Congress.gov", nodes.length > 1 ? `Added federal bill matches for "${query}".` : `No federal bill matches found for "${query}".`)
    };
  } catch (error) {
    return {
      nodes: [],
      edges: [],
      status: failed("Congress.gov", error)
    };
  }
}

async function getFecQueryData(query: string, representatives: CivicNode[]) {
  const key = process.env.FEC_API_KEY;

  if (!key) {
    return {
      nodes: [],
      edges: [],
      status: missing("FEC Search", "Set FEC_API_KEY to search federal candidates and committees.")
    };
  }

  try {
    const [candidateResponse, committeeResponse] = await Promise.all([
      fetchFecCandidateSearch(key, query),
      fetchFecCommitteeSearch(key, query)
    ]);
    const nodes: CivicNode[] = [];
    const edges: CivicEdge[] = [];
    const queryId = `query_issue_${slug(query)}`;

    nodes.push({
      id: queryId,
      type: "issue",
      label: query,
      years: yearsForRange(4),
      meta: {
        source: "User search",
        queryType: "Representative / money search"
      },
      evidence: [`User searched for: ${query}.`]
    });

    candidateResponse.results?.slice(0, 4).forEach((candidate) => {
      if (!candidate.candidate_id || !candidate.name) {
        return;
      }

      const nodeId = `fec_query_candidate_${slug(candidate.candidate_id)}`;
      nodes.push({
        id: nodeId,
        type: "representative",
        label: candidate.name,
        years: yearsForRange(4),
        meta: {
          source: "FEC",
          candidateId: candidate.candidate_id,
          role: candidate.office_full ?? "Federal candidate",
          party: candidate.party_full ?? "Unknown"
        },
        evidence: [`FEC candidate search returned ${candidate.name} for "${query}".`]
      });
      edges.push({
        id: `fec_query_candidate_edge_${nodeId}_${queryId}`,
        source: nodeId,
        target: queryId,
        label: "matched search",
        years: yearsForRange(4),
        evidence: `FEC candidate search matched "${query}".`
      });
    });

    committeeResponse.results?.slice(0, 4).forEach((committee) => {
      const committeeId = typeof committee.committee_id === "string" ? committee.committee_id : "";
      const name = typeof committee.name === "string" ? committee.name : "";
      if (!committeeId || !name) {
        return;
      }

      const nodeId = `fec_query_committee_${slug(committeeId)}`;
      nodes.push({
        id: nodeId,
        type: "pac",
        label: name,
        years: yearsForRange(4),
        meta: {
          source: "FEC",
          committeeId,
          designation: typeof committee.designation_full === "string" ? committee.designation_full : "",
          committeeType: typeof committee.committee_type_full === "string" ? committee.committee_type_full : ""
        },
        evidence: [`FEC committee search returned ${name} (${committeeId}) for "${query}".`]
      });
      edges.push({
        id: `fec_query_committee_edge_${nodeId}_${queryId}`,
        source: nodeId,
        target: queryId,
        label: "matched search",
        years: yearsForRange(4),
        evidence: `FEC committee search matched "${query}".`
      });
      representatives.slice(0, 3).forEach((representative) => {
        edges.push({
          id: `fec_context_${nodeId}_${representative.id}`,
          source: nodeId,
          target: representative.id,
          label: "check filings",
          years: yearsForRange(4),
          evidence: `This edge marks a research lead only; verify support, donations, or expenditures in FEC filings before treating it as a funding relationship.`
        });
      });
    });

    if (nodes.length > 1) {
      return {
        nodes,
        edges,
        status: ok("FEC Search", `Added FEC matches for "${query}".`)
      };
    }

    const fallback = buildSearchContextNode(query, "issue", representatives);
    return {
      nodes: fallback.nodes,
      edges: fallback.edges,
      status: ok("FEC Search", `No FEC matches found for "${query}". Added an AI search context node instead.`)
    };
  } catch (error) {
    return {
      nodes: [],
      edges: [],
      status: failed("FEC Search", error)
    };
  }
}

async function fetchFecSearch(endpoint: string, key: string, query: string) {
  const url = new URL(endpoint);
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", "5");

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(`FEC search returned ${response.status}`);
  }
  return response.json();
}

async function fetchFecCandidateSearch(key: string, query: string) {
  return (await fetchFecSearch("https://api.open.fec.gov/v1/candidates/search/", key, query)) as {
    results?: FecCandidate[];
  };
}

async function fetchFecCommitteeSearch(key: string, query: string) {
  return (await fetchFecSearch("https://api.open.fec.gov/v1/committees/", key, query)) as {
    results?: FecCommittee[];
  };
}

function buildSearchContextNode(query: string, type: "proposition" | "issue", representatives: CivicNode[]) {
  const nodeId = `${type === "proposition" ? "query_prop" : "query_issue"}_${slug(query)}`;
  const nodes: CivicNode[] = [
    {
      id: nodeId,
      type,
      label: query,
      years: yearsForRange(4),
      meta: {
        source: "AI/web research prompt",
        queryType: type === "proposition" ? "Ballot proposition search" : "General civic search"
      },
      evidence: [
        `User searched for: ${query}.`,
        "The summary card will use GPT web search to identify source-backed context and uncertainty for this query."
      ]
    }
  ];
  const edges = representatives.slice(0, 5).map((representative) => ({
    id: `query_context_${representative.id}_${nodeId}`,
    source: representative.id,
    target: nodeId,
    label: "research context",
    years: yearsForRange(4),
    evidence: `The selected location's representative ${representative.label} is shown as context for the user query; no position or vote is implied.`
  }));

  return {
    nodes,
    edges,
    status: ok("AI Search Context", `Added "${query}" as a graph node. Click it for GPT web-search context.`)
  };
}

function buildGoogleNodes(data: GoogleCivicResponse): CivicGraph {
  const nodes: CivicNode[] = [];
  const edges: CivicEdge[] = [];

  data.offices?.forEach((office, officeIndex) => {
    office.officialIndices?.forEach((officialIndex) => {
      const official = data.officials?.[officialIndex];
      if (!official?.name) {
        return;
      }

      const nodeId = `google_rep_${slug(official.name)}_${officeIndex}`;
      nodes.push({
        id: nodeId,
        type: "representative",
        label: official.name,
        years: yearsForRange(4),
        meta: {
          role: office.name ?? "Representative",
          district: office.divisionId ? data.divisions?.[office.divisionId]?.name ?? office.divisionId : "Matched division",
          party: official.party ?? "Unknown",
          source: "Google Civic",
          website: official.urls?.[0] ?? ""
        },
        evidence: [
          `Google Civic returned ${official.name} for ${office.name ?? "an elected office"}.`,
          office.divisionId ? `Division: ${data.divisions?.[office.divisionId]?.name ?? office.divisionId}.` : "No division detail returned."
        ]
      });
    });
  });

  return { nodes, edges };
}

function buildOpenStatesNodes(data: OpenStatesGeoResponse): CivicGraph {
  const nodes: CivicNode[] = [];
  const edges: CivicEdge[] = [];

  data.results?.slice(0, 8).forEach((person) => {
    if (!person.id || !person.name) {
      return;
    }

    const repId = `openstates_rep_${slug(person.id)}`;
    const committeeId = `openstates_state_leg_${slug(person.current_role?.jurisdiction ?? "state")}`;
    nodes.push({
      id: repId,
      type: "representative",
      label: person.name,
      years: yearsForRange(4),
      meta: {
        role: person.current_role?.title ?? "State legislator",
        district: person.current_role?.district ?? "Matched district",
        party: person.party ?? "Unknown",
        source: "Open States",
        website: person.links?.[0]?.url ?? ""
      },
      evidence: [
        `Open States returned ${person.name} for district ${person.current_role?.district ?? "unknown"}.`,
        "Open States can be used next to load this legislator's bills, sponsorships, votes, and committees."
      ]
    });
    nodes.push({
      id: committeeId,
      type: "committee",
      label: "State Legislature",
      years: yearsForRange(4),
      meta: {
        source: "Open States",
        jurisdiction: person.current_role?.jurisdiction ?? "Matched state jurisdiction"
      },
      evidence: ["Open States groups state legislative people by jurisdiction and chamber."]
    });
    edges.push({
      id: `openstates_role_${repId}_${committeeId}`,
      source: repId,
      target: committeeId,
      label: "serves in",
      years: yearsForRange(4),
      evidence: `${person.name} has a current Open States role in ${person.current_role?.jurisdiction ?? "the matched jurisdiction"}.`
    });
  });

  return { nodes, edges };
}

function buildCiceroNodes(data: CiceroOfficialResponse): CivicGraph {
  const nodes: CivicNode[] = [];
  const edges: CivicEdge[] = [];
  const officials = data.response?.results?.officials ?? [];

  officials.slice(0, 10).forEach((official) => {
    const name = getCiceroName(official);

    if (!official.id || !name) {
      return;
    }

    const districtLabel = official.office?.district?.label ?? official.office?.chamber?.name ?? "Matched district";
    const nodeId = `cicero_rep_${slug(String(official.id))}`;

    nodes.push({
      id: nodeId,
      type: "representative",
      label: name,
      years: yearsForRange(4),
      meta: {
        role: official.office?.title ?? official.office?.chamber?.name ?? "Elected official",
        district: districtLabel,
        party: official.party ?? "Unknown",
        source: "Cicero",
        website: official.urls?.[0]?.url ?? ""
      },
      evidence: [
        `Cicero returned ${name} for ${districtLabel}.`,
        "Cicero matched the input address to districts and officials using the configured Cicero API key."
      ]
    });
  });

  return { nodes, edges };
}

function getCiceroName(official: CiceroOfficial) {
  return (
    official.preferred_name ||
    [official.first_name, official.last_name].filter(Boolean).join(" ").trim()
  );
}

function classifyQuery(query: string): QueryIntent {
  const value = query.toLowerCase();

  if (!value) {
    return "location";
  }

  if (/\b(hr|h\.r\.|s\.|senate bill|house bill|bill|act|resolution)\b/.test(value)) {
    return "bill";
  }

  if (/\b(prop|proposition|measure|referendum|ballot)\b/.test(value)) {
    return "proposition";
  }

  if (/\b(pac|donor|donation|contribution|funding|money|committee|expenditure)\b/.test(value)) {
    return "money";
  }

  if (/\b(rep|representative|senator|councilmember|mayor|candidate)\b/.test(value)) {
    return "representative";
  }

  if (/^[a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+){1,3}$/i.test(query.trim())) {
    return "representative";
  }

  return "general";
}

function parsePlace(address: string) {
  const trimmed = address.trim();
  const commaParts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);

  if (commaParts.length >= 2) {
    return {
      city: commaParts[0],
      state: normalizeState(commaParts[1])
    };
  }

  const stateMatch = trimmed.match(/\b([A-Z]{2}|California|New York|Texas|Florida|Washington|District of Columbia)\b$/i);
  if (!stateMatch) {
    return {
      city: trimmed,
      state: "CA"
    };
  }

  return {
    city: trimmed.slice(0, stateMatch.index).trim().replace(/,$/, ""),
    state: normalizeState(stateMatch[1])
  };
}

function normalizeState(value: string) {
  const lower = value.trim().toLowerCase();
  const states: Record<string, string> = {
    california: "CA",
    "new york": "NY",
    texas: "TX",
    florida: "FL",
    washington: "WA",
    "district of columbia": "DC"
  };

  return states[lower] ?? value.trim().slice(0, 2).toUpperCase();
}

function buildDistrictSummary(
  address: string,
  query: string,
  intent: QueryIntent,
  openStatesData: OpenStatesGeoResponse | null,
  ciceroData: CiceroOfficialResponse | null,
  queryNodeCount: number,
  hasLiveData: boolean
) {
  if (!hasLiveData) {
    return `${address} is using the demo graph until API keys are configured.`;
  }

  const openStatesCount = openStatesData?.results?.length ?? 0;
  const ciceroCount = ciceroData?.response?.results?.officials?.length ?? 0;
  const parts = [
    ciceroCount
      ? `${ciceroCount} Cicero official${ciceroCount === 1 ? "" : "s"}`
      : "no Cicero officials",
    openStatesCount
      ? `${openStatesCount} Open States legislator${openStatesCount === 1 ? "" : "s"}`
      : "no Open States legislators"
  ];

  const queryText = query
    ? ` Search "${query}" was classified as ${intent} and added ${queryNodeCount} related node${queryNodeCount === 1 ? "" : "s"}.`
    : "";

  return `${address} matched ${parts.join(" and ")}.${queryText}`;
}

function filterGraph(graph: CivicGraph, range: 2 | 4): CivicGraph {
  const minYear = currentYear - range;
  const nodes = graph.nodes.filter((node) => node.years.some((year) => year >= minYear));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) =>
      edge.years.some((year) => year >= minYear) &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target)
  );

  return { nodes, edges };
}

function mergeGraph(target: CivicGraph, incoming: CivicGraph) {
  const nodeIds = new Set(target.nodes.map((node) => node.id));
  const edgeIds = new Set(target.edges.map((edge) => edge.id));

  incoming.nodes.forEach((node) => {
    if (!nodeIds.has(node.id)) {
      target.nodes.push(node);
      nodeIds.add(node.id);
    }
  });
  incoming.edges.forEach((edge) => {
    if (!edgeIds.has(edge.id)) {
      target.edges.push(edge);
      edgeIds.add(edge.id);
    }
  });
}

function cloneGraph(graph: CivicGraph): CivicGraph {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      meta: { ...node.meta },
      evidence: [...node.evidence],
      years: [...node.years]
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      years: [...edge.years]
    }))
  };
}

function yearsForRange(range: 2 | 4) {
  return Array.from({ length: range + 1 }, (_, index) => currentYear - index);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function uniqueByLabel(nodes: CivicNode[]) {
  const seen = new Set<string>();

  return nodes.filter((node) => {
    const key = node.label.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function missing(provider: string, detail: string): ProviderStatus {
  return { provider, configured: false, status: "missing_key", detail };
}

function ok(provider: string, detail: string): ProviderStatus {
  return { provider, configured: true, status: "ok", detail };
}

function skipped(provider: string, detail: string): ProviderStatus {
  return { provider, configured: true, status: "skipped", detail };
}

function failed(provider: string, error: unknown): ProviderStatus {
  return {
    provider,
    configured: true,
    status: "error",
    detail: error instanceof Error ? error.message : "Unknown provider error."
  };
}
