import Graph from 'graphology';
import { CodeGraph, NodeLabel } from '../core/graph/types';
import { NODE_COLORS, NODE_SIZES, getModuleColor } from './constants';

export interface NodeDisplayAttrs {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  nodeType: NodeLabel;
  filePath: string;
  startLine?: number;
  endLine?: number;
  hidden?: boolean;
  zIndex?: number;
  highlighted?: boolean;
  mass?: number;
  community?: number;
  communityColor?: string;
  type?: string;
}

export interface EdgeDisplayAttrs {
  size: number;
  color: string;
  relationType: string;
  type?: string;
  curvature?: number;
  zIndex?: number;
}

const MASS_TABLE: Partial<Record<NodeLabel, number>> = {
  Project: 10,
  Package: 8,
  Module: 6,
  Folder: 5,
  File: 2.5,
  Class: 4,
  Interface: 4,
  Function: 2,
  Method: 2,
};

const computeScaledSize = (baseSize: number, nodeTotal: number): number => {
  const minSize = nodeTotal > 20000 ? 1 : nodeTotal > 5000 ? 1.5 : 2;
  return Math.max(minSize, baseSize * Math.pow(500 / nodeTotal, 0.3));
};

const computeNodeMass = (nodeType: NodeLabel, nodeTotal: number): number => {
  const base = MASS_TABLE[nodeType] ?? 1;
  const scale = 1 + Math.log10(Math.max(nodeTotal, 10)) * 0.4;
  return base * scale;
};

const EDGE_PALETTE = new Map<string, { color: string; sizeMultiplier: number }>([
  ['CONTAINS',   { color: '#3D5A48', sizeMultiplier: 0.4 }],
  ['DEFINES',    { color: '#3A6070', sizeMultiplier: 0.5 }],
  ['IMPORTS',    { color: '#4A5578', sizeMultiplier: 0.6 }],
  ['CALLS',      { color: '#6A5070', sizeMultiplier: 0.8 }],
  ['EXTENDS',    { color: '#804A38', sizeMultiplier: 1.0 }],
  ['IMPLEMENTS', { color: '#704050', sizeMultiplier: 0.9 }],
]);

const FALLBACK_EDGE_STYLE = { color: '#4a4a5a', sizeMultiplier: 0.5 };

export const toSigmaGraph = (
  codeGraph: CodeGraph,
  communityMemberships?: Map<string, number>
): Graph<NodeDisplayAttrs, EdgeDisplayAttrs> => {
  const graph = new Graph<NodeDisplayAttrs, EdgeDisplayAttrs>();
  const nodeTotal = codeGraph.nodes.length;

  const parentToChildren = new Map<string, string[]>();
  const childToParent = new Map<string, string>();

  const hierarchyRelations = new Set(['CONTAINS', 'DEFINES', 'IMPORTS']);

  codeGraph.relationships.forEach(rel => {
    if (hierarchyRelations.has(rel.type)) {
      if (!parentToChildren.has(rel.sourceId)) {
        parentToChildren.set(rel.sourceId, []);
      }
      parentToChildren.get(rel.sourceId)!.push(rel.targetId);
      childToParent.set(rel.targetId, rel.sourceId);
    }
  });

  const nodeMap = new Map(codeGraph.nodes.map(n => [n.id, n]));

  const structuralTypes = new Set(['Project', 'Package', 'Module', 'Folder']);
  const structuralNodes = codeGraph.nodes.filter(n => structuralTypes.has(n.label));

  const spread = Math.sqrt(nodeTotal) * 40;
  const childJitter = Math.sqrt(nodeTotal) * 3;

  const clusterCenters = new Map<number, { x: number; y: number }>();
  if (communityMemberships && communityMemberships.size > 0) {
    const communities = new Set(communityMemberships.values());
    const communityCount = communities.size;
    const clusterSpread = spread * 0.8;

    const cols = Math.ceil(Math.sqrt(communityCount));
    const rows = Math.ceil(communityCount / cols);
    const spacing = clusterSpread * 2 / Math.max(cols, 1);

    let idx = 0;
    communities.forEach(communityId => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      clusterCenters.set(communityId, {
        x: (col - cols / 2) * spacing,
        y: (row - rows / 2) * spacing,
      });
      idx++;
    });
  }
  const clusterJitter = Math.sqrt(nodeTotal) * 1.5;

  const nodePositions = new Map<string, { x: number; y: number }>();

  const total = Math.max(structuralNodes.length, 1);
  structuralNodes.forEach((node, i) => {
    const angle = i * 0.5;
    const radius = spread * Math.sqrt(i / total);

    const jitter = spread * 0.15;
    const x = radius * Math.cos(angle) + (Math.random() - 0.5) * jitter;
    const y = radius * Math.sin(angle) + (Math.random() - 0.5) * jitter;

    nodePositions.set(node.id, { x, y });

    const baseSize = NODE_SIZES[node.label] || 8;
    const scaledSize = computeScaledSize(baseSize, nodeTotal);

    graph.addNode(node.id, {
      x,
      y,
      size: scaledSize,
      color: NODE_COLORS[node.label] || '#9ca3af',
      label: node.properties.name,
      nodeType: node.label,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine,
      hidden: false,
      mass: computeNodeMass(node.label, nodeTotal),
      type: node.label === 'Folder' ? 'triangle' : undefined,
    });
  });

  const symbolTypes = new Set(['Function', 'Class', 'Method', 'Interface']);

  const placeNode = (nodeId: string) => {
    if (graph.hasNode(nodeId)) return;

    const node = nodeMap.get(nodeId);
    if (!node) return;

    let x: number, y: number;

    const communityIndex = communityMemberships?.get(nodeId);
    const clusterCenter = communityIndex !== undefined ? clusterCenters.get(communityIndex) : null;

    if (clusterCenter && symbolTypes.has(node.label)) {
      x = clusterCenter.x + (Math.random() - 0.5) * clusterJitter;
      y = clusterCenter.y + (Math.random() - 0.5) * clusterJitter;
    } else {
      const parentId = childToParent.get(nodeId);
      const parentPos = parentId ? nodePositions.get(parentId) : null;

      if (parentPos) {
        x = parentPos.x + (Math.random() - 0.5) * childJitter;
        y = parentPos.y + (Math.random() - 0.5) * childJitter;
      } else {
        x = (Math.random() - 0.5) * spread * 0.5;
        y = (Math.random() - 0.5) * spread * 0.5;
      }
    }

    nodePositions.set(nodeId, { x, y });

    const baseSize = NODE_SIZES[node.label] || 8;
    const scaledSize = computeScaledSize(baseSize, nodeTotal);

    const hasCommunity = communityIndex !== undefined;
    const usesCommunityColor = hasCommunity && symbolTypes.has(node.label);
    const nodeColor = usesCommunityColor
      ? getModuleColor(communityIndex!)
      : NODE_COLORS[node.label] || '#9ca3af';

    graph.addNode(nodeId, {
      x,
      y,
      size: scaledSize,
      color: nodeColor,
      label: node.properties.name,
      nodeType: node.label,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine,
      hidden: false,
      mass: computeNodeMass(node.label, nodeTotal),
      community: communityIndex,
      communityColor: hasCommunity ? getModuleColor(communityIndex!) : undefined,
      type: node.label === 'Folder' ? 'triangle' : undefined,
    });
  };

  const queue: string[] = structuralNodes.map(n => n.id);
  const visited = new Set<string>(queue);

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    const children = parentToChildren.get(currentId) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        placeNode(childId);
        queue.push(childId);
      }
    }
  }

  codeGraph.nodes.forEach((node) => {
    if (!graph.hasNode(node.id)) {
      placeNode(node.id);
    }
  });

  const edgeBaseSize = nodeTotal > 20000 ? 0.4 : nodeTotal > 5000 ? 0.6 : 1.0;

  codeGraph.relationships.forEach((rel) => {
    if (graph.hasNode(rel.sourceId) && graph.hasNode(rel.targetId)) {
      if (!graph.hasEdge(rel.sourceId, rel.targetId)) {
        const style = EDGE_PALETTE.get(rel.type) ?? FALLBACK_EDGE_STYLE;
        const curvature = 0.12 + (Math.random() * 0.08);

        graph.addEdge(rel.sourceId, rel.targetId, {
          size: edgeBaseSize * style.sizeMultiplier,
          color: style.color,
          relationType: rel.type,
          type: 'curved',
          curvature,
        });
      }
    }
  });

  return graph;
};

/**
 * Patch an existing graphology instance in-place with data from a new CodeGraph.
 * Preserves x/y positions for nodes that already exist so the layout stays stable.
 * New nodes are positioned near their parent or community cluster center.
 */
export const patchSigmaGraph = (
  existing: Graph<NodeDisplayAttrs, EdgeDisplayAttrs>,
  codeGraph: CodeGraph,
  communityMemberships?: Map<string, number>,
): void => {
  const newNodeIds = new Set(codeGraph.nodes.map(n => n.id));
  const nodeTotal = codeGraph.nodes.length;
  const nodeMap = new Map(codeGraph.nodes.map(n => [n.id, n]));

  /* ── Build parent-child map for positioning new nodes ─────── */
  const childToParent = new Map<string, string>();
  const hierarchyRelations = new Set(['CONTAINS', 'DEFINES', 'IMPORTS']);
  codeGraph.relationships.forEach(rel => {
    if (hierarchyRelations.has(rel.type)) {
      childToParent.set(rel.targetId, rel.sourceId);
    }
  });

  /* ── Community cluster centers (reuses toSigmaGraph logic) ── */
  const spread = Math.sqrt(nodeTotal) * 40;
  const clusterJitter = Math.sqrt(nodeTotal) * 1.5;
  const childJitter = Math.sqrt(nodeTotal) * 3;
  const clusterCenters = new Map<number, { x: number; y: number }>();
  if (communityMemberships && communityMemberships.size > 0) {
    const communities = new Set(communityMemberships.values());
    const communityCount = communities.size;
    const clusterSpread = spread * 0.8;
    const cols = Math.ceil(Math.sqrt(communityCount));
    const rows = Math.ceil(communityCount / cols);
    const spacing = clusterSpread * 2 / Math.max(cols, 1);
    let idx = 0;
    communities.forEach(communityId => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      clusterCenters.set(communityId, {
        x: (col - cols / 2) * spacing,
        y: (row - rows / 2) * spacing,
      });
      idx++;
    });
  }

  const symbolTypes = new Set(['Function', 'Class', 'Method', 'Interface']);

  /* ── 1. Remove stale nodes (drops connected edges automatically) ── */
  const existingNodeIds: string[] = [];
  existing.forEachNode(nid => existingNodeIds.push(nid));
  for (const nid of existingNodeIds) {
    if (!newNodeIds.has(nid)) {
      existing.dropNode(nid);
    }
  }

  /* ── 2. Update existing nodes & add new nodes ────────────── */
  for (const node of codeGraph.nodes) {
    const baseSize = NODE_SIZES[node.label] || 8;
    const scaledSize = computeScaledSize(baseSize, nodeTotal);
    const communityIndex = communityMemberships?.get(node.id);
    const hasCommunity = communityIndex !== undefined;
    const usesCommunityColor = hasCommunity && symbolTypes.has(node.label);
    const nodeColor = usesCommunityColor
      ? getModuleColor(communityIndex!)
      : NODE_COLORS[node.label] || '#9ca3af';

    if (existing.hasNode(node.id)) {
      /* Update attributes but preserve x, y */
      existing.mergeNodeAttributes(node.id, {
        size: scaledSize,
        color: nodeColor,
        label: node.properties.name,
        nodeType: node.label,
        filePath: node.properties.filePath,
        startLine: node.properties.startLine,
        endLine: node.properties.endLine,
        mass: computeNodeMass(node.label, nodeTotal),
        community: communityIndex,
        communityColor: hasCommunity ? getModuleColor(communityIndex!) : undefined,
        type: node.label === 'Folder' ? 'triangle' : undefined,
      });
    } else {
      /* Position new node near parent or community center */
      let x: number, y: number;
      const clusterCenter = communityIndex !== undefined ? clusterCenters.get(communityIndex) : null;

      if (clusterCenter && symbolTypes.has(node.label)) {
        x = clusterCenter.x + (Math.random() - 0.5) * clusterJitter;
        y = clusterCenter.y + (Math.random() - 0.5) * clusterJitter;
      } else {
        const parentId = childToParent.get(node.id);
        const parentPos = parentId && existing.hasNode(parentId)
          ? { x: existing.getNodeAttribute(parentId, 'x'), y: existing.getNodeAttribute(parentId, 'y') }
          : null;

        if (parentPos) {
          x = parentPos.x + (Math.random() - 0.5) * childJitter;
          y = parentPos.y + (Math.random() - 0.5) * childJitter;
        } else {
          x = (Math.random() - 0.5) * spread * 0.5;
          y = (Math.random() - 0.5) * spread * 0.5;
        }
      }

      existing.addNode(node.id, {
        x,
        y,
        size: scaledSize,
        color: nodeColor,
        label: node.properties.name,
        nodeType: node.label,
        filePath: node.properties.filePath,
        startLine: node.properties.startLine,
        endLine: node.properties.endLine,
        hidden: false,
        mass: computeNodeMass(node.label, nodeTotal),
        community: communityIndex,
        communityColor: hasCommunity ? getModuleColor(communityIndex!) : undefined,
        type: node.label === 'Folder' ? 'triangle' : undefined,
      });
    }
  }

  /* ── 3. Sync edges: build set of desired edges, remove stale, add new ── */
  const edgeBaseSize = nodeTotal > 20000 ? 0.4 : nodeTotal > 5000 ? 0.6 : 1.0;

  /* Build a set of desired edge keys */
  const desiredEdges = new Set<string>();
  codeGraph.relationships.forEach(rel => {
    if (existing.hasNode(rel.sourceId) && existing.hasNode(rel.targetId)) {
      desiredEdges.add(`${rel.sourceId}→${rel.targetId}`);
    }
  });

  /* Remove stale edges */
  const existingEdgeKeys: { key: string; src: string; tgt: string }[] = [];
  existing.forEachEdge((eid, _attrs, src, tgt) => {
    existingEdgeKeys.push({ key: `${src}→${tgt}`, src, tgt });
  });
  for (const { key, src, tgt } of existingEdgeKeys) {
    if (!desiredEdges.has(key)) {
      if (existing.hasEdge(src, tgt)) {
        existing.dropEdge(src, tgt);
      }
    }
  }

  /* Add new edges */
  codeGraph.relationships.forEach(rel => {
    if (existing.hasNode(rel.sourceId) && existing.hasNode(rel.targetId)) {
      if (!existing.hasEdge(rel.sourceId, rel.targetId)) {
        const style = EDGE_PALETTE.get(rel.type) ?? FALLBACK_EDGE_STYLE;
        const curvature = 0.12 + (Math.random() * 0.08);
        existing.addEdge(rel.sourceId, rel.targetId, {
          size: edgeBaseSize * style.sizeMultiplier,
          color: style.color,
          relationType: rel.type,
          type: 'curved',
          curvature,
        });
      }
    }
  });
};

export const filterGraphByLabels = (
  graph: Graph<NodeDisplayAttrs, EdgeDisplayAttrs>,
  visibleLabels: NodeLabel[]
): void => {
  const allowed = new Set(visibleLabels);
  graph.forEachNode((nid, attrs) => {
    graph.setNodeAttribute(nid, 'hidden', !allowed.has(attrs.nodeType));
  });
};

export const getNodesWithinHops = (
  graph: Graph<NodeDisplayAttrs, EdgeDisplayAttrs>,
  startNodeId: string,
  maxHops: number
): Set<string> => {
  const reached = new Set<string>();
  const pending: { id: string; hops: number }[] = [{ id: startNodeId, hops: 0 }];

  while (pending.length > 0) {
    const { id, hops } = pending.shift()!;

    if (reached.has(id)) continue;
    reached.add(id);

    if (hops < maxHops) {
      const neighbors: string[] = [];
      graph.forEachNeighbor(id, (neighborId) => {
        neighbors.push(neighborId);
      });
      for (const nid of neighbors) {
        if (!reached.has(nid)) {
          pending.push({ id: nid, hops: hops + 1 });
        }
      }
    }
  }

  return reached;
};

export const filterGraphByDepth = (
  graph: Graph<NodeDisplayAttrs, EdgeDisplayAttrs>,
  selectedNodeId: string | null,
  maxHops: number | null,
  visibleLabels: NodeLabel[]
): void => {
  if (maxHops === null) {
    filterGraphByLabels(graph, visibleLabels);
    return;
  }

  if (selectedNodeId === null || !graph.hasNode(selectedNodeId)) {
    filterGraphByLabels(graph, visibleLabels);
    return;
  }

  const reachable = getNodesWithinHops(graph, selectedNodeId, maxHops);
  const allowed = new Set(visibleLabels);

  graph.forEachNode((nid, attrs) => {
    const labelOk = allowed.has(attrs.nodeType);
    const depthOk = reachable.has(nid);
    graph.setNodeAttribute(nid, 'hidden', !labelOk || !depthOk);
  });
};
