export type CivicNodeType =
  | "representative"
  | "proposition"
  | "pac"
  | "corporation"
  | "bill"
  | "issue"
  | "committee";

export type CivicNode = {
  id: string;
  type: CivicNodeType;
  label: string;
  years: number[];
  meta: Record<string, string | string[]>;
  evidence: string[];
};

export type CivicEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  years: number[];
  evidence: string;
};

export type CivicGraph = {
  nodes: CivicNode[];
  edges: CivicEdge[];
};

export const civicGraph: CivicGraph = {
  nodes: [
    {
      id: "corp_builderco",
      type: "corporation",
      label: "BuilderCo",
      years: [2022, 2023, 2024, 2025],
      meta: {
        sector: "Real estate development",
        location: "Metro region"
      },
      evidence: [
        "Reported independent expenditure donations to Housing Growth PAC in 2023 and 2025.",
        "Public business filings describe BuilderCo as a residential and mixed-use developer."
      ]
    },
    {
      id: "pac_housing_growth",
      type: "pac",
      label: "Housing Growth PAC",
      years: [2022, 2023, 2024, 2025],
      meta: {
        focus: "Housing development and zoning reform",
        position: "Supported Prop A"
      },
      evidence: [
        "Filed campaign spending supporting pro-growth council candidates.",
        "Endorsed Yes on Prop A in voter information materials."
      ]
    },
    {
      id: "rep_jane_doe",
      type: "representative",
      label: "Jane Doe",
      years: [2022, 2023, 2024, 2025],
      meta: {
        role: "City Council",
        district: "District 3",
        party: "Nonpartisan seat",
        priorities: ["Housing supply", "Public safety spending", "Business permits"]
      },
      evidence: [
        "Voted yes on the Zoning Expansion Bill in 2024.",
        "Sponsored a 2025 small business permitting bill.",
        "Received support from Housing Growth PAC during the 2024 cycle."
      ]
    },
    {
      id: "bill_zoning_expansion",
      type: "bill",
      label: "Zoning Expansion Bill",
      years: [2024, 2025],
      meta: {
        status: "Passed council, implementation pending",
        summary: "Allows higher-density residential projects near transit corridors."
      },
      evidence: [
        "Council vote records show passage by a 6-3 vote in May 2024.",
        "Planning department memo links the bill to transit-oriented housing goals."
      ]
    },
    {
      id: "issue_housing",
      type: "issue",
      label: "Housing Development",
      years: [2022, 2023, 2024, 2025],
      meta: {
        area: "Housing and land use",
        voterLens: "Supply, affordability, neighborhood change"
      },
      evidence: [
        "Recent local measures and council votes repeatedly reference housing supply and affordability.",
        "Campaign committees in the graph describe housing development as a core interest."
      ]
    },
    {
      id: "prop_a",
      type: "proposition",
      label: "Prop A",
      years: [2024],
      meta: {
        title: "Housing Expansion Measure",
        ballot: "Would allow higher-density housing near transit zones."
      },
      evidence: [
        "Official ballot digest says the measure increases allowed residential density near transit.",
        "Campaign filings list Housing Growth PAC as a supporter."
      ]
    },
    {
      id: "pac_neighborhood",
      type: "pac",
      label: "Neighborhood Preservation PAC",
      years: [2024, 2025],
      meta: {
        focus: "Neighborhood control and slower zoning changes",
        position: "Opposed Prop A"
      },
      evidence: [
        "Filed opposition materials against Prop A.",
        "Mailer language emphasized parking, local control, and preserving existing neighborhood scale."
      ]
    },
    {
      id: "committee_land_use",
      type: "committee",
      label: "Land Use Committee",
      years: [2023, 2024, 2025],
      meta: {
        jurisdiction: "Zoning, planning, development review",
        chair: "Councilmember Jane Doe"
      },
      evidence: [
        "Committee roster lists Jane Doe as chair for the 2025 session.",
        "Committee agenda included hearings on the Zoning Expansion Bill."
      ]
    }
  ],
  edges: [
    {
      id: "e_builderco_housing_pac",
      source: "corp_builderco",
      target: "pac_housing_growth",
      label: "donated $50k",
      years: [2023, 2025],
      evidence: "Mock campaign filing: BuilderCo reported $50,000 total donations to Housing Growth PAC."
    },
    {
      id: "e_pac_jane",
      source: "pac_housing_growth",
      target: "rep_jane_doe",
      label: "funded",
      years: [2024],
      evidence: "Mock independent expenditure report: Housing Growth PAC spent in support of Jane Doe."
    },
    {
      id: "e_pac_prop_a",
      source: "pac_housing_growth",
      target: "prop_a",
      label: "supports",
      years: [2024],
      evidence: "Mock ballot committee filing: Housing Growth PAC supported Yes on Prop A."
    },
    {
      id: "e_neighborhood_prop_a",
      source: "pac_neighborhood",
      target: "prop_a",
      label: "opposes",
      years: [2024],
      evidence: "Mock ballot committee filing: Neighborhood Preservation PAC opposed Prop A."
    },
    {
      id: "e_jane_bill",
      source: "rep_jane_doe",
      target: "bill_zoning_expansion",
      label: "voted YES",
      years: [2024],
      evidence: "Mock council record: Jane Doe voted yes on the Zoning Expansion Bill."
    },
    {
      id: "e_jane_committee",
      source: "rep_jane_doe",
      target: "committee_land_use",
      label: "chairs",
      years: [2025],
      evidence: "Mock committee roster: Jane Doe chaired the Land Use Committee in 2025."
    },
    {
      id: "e_committee_bill",
      source: "committee_land_use",
      target: "bill_zoning_expansion",
      label: "heard",
      years: [2024],
      evidence: "Mock agenda: Land Use Committee heard the Zoning Expansion Bill before council vote."
    },
    {
      id: "e_bill_issue",
      source: "bill_zoning_expansion",
      target: "issue_housing",
      label: "affects",
      years: [2024, 2025],
      evidence: "Mock planning memo: the bill affects housing development near transit corridors."
    },
    {
      id: "e_prop_issue",
      source: "prop_a",
      target: "issue_housing",
      label: "affects",
      years: [2024],
      evidence: "Mock ballot digest: Prop A affects housing development rules."
    }
  ]
};

export function filterGraphByYears(range: 2 | 4): CivicGraph {
  const currentYear = 2026;
  const minYear = currentYear - range;
  const nodes = civicGraph.nodes.filter((node) => node.years.some((year) => year >= minYear));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = civicGraph.edges.filter(
    (edge) =>
      edge.years.some((year) => year >= minYear) &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target)
  );

  return { nodes, edges };
}

export function getNodeEvidence(nodeId: string, range: 2 | 4) {
  const graph = filterGraphByYears(range);
  const node = graph.nodes.find((item) => item.id === nodeId);

  if (!node) {
    return null;
  }

  const connectedEdges = graph.edges.filter(
    (edge) => edge.source === nodeId || edge.target === nodeId
  );
  const connectedIds = new Set(
    connectedEdges.flatMap((edge) => [edge.source, edge.target]).filter((id) => id !== nodeId)
  );
  const connectedNodes = graph.nodes.filter((item) => connectedIds.has(item.id));

  return {
    node,
    connectedEdges,
    connectedNodes
  };
}
