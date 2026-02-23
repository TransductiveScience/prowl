import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  Search,
  Filter,
  PanelLeftClose,
  PanelLeft,
  Box,
  Braces,
  Variable,
  Hash,
  Target,
} from 'lucide-react';
import { useAppState } from '../hooks/useAppState';
import { FILTERABLE_LABELS, NODE_COLORS, ALL_EDGE_TYPES, EDGE_INFO, type EdgeType } from '../lib/constants';
import { GraphNode, NodeLabel } from '../core/graph/types';
import { LanguageIcon } from './LanguageIcon';

/* ── Tree data structure ────────────────────────────── */

interface TreeEntry {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  fullPath: string;
  subtree: TreeEntry[];
  source?: GraphNode;
}

function buildFileTree(nodes: GraphNode[]): TreeEntry[] {
  const roots: TreeEntry[] = [];
  const lookup = new Map<string, TreeEntry>();

  const fsNodes = nodes
    .filter(n => n.label === 'Folder' || n.label === 'File')
    .sort((a, b) => a.properties.filePath.localeCompare(b.properties.filePath));

  for (const gn of fsNodes) {
    const segments = gn.properties.filePath.split('/').filter(Boolean);
    let pathSoFar = '';
    let level = roots;

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;

      let entry = lookup.get(pathSoFar);
      if (!entry) {
        const isTail = idx === segments.length - 1;
        const isFileTail = isTail && gn.label === 'File';

        entry = {
          id: isTail ? gn.id : pathSoFar,
          name: seg,
          kind: isFileTail ? 'file' : 'folder',
          fullPath: pathSoFar,
          subtree: [],
          source: isTail ? gn : undefined,
        };

        lookup.set(pathSoFar, entry);
        level.push(entry);
      }

      level = entry.subtree;
    }
  }

  return roots;
}

function collectDescendantIds(node: TreeEntry): string[] {
  const ids: string[] = [];
  if (node.kind === 'file' && node.source) {
    ids.push(node.source.id);
  }
  for (const child of node.subtree) {
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

/* ── Icon lookup ────────────────────────────────────── */

const LABEL_ICONS: Record<string, typeof Folder> = {
  Folder: Folder,
  File: FileCode,
  Class: Box,
  Function: Braces,
  Method: Braces,
  Interface: Hash,
  Import: FileCode,
};

function pickIcon(label: NodeLabel) {
  return LABEL_ICONS[label] ?? Variable;
}

/* ── Single tree row (recursive) ────────────────────── */

function TreeRow({
  entry,
  indent,
  filter,
  onSelect,
  openPaths,
  onToggle,
  activePath,
}: {
  entry: TreeEntry;
  indent: number;
  filter: string;
  onSelect: (n: TreeEntry) => void;
  openPaths: Set<string>;
  onToggle: (p: string) => void;
  activePath: string | null;
}) {
  const isOpen = openPaths.has(entry.fullPath);
  const selected = activePath === entry.fullPath;
  const hasKids = entry.subtree.length > 0;

  const childrenRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(isOpen);
  const [height, setHeight] = useState<number | 'auto'>(isOpen ? 'auto' : 0);

  useLayoutEffect(() => {
    if (isOpen) setRendered(true);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!childrenRef.current) return;
    if (isOpen && rendered) {
      setHeight(0);
      requestAnimationFrame(() => {
        if (!childrenRef.current) return;
        const h = childrenRef.current.scrollHeight;
        requestAnimationFrame(() => setHeight(h));
      });
    } else if (!isOpen && rendered) {
      const h = childrenRef.current.scrollHeight;
      setHeight(h);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [isOpen, rendered]);

  const handleTransitionEnd = () => {
    if (!isOpen) setRendered(false);
    if (isOpen) setHeight('auto');
  };

  const visibleChildren = useMemo(() => {
    if (!filter) return entry.subtree;
    const needle = filter.toLowerCase();
    return entry.subtree.filter(c =>
      c.name.toLowerCase().includes(needle) ||
      c.subtree.some(gc => gc.name.toLowerCase().includes(needle))
    );
  }, [entry.subtree, filter]);

  const nameHit = filter.length > 0 && entry.name.toLowerCase().includes(filter.toLowerCase());

  const rowClasses = [
    'w-full flex items-center gap-1.5 px-2 py-1 text-left text-sm',
    'hover:bg-hover transition-colors rounded-lg relative border-l-2',
    selected ? 'bg-amber-500/15 text-amber-300 border-amber-400' : 'text-text-secondary hover:text-text-primary border-transparent',
    nameHit ? 'bg-accent/10' : '',
  ].join(' ');

  return (
    <div>
      <button
        onClick={() => { if (hasKids) onToggle(entry.fullPath); onSelect(entry); }}
        className={rowClasses}
        style={{ paddingLeft: `${indent * 12 + 8}px` }}
      >
        {hasKids ? (
          <ChevronRight
            className="w-3.5 h-3.5 shrink-0 text-text-muted transition-transform duration-150 ease-out"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        ) : (
          <span className="w-3.5" />
        )}

        {entry.kind === 'folder' ? (
          isOpen
            ? <FolderOpen className="w-4 h-4 shrink-0" style={{ color: NODE_COLORS.Folder }} />
            : <Folder className="w-4 h-4 shrink-0" style={{ color: NODE_COLORS.Folder }} />
        ) : (
          <LanguageIcon filename={entry.name} size={16} />
        )}

        <span className="truncate font-mono text-xs">{entry.name}</span>
      </button>

      {hasKids && rendered && (
        <div
          ref={childrenRef}
          onTransitionEnd={handleTransitionEnd}
          style={{
            height: height === 'auto' ? 'auto' : `${height}px`,
            opacity: isOpen ? 1 : 0,
            overflow: 'hidden',
            transition: height === 'auto' ? 'none' : 'height 150ms ease-out, opacity 150ms ease-out',
          }}
        >
          {visibleChildren.map(child => (
            <TreeRow
              key={child.id}
              entry={child}
              indent={indent + 1}
              filter={filter}
              onSelect={onSelect}
              openPaths={openPaths}
              onToggle={onToggle}
              activePath={activePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Panel component ────────────────────────────────── */

interface FileTreePanelProps {
  onFocusNode: (nodeId: string) => void;
}

export const FileTreePanel = ({ onFocusNode }: FileTreePanelProps) => {
  const {
    graph,
    visibleLabels,
    toggleLabelVisibility,
    visibleEdgeTypes,
    toggleEdgeVisibility,
    selectedNode,
    setSelectedNode,
    openCodePanel,
    depthFilter,
    setDepthFilter,
    setHighlightedNodeIds,
  } = useAppState();

  const [collapsed, setCollapsed] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'files' | 'filters'>('filters');

  const tree = useMemo(() => {
    if (!graph) return [];
    return buildFileTree(graph.nodes);
  }, [graph]);

  useEffect(() => {
    if (tree.length > 0 && openPaths.size === 0) {
      setOpenPaths(new Set(tree.map(n => n.fullPath)));
    }
  }, [tree.length]);

  useEffect(() => {
    const fp = selectedNode?.properties?.filePath;
    if (!fp) return;

    const parts = fp.split('/').filter(Boolean);
    const ancestors: string[] = [];
    let accum = '';
    for (let i = 0; i < parts.length - 1; i++) {
      accum = accum ? `${accum}/${parts[i]}` : parts[i];
      ancestors.push(accum);
    }

    if (ancestors.length > 0) {
      setOpenPaths(prev => {
        const updated = new Set(prev);
        for (const a of ancestors) updated.add(a);
        return updated;
      });
    }
  }, [selectedNode?.id]);

  const togglePath = useCallback((path: string) => {
    setOpenPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: TreeEntry) => {
    if (node.kind === 'folder') {
      const childIds = collectDescendantIds(node);
      if (childIds.length > 0) setHighlightedNodeIds(new Set(childIds));
    } else if (node.source) {
      const alreadySelected = selectedNode?.id === node.source.id;
      setSelectedNode(node.source);
      openCodePanel();
      if (!alreadySelected) onFocusNode(node.source.id);
    }
  }, [setSelectedNode, openCodePanel, onFocusNode, selectedNode, setHighlightedNodeIds]);

  const activePath = selectedNode?.properties.filePath || null;

  const HOP_OPTIONS = [
    { val: null as number | null, text: 'All' },
    { val: 1, text: '1 hop' },
    { val: 2, text: '2 hops' },
    { val: 3, text: '3 hops' },
    { val: 5, text: '5 hops' },
  ];

  const LEGEND_KINDS: NodeLabel[] = ['Folder', 'File', 'Class', 'Function', 'Interface', 'Method'];

  return (
    <div
      className={`h-full shrink-0 border-r border-white/[0.08] overflow-hidden transition-[width,background-color] duration-200 ease-out relative ${
        collapsed ? 'bg-surface' : 'bg-void'
      }`}
      style={{ width: collapsed ? 48 : 256 }}
    >
      {/* ── Collapsed icon rail ── */}
      <div className={`absolute inset-0 flex flex-col items-center py-3 gap-2 transition-opacity duration-150 ${
        collapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded-lg transition-colors"
          title="Expand Panel"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
        <div className="w-6 h-px bg-border-subtle my-1" />
        <button
          onClick={() => { setCollapsed(false); setTab('files'); }}
          className={`p-2 rounded-lg transition-colors ${tab === 'files' ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text-primary hover:bg-hover'}`}
          title="File Explorer"
        >
          <Folder className="w-5 h-5" />
        </button>
        <button
          onClick={() => { setCollapsed(false); setTab('filters'); }}
          className={`p-2 rounded-lg transition-colors ${tab === 'filters' ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text-primary hover:bg-hover'}`}
          title="Filters"
        >
          <Filter className="w-5 h-5" />
        </button>
      </div>

      {/* ── Expanded panel body ── */}
      <div
        className={`h-full flex flex-col transition-opacity duration-150 ${
          collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        style={{ width: 256 }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-1">
            {(['filters', 'files'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  tab === t
                    ? 'bg-white/[0.1] text-text-primary'
                    : 'text-text-muted hover:text-text-secondary hover:bg-hover'
                }`}
              >
                {t === 'filters' ? 'Graph' : 'Files'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-hover rounded-lg transition-colors"
            title="Collapse Panel"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {tab === 'files' && (
          <>
            <div className="px-3 py-2 border-b border-border-subtle shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-elevated border border-border-subtle rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
              {tree.length === 0 ? (
                <div className="px-3 py-4 text-center text-text-muted text-xs">No files loaded</div>
              ) : (
                tree.map(node => (
                  <TreeRow
                    key={node.id}
                    entry={node}
                    indent={0}
                    filter={searchQuery}
                    onSelect={handleSelect}
                    openPaths={openPaths}
                    onToggle={togglePath}
                    activePath={activePath}
                  />
                ))
              )}
            </div>
          </>
        )}

        {tab === 'filters' && (
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
            <div className="mb-4">
              <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                <Target className="w-3 h-3 inline mr-1" />
                Hop Depth
              </h3>
              <div className="flex gap-1">
                {HOP_OPTIONS.map(({ val, text }) => (
                  <button
                    key={text}
                    onClick={() => setDepthFilter(val)}
                    className={`flex-1 px-1.5 py-1 text-[10px] rounded-lg transition-colors text-center ${
                      depthFilter === val
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        : 'bg-white/[0.04] text-text-muted hover:bg-hover border border-transparent'
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {depthFilter !== null && !selectedNode && (
                <p className="mt-1.5 text-[10px] text-amber-400/80">Select a node first</p>
              )}
            </div>

            <div className="mb-4 flex flex-wrap gap-x-2.5 gap-y-1 px-1">
              {LEGEND_KINDS.map(label => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-1.5 h-3 rounded-sm" style={{ backgroundColor: NODE_COLORS[label] }} />
                  <span className="text-[9px] text-text-muted">{label}</span>
                </div>
              ))}
            </div>

            <div className="mb-1">
              <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Nodes
              </h3>
            </div>

            <div className="flex flex-col gap-0.5">
              {FILTERABLE_LABELS.map(label => {
                const Ico = pickIcon(label);
                const on = visibleLabels.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleLabelVisibility(label)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      on ? 'bg-elevated text-text-primary' : 'text-text-muted hover:bg-hover hover:text-text-secondary'
                    }`}
                  >
                    <div
                      className={`w-2 h-4 rounded-sm ${on ? '' : 'opacity-30'}`}
                      style={{ backgroundColor: NODE_COLORS[label] }}
                    />
                    <Ico className="w-3.5 h-3.5" style={{ color: on ? NODE_COLORS[label] : undefined }} />
                    <span className="text-xs flex-1">{label}</span>
                    <div className={`w-5 h-3 rounded-full transition-colors flex items-center ${on ? 'bg-white/20 justify-end' : 'bg-white/5 justify-start'}`}>
                      <div className={`w-2.5 h-2.5 rounded-full mx-px transition-colors ${on ? 'bg-white/80' : 'bg-white/20'}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border-subtle">
              <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Edges
              </h3>

              <div className="flex flex-col gap-0.5">
                {ALL_EDGE_TYPES.map(et => {
                  const meta = EDGE_INFO[et];
                  const on = visibleEdgeTypes.includes(et);
                  return (
                    <button
                      key={et}
                      onClick={() => toggleEdgeVisibility(et)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        on ? 'bg-elevated text-text-primary' : 'text-text-muted hover:bg-hover hover:text-text-secondary'
                      }`}
                    >
                      <div
                        className={`w-4 h-0.5 rounded-full ${on ? '' : 'opacity-30'}`}
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-xs flex-1">{meta.label}</span>
                      <div className={`w-5 h-3 rounded-full transition-colors flex items-center ${on ? 'bg-white/20 justify-end' : 'bg-white/5 justify-start'}`}>
                        <div className={`w-2.5 h-2.5 rounded-full mx-px transition-colors ${on ? 'bg-white/80' : 'bg-white/20'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {graph && (
          <div className="px-3 py-2 border-t border-border-subtle bg-elevated/50 shrink-0">
            <div className="flex items-center justify-between text-[10px] text-text-muted">
              <span>{graph.nodes.length} nodes</span>
              <span>{graph.relationships.length} edges</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
