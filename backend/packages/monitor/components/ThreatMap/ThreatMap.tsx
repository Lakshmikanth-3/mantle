'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { ProtocolState } from '../../app/page';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  address: string;
  riskScore: number;
  band: ProtocolState['band'];
  exposure: number;
  invariantStatus: ProtocolState['invariantStatus'];
  radius: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  value: number; // collateral value USD
  source: string | Node;
  target: string | Node;
}

interface ThreatMapProps {
  protocols: ProtocolState[];
  onNodeClick: (protocolId: string | null) => void;
  alertProtocol: string | null;
}

const COLLATERAL_EDGES: { source: string; target: string; value: number }[] = [
  { source: 'rseth', target: 'aave', value: 134_000_000 },
  { source: 'meth', target: 'superportal', value: 80_000_000 },
  { source: 'byreal', target: 'superportal', value: 45_000_000 },
  { source: 'usdy', target: 'aave', value: 30_000_000 },
  { source: 'fluxion', target: 'byreal', value: 15_000_000 },
  { source: 'aave', target: 'superportal', value: 60_000_000 },
  { source: 'rseth', target: 'byreal', value: 20_000_000 },
];

function bandColor(band: ProtocolState['band']): string {
  switch (band) {
    case 'LOW': return '#00C896';
    case 'ELEVATED': return '#F5A623';
    case 'HIGH': return '#E57C3E';
    case 'CRITICAL': return '#E53E3E';
  }
}

function bandGlow(band: ProtocolState['band']): string {
  switch (band) {
    case 'LOW': return 'rgba(0, 200, 150, 0.5)';
    case 'ELEVATED': return 'rgba(245, 166, 35, 0.5)';
    case 'HIGH': return 'rgba(229, 124, 62, 0.5)';
    case 'CRITICAL': return 'rgba(229, 62, 62, 0.7)';
  }
}

export default function ThreatMap({ protocols, onNodeClick, alertProtocol }: ThreatMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  const drawGraph = useCallback(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const { width, height } = svgRef.current.getBoundingClientRect();
    svg.selectAll('*').remove();

    // Defs for filters
    const defs = svg.append('defs');

    protocols.forEach(p => {
      const filterId = `glow-${p.id}`;
      const filter = defs.append('filter').attr('id', filterId).attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', p.band === 'CRITICAL' ? 8 : 4).attr('result', 'blur');
      const feMerge = filter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'blur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    });

    const nodes: Node[] = protocols.map(p => {
      const exp = Number(p.exposure) || 0;
      return {
        ...p,
        // Calculate radius using real exposure. Fallback base radius is 22 to prevent NaN.
        radius: Math.max(22, Math.min(56, Math.sqrt(exp) / 500)),
      };
    });

    // Build links
    const links: Link[] = COLLATERAL_EDGES
      .filter(e => nodes.find(n => n.id === e.source) && nodes.find(n => n.id === e.target))
      .map(e => ({ ...e }));

    // ── Background grid ──────────────────────────────────────────────────────
    const gridGroup = svg.append('g').attr('class', 'grid');
    const gridSpacing = 60;
    for (let x = 0; x < width; x += gridSpacing) {
      gridGroup.append('line')
        .attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
        .attr('stroke', 'rgba(30, 37, 48, 0.6)').attr('stroke-width', 0.5);
    }
    for (let y = 0; y < height; y += gridSpacing) {
      gridGroup.append('line')
        .attr('x1', 0).attr('y1', y).attr('x2', width).attr('y2', y)
        .attr('stroke', 'rgba(30, 37, 48, 0.6)').attr('stroke-width', 0.5);
    }

    // ── Force simulation ─────────────────────────────────────────────────────
    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(d => {
        const v = d.value as number;
        return 120 + Math.min(80, v / 2_000_000);
      }).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<Node>(d => d.radius + 20))
      .alphaDecay(0.03);

    simulationRef.current = simulation;

    // ── Edges ────────────────────────────────────────────────────────────────
    const linkGroup = svg.append('g').attr('class', 'links');
    const linkPaths = linkGroup
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke-width', (d) => Math.max(1, Math.min(6, (d.value as number) / 25_000_000)))
      .attr('stroke-dasharray', '6 4')
      .attr('opacity', 0.5);

    // Animated dot on each edge
    const dotGroup = svg.append('g').attr('class', 'flow-dots');
    const dots = dotGroup.selectAll('circle').data(links).join('circle').attr('r', 3).attr('opacity', 0.8);

    // ── Nodes ────────────────────────────────────────────────────────────────
    const nodeGroup = svg.append('g').attr('class', 'nodes');

    const nodeGs = nodeGroup
      .selectAll<SVGGElement, Node>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.2).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      )
      .on('click', (_, d) => onNodeClick(d.id));

    // Pulse ring (for alert state) — drawn under the node
    nodeGs.append('circle')
      .attr('class', 'pulse-ring')
      .attr('r', d => d.radius + 8)
      .attr('fill', 'none')
      .attr('stroke', d => bandColor(d.band))
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .style('animation', d =>
        d.band === 'CRITICAL' || d.name === alertProtocol
          ? 'pulseRing 1.2s ease-out infinite'
          : ''
      );

    // Outer glow circle
    nodeGs.append('circle')
      .attr('r', d => d.radius + 4)
      .attr('fill', 'none')
      .attr('stroke', d => bandColor(d.band))
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.3);

    // Main node circle
    nodeGs.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => `rgba(${
        d.band === 'LOW' ? '0, 200, 150' :
        d.band === 'ELEVATED' ? '245, 166, 35' :
        d.band === 'HIGH' ? '229, 124, 62' : '229, 62, 62'
      }, 0.12)`)
      .attr('stroke', d => bandColor(d.band))
      .attr('stroke-width', d => d.band === 'CRITICAL' ? 2 : 1.5)
      .attr('filter', d => `url(#glow-${d.id})`)
      .style('animation', 'nodeBreath 2s ease-in-out infinite')
      .style('animation-delay', (_d, i) => `${i * 0.3}s`);

    // Risk score (large, centered)
    nodeGs.append('text')
      .text(d => d.riskScore)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', d => bandColor(d.band))
      .attr('font-family', 'DM Mono, monospace')
      .attr('font-size', d => d.radius > 40 ? 18 : 14)
      .attr('font-weight', '500');

    // Protocol name (below node)
    nodeGs.append('text')
      .text(d => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 16)
      .attr('fill', '#8892A4')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', 10)
      .attr('letter-spacing', '0.05em');

    // Band badge (above node)
    nodeGs.append('text')
      .text(d => d.band)
      .attr('text-anchor', 'middle')
      .attr('dy', d => -(d.radius + 10))
      .attr('fill', d => bandColor(d.band))
      .attr('font-family', 'DM Mono, monospace')
      .attr('font-size', 8)
      .attr('letter-spacing', '0.15em')
      .attr('opacity', 0.8);

    // ── SENTINEL watermark ───────────────────────────────────────────────────
    svg.append('text')
      .text('SENTINEL')
      .attr('x', 20).attr('y', 30)
      .attr('fill', '#00C896').attr('opacity', 0.7)
      .attr('font-family', 'DM Mono, monospace')
      .attr('font-size', 13)
      .attr('font-weight', '500')
      .attr('letter-spacing', '0.2em');

    svg.append('text')
      .text('AUTONOMOUS · ERC-8004 VERIFIED')
      .attr('x', 20).attr('y', 46)
      .attr('fill', '#4A5568')
      .attr('font-family', 'DM Mono, monospace')
      .attr('font-size', 8)
      .attr('letter-spacing', '0.15em');

    // ── Tick handler ─────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      linkPaths.attr('d', (d) => {
        const s = d.source as Node;
        const t = d.target as Node;
        const dx = (t.x ?? 0) - (s.x ?? 0);
        const dy = (t.y ?? 0) - (s.y ?? 0);
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
        return `M${s.x ?? 0},${s.y ?? 0}A${dr},${dr} 0 0,1 ${t.x ?? 0},${t.y ?? 0}`;
      });

      linkPaths.attr('stroke', (d) => {
        const s = d.source as Node;
        const t = d.target as Node;
        const worstBand = [s.band, t.band].sort((a, b) => {
          const order = { LOW: 0, ELEVATED: 1, HIGH: 2, CRITICAL: 3 };
          return order[b] - order[a];
        })[0];
        return bandColor(worstBand);
      });

      nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      // Animate flow dots along link paths
      const now = Date.now();
      dots.each(function (d) {
        const s = d.source as Node;
        const t = d.target as Node;
        const progress = ((now / 3000) % 1);
        const x = (s.x ?? 0) + ((t.x ?? 0) - (s.x ?? 0)) * progress;
        const y = (s.y ?? 0) + ((t.y ?? 0) - (s.y ?? 0)) * progress;
        d3.select(this).attr('cx', x).attr('cy', y)
          .attr('fill', bandColor((d.source as Node).band))
          .attr('opacity', 0.6 + Math.sin(progress * Math.PI) * 0.4);
      });
    });

    // Request animation frame for smooth dot movement
    const animateDots = () => {
      if (!svgRef.current) return;
      const now = Date.now();
      dots.each(function (d) {
        const s = d.source as Node;
        const t = d.target as Node;
        const progress = ((now / 3000) % 1);
        const x = (s.x ?? 0) + ((t.x ?? 0) - (s.x ?? 0)) * progress;
        const y = (s.y ?? 0) + ((t.y ?? 0) - (s.y ?? 0)) * progress;
        d3.select(this).attr('cx', x).attr('cy', y);
      });
      requestAnimationFrame(animateDots);
    };
    requestAnimationFrame(animateDots);
  }, [protocols, onNodeClick, alertProtocol]);

  useEffect(() => {
    drawGraph();
    const observer = new ResizeObserver(drawGraph);
    if (svgRef.current?.parentElement) observer.observe(svgRef.current.parentElement);
    return () => {
      observer.disconnect();
      simulationRef.current?.stop();
    };
  }, [drawGraph]);

  return (
    <div style={{
      position: 'relative',
      background: 'var(--bg)',
      borderLeft: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
