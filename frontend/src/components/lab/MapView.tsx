"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getLegalMap } from "@/lib/api";
import { layout, lawColor, neighbours, nodeRadius, searchNodes } from "@/lib/graphLayout";
import type { GraphNode, LegalGraph } from "@/types/legalLab";
import { AiHero } from "@/components/ai/AiHero";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { trendText } from "@/components/lab/LabBits";

const LW = 1000;
const LH = 700;

export function MapView() {
  const [graph, setGraph] = useState<LegalGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const { w: W, h: H } = size;

  useEffect(() => {
    let cancelled = false;
    getLegalMap()
      .then((g) => !cancelled && setGraph(g))
      .catch(() => !cancelled && setError("Bilgi haritası yüklenemedi."));
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = !!graph;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const model = useMemo(() => {
    if (!graph) return null;
    const pos = layout(graph.nodes, graph.edges, LW, LH);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const laws = [...new Set(graph.nodes.map((n) => n.law))].sort();
    return { pos, byId, laws };
  }, [graph]);

  const focus = useMemo(() => {
    if (!graph || !selected) return null;
    const nb = neighbours(selected, graph.edges);
    return { nb, set: new Set([selected, ...nb.keys()]) };
  }, [graph, selected]);

  // Focus mode: neighbours are re-placed on a ring around the selected node so labels never collide.
  const ring = useMemo(() => {
    const out = new Map<string, { x: number; y: number; ang: number; r: number }>();
    if (!focus || !selected || !model) return { pos: out, R: 0 };
    const c = model.pos.get(selected)!;
    const ids = [...focus.nb.entries()].sort((a, b) => b[1].w - a[1].w).map(([id]) => id);
    const R = Math.min(300, Math.max(150, ids.length * 26));
    ids.forEach((id, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(1, ids.length)) * Math.PI * 2;
      out.set(id, { x: c.x + Math.cos(ang) * R, y: c.y + Math.sin(ang) * R, ang, r: R });
    });
    return { pos: out, R };
  }, [focus, selected, model]);

  useEffect(() => {
    if (!selected || !model) return;
    const c = model.pos.get(selected)!;
    const k = Math.max(0.5, Math.min(2.2, (W / 2 - 140) / (ring.R + 10), (H / 2 - 50) / (ring.R + 10)));
    setView({ k, x: W / 2 - c.x * k, y: H / 2 - c.y * k });
  }, [selected, model, ring.R, W, H]);

  // No selection: fit the whole map.
  useEffect(() => {
    if (selected) return;
    const k = Math.min(W / LW, H / LH);
    setView({ k, x: (W - LW * k) / 2, y: (H - LH * k) / 2 });
  }, [selected, W, H]);

  const at = (id: string) => ring.pos.get(id) ?? model!.pos.get(id)!;

  const hits = useMemo(() => (graph ? searchNodes(graph.nodes, query) : []), [graph, query]);
  const sel = selected && model ? model.byId.get(selected) ?? null : null;

  function pick(id: string) {
    if (!model) return;
    setSelected(id);
  }

  function onWheel(e: React.WheelEvent) {
    const k = Math.max(0.6, Math.min(5, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return setView({ ...view, k });
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    setView({ k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k });
  }

  if (error) return <ErrorState message={error} />;
  if (!graph || !model) return <LoadingState label="Bilgi haritası yükleniyor..." />;

  return (
    <div className="space-y-5">
      <AiHero
        compact
        title="Bilgi Haritası"
        description="Yargıtay hukuk kararlarında birlikte anılan kanun maddeleri. Bir maddeyi seçin: bağlı maddeler ve bozulma bağlamı belirir."
        stats={[
          { label: "Karar", value: graph.meta.decisions },
          { label: "Madde", value: graph.meta.articles },
          { label: "Bağ", value: graph.meta.edges },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-surface-border bg-white p-3 shadow-card">
          <div className="relative mb-3">
            <label htmlFor="map-q" className="sr-only">
              Madde ara
            </label>
            <input
              id="map-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Madde ara: HMK 190, TBK 97, ispat yükü…"
              className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
            />
            {hits.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-surface-border bg-white shadow-card">
                {hits.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        pick(n.id);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent-50"
                    >
                      <span className="truncate">
                        <span className="font-semibold text-navy-900">{n.code}</span>
                        <span className="text-navy-500"> · {n.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-navy-400">{n.tot} karar</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Kanun maddeleri bilgi haritası"
            className={`h-[34rem] w-full touch-none select-none rounded-xl bg-navy-50 ${drag.current ? "cursor-grabbing" : "cursor-grab"}`}
            onWheel={onWheel}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              const rect = svgRef.current?.getBoundingClientRect();
              if (!d || !rect) return;
              setView((v) => ({ ...v, x: d.vx + ((e.clientX - d.x) / rect.width) * W, y: d.vy + ((e.clientY - d.y) / rect.height) * H }));
            }}
            onPointerUp={() => (drag.current = null)}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {graph.edges.map((e) => {
                if (!model.pos.get(e.s) || !model.pos.get(e.t)) return null;
                const a = at(e.s);
                const b = at(e.t);
                const on = focus ? e.s === selected || e.t === selected : false;
                return (
                  <g key={`${e.s}-${e.t}`}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={on ? "#007eac" : "#94a6bc"}
                      strokeWidth={on ? 2.6 : 0.8 + e.j * 1.4}
                      opacity={focus ? (on ? 1 : 0.06) : 0.45}
                    />
                  </g>
                );
              })}
              {graph.nodes.map((n) => {
                const p = at(n.id);
                const rg = ring.pos.get(n.id);
                const inFocus = !focus || focus.set.has(n.id);
                const isSel = n.id === selected;
                const r = nodeRadius(n) * (isSel ? 1.6 : focus && inFocus ? 1.25 : 1);
                return (
                  <g
                    key={n.id}
                    data-id={n.id}
                    transform={`translate(${p.x} ${p.y})`}
                    opacity={inFocus ? 1 : 0.18}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(n.id);
                    }}
                  >
                    <title>{`${n.code} · ${n.title ?? ""} (${n.tot} karar)`}</title>
                    <circle r={r} fill={lawColor(n.law, model.laws)} stroke={isSel ? "#0f1a2e" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                    {(focus ? inFocus : n.n >= 120) && <NodeLabel n={n} r={r} sel={isSel} ang={rg?.ang} w={focus?.nb.get(n.id)?.w} focus={!!focus} />}
                  </g>
                );
              })}
            </g>
          </svg>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-600" aria-label="Kanun renkleri">
            {model.laws.slice(0, 10).map((l) => (
              <li key={l} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: lawColor(l, model.laws) }} />
                {l}
              </li>
            ))}
          </ul>
        </section>

        <SidePanel sel={sel} nb={focus?.nb ?? null} byId={model.byId} onPick={pick} />
      </div>
      <p className="text-[11px] text-navy-500">
        Veri: {graph.meta.source.replace('(PoC, descriptive stats only)', '(kavram kanıtı, yalnızca betimleyici istatistik)')}. Oranlar betimleyicidir: bir maddeye atıf yapan kararların kaçının bozulduğunu gösterir; nedensellik veya sonuç tahmini değildir.
      </p>
    </div>
  );
}

function SidePanel({
  sel,
  nb,
  byId,
  onPick,
}: {
  sel: GraphNode | null;
  nb: Map<string, { w: number }> | null;
  byId: Map<string, GraphNode>;
  onPick: (id: string) => void;
}) {
  if (!sel) {
    return (
      <aside className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-navy-900">Bir madde seçin</h2>
        <p className="mt-2 text-sm leading-6 text-navy-500">
          Haritada bir noktaya tıklayın ya da yukarıdan arayın. Seçilen madde büyür, birlikte anıldığı maddeler ve bağlar öne çıkar, gerisi sönükleşir.
        </p>
      </aside>
    );
  }
  const trend = trendText(sel.boz != null && sel.tot >= 30 ? { n: sel.tot, boz: sel.boz, base: sel.base ?? 0, lift: sel.lift } : null);
  const rows = nb ? [...nb.entries()].sort((a, b) => b[1].w - a[1].w).slice(0, 12) : [];
  return (
    <aside className="max-h-[40rem] space-y-4 overflow-y-auto rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">{sel.law_name}</p>
        <h2 className="mt-1 text-lg font-semibold text-navy-900">
          {sel.code}
          {sel.title ? ` · ${sel.title}` : ""}
        </h2>
      </div>
      {sel.boz != null && sel.tot >= 30 ? (
        <div className="rounded-xl bg-accent-50 p-3 ring-1 ring-accent-100">
          <p className="text-2xl font-semibold text-accent-800">%{Math.round(sel.boz * 100)}</p>
          <p className="text-xs text-navy-600">{trend}</p>
        </div>
      ) : (
        <p className="text-xs text-navy-500">{sel.tot} kararda anılıyor. Bozulma oranı için karar sayısı yetersiz.</p>
      )}
      {sel.text && (
        <div>
          <h3 className="text-xs font-semibold text-navy-800">Madde metni</h3>
          <p className="mt-1 text-xs leading-5 text-navy-600">{sel.text}</p>
        </div>
      )}
      <div>
        <h3 className="text-xs font-semibold text-navy-800">Birlikte anıldığı maddeler</h3>
        {rows.length === 0 ? (
          <p className="mt-1 text-xs text-navy-500">Bu madde için güçlü bir birlikte anılma bağı yok.</p>
        ) : (
          <ul className="mt-1 divide-y divide-surface-border">
            {rows.map(([id, e]) => {
              const n = byId.get(id);
              if (!n) return null;
              return (
                <li key={id}>
                  <button type="button" onClick={() => onPick(id)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-xs hover:text-accent-700">
                    <span className="truncate">
                      <span className="font-semibold">{n.code}</span> · {n.title}
                    </span>
                    <span className="shrink-0 text-navy-400">{e.w} karar</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {sel.ex.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-navy-800">İlgili kararlar</h3>
          <ul className="mt-1 space-y-1 text-xs text-navy-600">
            {sel.ex.map((x) => (
              <li key={x.id}>
                {x.ch} · {x.esas} E. {x.karar} K. · {x.date}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function clip(t: string, n: number) {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Label placed outward from the ring centre; white halo keeps it readable over lines and dots. */
function NodeLabel({ n, r, sel, ang, w, focus }: { n: GraphNode; r: number; sel: boolean; ang?: number; w?: number; focus: boolean }) {
  const halo = { paintOrder: "stroke", stroke: "#f5f7fa", strokeWidth: 4, strokeLinejoin: "round", pointerEvents: "none" } as const;
  const title = focus && n.title ? clip(n.title, 30) : "";
  if (ang === undefined) {
    return (
      <text y={r + 14} textAnchor="middle" fontSize={focus ? 13 : 10} fontWeight={sel ? 700 : 500} fill="#0f1a2e" style={halo}>
        {n.code}
        {sel && title ? <tspan x={0} dy={15} fontWeight={500} fontSize={12}>{title}</tspan> : null}
      </text>
    );
  }
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
  const x = cos > 0.3 ? r + 6 : cos < -0.3 ? -r - 6 : 0;
  const y = Math.abs(cos) <= 0.3 ? (sin > 0 ? r + 14 : -r - 22) : 4;
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={12} fill="#0f1a2e" style={halo}>
      <tspan fontWeight={700}>{n.code}</tspan>
      {title ? <tspan x={x} dy={14} fontWeight={500}>{title}</tspan> : null}
      {w ? <tspan x={x} dy={13} fontSize={11} fill="#007eac" fontWeight={600}>{w} kararda birlikte</tspan> : null}
    </text>
  );
}
