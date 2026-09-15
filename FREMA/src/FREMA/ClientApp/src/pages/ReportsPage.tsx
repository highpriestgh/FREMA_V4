import { useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/useApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ReportsSkeleton } from "@/components/layout/PageSkeletons";

interface Report {
  from: string;
  to: string;
  summary: {
    created: number;
    completed: number;
    abandoned: number;
    openNow: number;
    overdueNow: number;
    averageTurnaroundHours: number | null;
    medianTurnaroundHours: number | null;
  };
  byDepartment: {
    department: string;
    acted: number;
    approved: number;
    returned: number;
    averageHoursToAct: number | null;
    pendingNow: number;
    overdueNow: number;
  }[];
  byStep: {
    workflow: string;
    step: string;
    acted: number;
    averageHoursToAct: number | null;
    returned: number;
  }[];
  aging: { label: string; count: number }[];
  trend: { date: string; created: number; completed: number }[];
}

const ranges = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
] as const;

/** Hours as the most readable unit: "45 min", "6.5 h", "3.2 days". */
function duration(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function ReportsPage() {
  const [days, setDays] = useState<number>(30);

  // Recomputed per selection, rounded to the hour so the request is stable while open.
  const from = useMemo(() => {
    const d = new Date(Date.now() - days * 86_400_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }, [days]);

  const { data, loading, initialLoading } = useApi<Report>(`/api/reports?from=${encodeURIComponent(from)}`, [from]);
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Throughput, turnaround and where documents wait. Counts only — no document contents."
      />

      {/* Filters sit in one row above everything they affect. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
        {ranges.map((r) => (
          <Button
            key={r.days}
            size="sm"
            variant={days === r.days ? "default" : "outline"}
            aria-pressed={days === r.days}
            onClick={() => setDays(r.days)}
          >
            Last {r.label}
          </Button>
        ))}
        {loading && !initialLoading && <span className="text-muted-foreground text-sm">Updating…</span>}
      </div>

      {initialLoading ? <ReportsSkeleton /> : (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Tile label="Registered" value={s?.created} />
            <Tile label="Approved" value={s?.completed} />
            <Tile label="Abandoned" value={s?.abandoned} />
            <Tile label="Open now" value={s?.openNow} hint="not limited to the range" />
            <Tile label="Overdue now" value={s?.overdueNow} hint="assignments past due" />
            <Tile
              label="Median turnaround"
              value={s ? duration(s.medianTurnaroundHours) : undefined}
              hint={s?.averageTurnaroundHours != null ? `average ${duration(s.averageTurnaroundHours)}` : undefined}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Registered and approved per day</CardTitle>
              </CardHeader>
              <CardContent>{data && <TrendChart points={data.trend} />}</CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Age of open documents</CardTitle>
              </CardHeader>
              <CardContent>{data && <AgingBars buckets={data.aging} />}</CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Slowest steps</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Decisions</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Average wait</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.byStep.map((row) => (
                    <TableRow key={`${row.workflow}/${row.step}`}>
                      <TableCell className="font-medium">{row.step}</TableCell>
                      <TableCell className="text-muted-foreground">{row.workflow}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.acted}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.returned}</TableCell>
                      <TableCell className="text-right tabular-nums">{duration(row.averageHoursToAct)}</TableCell>
                    </TableRow>
                  ))}
                  {data?.byStep.length === 0 && <Empty colSpan={5} />}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">By department</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Decisions</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Average wait</TableHead>
                    <TableHead className="text-right">Waiting now</TableHead>
                    <TableHead className="text-right">Overdue now</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.byDepartment.map((row) => (
                    <TableRow key={row.department}>
                      <TableCell className="font-medium">{row.department}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.acted}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.approved}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.returned}</TableCell>
                      <TableCell className="text-right tabular-nums">{duration(row.averageHoursToAct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.pendingNow}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", row.overdueNow > 0 && "text-destructive font-medium")}>
                        {row.overdueNow}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.byDepartment.length === 0 && <Empty colSpan={7} />}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number | string | undefined; hint?: string }) {
  return (
    <Card className="py-0">
      <CardContent className="p-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Empty({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-muted-foreground py-8 text-center">
        No activity in this range.
      </TableCell>
    </TableRow>
  );
}

// --- Charts --------------------------------------------------------------------
// Two series, validated for colour-vision deficiency on the light and dark surfaces
// (blue #2a78d6 / orange #eb6834; dark #3987e5 / #d95926). Identity is never colour
// alone: a legend, direct end labels, and a table view all name the series.

const series = [
  { key: "created", label: "Registered", color: "var(--viz-1)" },
  { key: "completed", label: "Approved", color: "var(--viz-2)" },
] as const;

function TrendChart({ points }: { points: Report["trend"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 640, H = 220, padL = 32, padR = 76, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const max = Math.max(1, ...points.flatMap((p) => [p.created, p.completed]));
  // Whole-number ticks: these are counts of documents.
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;

  const x = (i: number) => padL + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / top) * innerH;

  const path = (key: "created" | "completed") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  const last = points.length - 1;
  const endLabels = series.map((s) => ({ ...s, y: y(points[last]?.[s.key] ?? 0) }));
  // Nudge end labels apart when the two lines finish at the same height.
  if (Math.abs(endLabels[0].y - endLabels[1].y) < 14) {
    endLabels[0].y -= 7;
    endLabels[1].y += 7;
  }

  return (
    <div className="viz-root space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-sm" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="text-muted-foreground flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-64 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Registered</TableHead>
                <TableHead className="text-right">Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p) => (
                <TableRow key={p.date}>
                  <TableCell>{fmt(p.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.created}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.completed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-none"
            role="img"
            aria-label={`Documents registered and approved per day, ${fmt(points[0]?.date ?? "")} to ${fmt(points[last]?.date ?? "")}`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {[0, 1, 2, 3, 4].map((t) => (
              <g key={t}>
                <line x1={padL} x2={padL + innerW} y1={y(t * step)} y2={y(t * step)} className="stroke-border" strokeWidth={1} />
                <text x={padL - 8} y={y(t * step)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {t * step}
                </text>
              </g>
            ))}

            {[0, Math.floor(last / 2), last].filter((v, i, a) => a.indexOf(v) === i && points[v]).map((i) => (
              <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
                {fmt(points[i].date)}
              </text>
            ))}

            {series.map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {endLabels.map((s) => (
              <text key={s.key} x={padL + innerW + 8} y={s.y} dy="0.32em" className="fill-muted-foreground text-[11px]">
                {s.label}
              </text>
            ))}

            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} className="stroke-foreground/30" strokeWidth={1} />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(points[hover][s.key])} r={4.5} fill={s.color} className="stroke-card" strokeWidth={2} />
                ))}
              </g>
            )}

            {/* Transparent hit area wider than the lines themselves. */}
            <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" />
          </svg>

          {hover !== null && (
            <div
              className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-md border px-3 py-2 text-xs shadow-md"
              style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
            >
              <p className="mb-1 font-medium">{fmt(points[hover].date)}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="tabular-nums">{points[hover][s.key]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One series of ordered buckets: a single hue, values labelled, no legend needed. */
function AgingBars({ buckets }: { buckets: Report["aging"] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const [hover, setHover] = useState<string | null>(null);

  return (
    <ul className="viz-root space-y-3">
      {buckets.map((b) => (
        <li
          key={b.label}
          className="space-y-1"
          onPointerEnter={() => setHover(b.label)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">{b.label}</span>
            <span className={cn("tabular-nums", hover === b.label && "font-medium")}>{b.count}</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${(b.count / max) * 100}%`, background: "var(--viz-1)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
