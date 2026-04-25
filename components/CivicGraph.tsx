"use client";

import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Building2, CircleDollarSign, FileText, Landmark, Scale, Users, Vote } from "lucide-react";
import { CivicEdge, CivicNode, CivicNodeType } from "@/data/civic-graph";

type GraphNodeData = CivicNode & {
  selected: boolean;
};

const positions: Record<string, { x: number; y: number }> = {
  corp_builderco: { x: -80, y: 40 },
  pac_housing_growth: { x: 230, y: 40 },
  rep_jane_doe: { x: 535, y: 150 },
  committee_land_use: { x: 845, y: 42 },
  bill_zoning_expansion: { x: 845, y: 278 },
  issue_housing: { x: 1145, y: 278 },
  prop_a: { x: 535, y: 410 },
  pac_neighborhood: { x: 230, y: 410 }
};

const typeBands: Record<CivicNodeType, number> = {
  corporation: 40,
  pac: 320,
  representative: 640,
  committee: 980,
  proposition: 1320,
  bill: 1660,
  issue: 2000
};

const nodeStyles: Record<CivicNodeType, { className: string; icon: React.ElementType; label: string }> = {
  representative: {
    className: "border-civic-blue bg-[#eef5fb] text-civic-navy",
    icon: Landmark,
    label: "Representative"
  },
  proposition: {
    className: "border-civic-gold bg-[#fbf3e2] text-[#6f4b16]",
    icon: Vote,
    label: "Ballot Proposition"
  },
  pac: {
    className: "border-civic-green bg-[#edf6f1] text-[#215046]",
    icon: CircleDollarSign,
    label: "PAC"
  },
  corporation: {
    className: "border-[#8a6d4d] bg-[#f3eee7] text-[#59462f]",
    icon: Building2,
    label: "Corporation / Donor"
  },
  bill: {
    className: "border-civic-red bg-[#faeeee] text-[#713936]",
    icon: FileText,
    label: "Bill / Vote"
  },
  issue: {
    className: "border-[#5f6570] bg-[#f1f2f4] text-[#3f4650]",
    icon: Scale,
    label: "Issue Area"
  },
  committee: {
    className: "border-[#7161a7] bg-[#f1eef9] text-[#46396b]",
    icon: Users,
    label: "Committee"
  }
};

function CivicNodeCard({ data }: NodeProps<Node<GraphNodeData>>) {
  const style = nodeStyles[data.type];
  const Icon = style.icon;

  return (
    <button
      className={`w-[210px] rounded-lg border-2 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${style.className} ${
        data.selected ? "ring-4 ring-ink/15" : ""
      }`}
      type="button"
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-75">
        <Icon aria-hidden className="h-4 w-4" />
        {style.label}
      </div>
      <div className="mt-2 text-[17px] font-semibold leading-tight">{data.label}</div>
      {data.meta.role ? (
        <div className="mt-1 text-xs opacity-75">
          {data.meta.role} {data.meta.district ? `- ${data.meta.district}` : ""}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

const nodeTypes = {
  civicNode: CivicNodeCard
};

export function CivicGraph({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode
}: {
  nodes: CivicNode[];
  edges: CivicEdge[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <CivicGraphCanvas
        edges={edges}
        nodes={nodes}
        onSelectNode={onSelectNode}
        selectedNodeId={selectedNodeId}
      />
    </ReactFlowProvider>
  );
}

function CivicGraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode
}: {
  nodes: CivicNode[];
  edges: CivicEdge[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const reactFlow = useReactFlow<Node<GraphNodeData>, Edge>();
  const flowNodes: Node<GraphNodeData>[] = nodes.map((node) => ({
    id: node.id,
    type: "civicNode",
    position: positions[node.id] ?? getAutoPosition(node, nodes),
    data: {
      ...node,
      selected: node.id === selectedNodeId
    }
  }));

  const flowEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: edge.source === selectedNodeId || edge.target === selectedNodeId,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#586575"
    },
    style: {
      strokeWidth: edge.source === selectedNodeId || edge.target === selectedNodeId ? 3 : 2,
      stroke: edge.source === selectedNodeId || edge.target === selectedNodeId ? "#25364a" : "#9aa4b2"
    },
    labelBgPadding: [8, 5],
    labelBgBorderRadius: 5,
    labelBgStyle: { fill: "#fffaf0", fillOpacity: 0.95 },
    labelStyle: { fill: "#334155", fontWeight: 600, fontSize: 12 }
  }));

  return (
    <div className="h-full min-h-[560px] overflow-hidden rounded-lg border border-black/10 bg-[#fffaf0]">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.8}
        onNodeClick={(_, node) => {
          onSelectNode(node.id);
          void reactFlow.setCenter(node.position.x + 105, node.position.y + 48, {
            zoom: 1.25,
            duration: 550
          });
        }}
      >
        <Background color="#d7d0c2" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function getAutoPosition(node: CivicNode, nodes: CivicNode[]) {
  const sameTypeNodes = nodes.filter((item) => item.type === node.type);
  const sameTypeIndex = sameTypeNodes.findIndex((item) => item.id === node.id);
  const column = Math.floor(Math.max(0, sameTypeIndex) / 5);
  const row = Math.max(0, sameTypeIndex) % 5;
  const x = typeBands[node.type] ?? 300;
  const y = 40 + row * 185 + column * 70;

  return { x: x + column * 260, y };
}
