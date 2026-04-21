"use client";

import { useMemo, useState } from "react";
import {
  type LucideIcon,
  AlertTriangle,
  BarChart3,
  CircleAlert,
  Clock,
  HandCoins,
  Package,
  ShoppingCart,
  Star,
  Truck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ReportTab = "purchase" | "stock" | "supplier";

const PRIMARY = "#0d9488";
const LINE_OUT = "#64748b";

type PurchaseOrder = {
  po: string;
  supplierName: string;
  source: string;
  requestType: "Product" | "Service" | "Training";
  totalAmount: number;
  status: string;
  createdAt: string;
};

type StockPosition = {
  item: string;
  itemKind: "Item" | "Tool" | "Asset";
  category: string;
  availableQuantity: number;
  reserved: number;
  location: string;
  status: string;
};

type SupplierRecord = {
  supplierName: string;
  category: string;
  orders: number;
  totalSpend: number;
  onTimeDeliveryRate: number;
  rating: number;
  completionPct: number;
  status: "Strong" | "Watch";
};

/** movementDate bucket · quantity by type IN | OUT */
type StockMovementBucket = { movementDate: string; IN: number; OUT: number };

function parseIsoDate(s: string): Date {
  const d = new Date(s + "T12:00:00");
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000) + 1);
}

function formatUsdCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function formatUsdFull(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function niceStep(max: number, ticks: number): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const pow10 = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow10;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * pow10;
}

function monthBucketKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function aggregatePurchaseSpendByPeriod(
  orders: PurchaseOrder[],
  rangeStart: Date,
  rangeEnd: Date,
): { granularity: "daily" | "monthly"; labels: string[]; totals: number[] } {
  const rangeStartDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const rangeEndDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
  const spanDays = daysBetweenInclusive(rangeStartDay, rangeEndDay);
  const granularity: "daily" | "monthly" = spanDays > 45 ? "monthly" : "daily";

  const inRange = orders.filter((o) => {
    const t = parseIsoDate(o.createdAt).getTime();
    return t >= rangeStartDay.getTime() && t <= rangeEndDay.getTime();
  });

  if (granularity === "monthly") {
    const map = new Map<string, number>();
    for (const o of inRange) {
      const k = monthBucketKey(parseIsoDate(o.createdAt));
      map.set(k, (map.get(k) ?? 0) + o.totalAmount);
    }
    const labels: string[] = [];
    const totals: number[] = [];
    const cur = new Date(rangeStartDay.getFullYear(), rangeStartDay.getMonth(), 1);
    const endMonth = new Date(rangeEndDay.getFullYear(), rangeEndDay.getMonth(), 1);
    while (cur <= endMonth) {
      const k = monthBucketKey(cur);
      labels.push(cur.toLocaleString("en-US", { month: "short", year: "numeric" }));
      totals.push(map.get(k) ?? 0);
      cur.setMonth(cur.getMonth() + 1);
    }
    return { granularity: "monthly", labels, totals };
  }

  const dayMap = new Map<string, number>();
  for (const o of inRange) {
    dayMap.set(o.createdAt, (dayMap.get(o.createdAt) ?? 0) + o.totalAmount);
  }
  const labels: string[] = [];
  const totals: number[] = [];
  const cur = new Date(rangeStartDay);
  while (cur <= rangeEndDay) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    labels.push(`${cur.getMonth() + 1}/${cur.getDate()}`);
    totals.push(dayMap.get(key) ?? 0);
    cur.setDate(cur.getDate() + 1);
  }
  return { granularity: "daily", labels, totals };
}

function aggregateSpendByRequestType(orders: PurchaseOrder[]): { label: string; amount: number }[] {
  const keys: ("Product" | "Service" | "Training")[] = ["Product", "Service", "Training"];
  const map = new Map<string, number>();
  for (const o of orders) {
    map.set(o.requestType, (map.get(o.requestType) ?? 0) + o.totalAmount);
  }
  return keys.map((label) => ({ label, amount: map.get(label) ?? 0 }));
}

function spendMixSegments(orders: PurchaseOrder[]): { label: string; pct: number; amount: number; color: string }[] {
  const colors = [PRIMARY, "#14b8a6", "#5eead4", "#99f6e4", "#ccfbf1"];
  const byType = aggregateSpendByRequestType(orders);
  const total = byType.reduce((s, x) => s + x.amount, 0);
  if (total <= 0) {
    const n = byType.length || 1;
    const each = Math.round((1000 / n) * 10) / 10;
    return byType.map((x, i) => ({
      label: x.label,
      amount: 0,
      pct: i === n - 1 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each,
      color: colors[i % colors.length]!,
    }));
  }
  return byType.map((x, i) => ({
    label: x.label,
    amount: x.amount,
    pct: Math.round((x.amount / total) * 1000) / 10,
    color: colors[i % colors.length]!,
  }));
}

function aggregateStockByCategory(positions: StockPosition[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const p of positions) {
    map.set(p.category, (map.get(p.category) ?? 0) + p.availableQuantity);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, value]) => ({ label: category, value }));
}

function ReportTabs({ tab, setTab }: { tab: ReportTab; setTab: (t: ReportTab) => void }) {
  const items: { id: ReportTab; label: string }[] = [
    { id: "purchase", label: "Purchase Reports" },
    { id: "stock", label: "Stock Reports" },
    { id: "supplier", label: "Supplier Performance" },
  ];
  return (
    <div className="flex flex-wrap gap-8">
      {items.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className="bg-transparent text-sm transition-colors"
        >
          <span
            className={cn(
              "inline-block border-b border-transparent pb-2 font-normal text-muted-foreground hover:text-foreground",
              tab === id && "border-[#0d9488] font-semibold text-[#0d9488]"
            )}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Match Dashboard / Procurement KPI stat tiles */
const KPI_STAT_CARD_CN = "border border-border bg-card py-0 shadow-none ring-0";
const KPI_STAT_CONTENT_CN =
  "flex min-h-[104px] flex-col justify-center gap-4 px-4 py-4 text-left";
const KPI_STAT_VALUE_CN = "text-xl font-semibold tabular-nums leading-tight text-foreground";
const KPI_STAT_LABEL_CN = "text-xs font-medium text-muted-foreground leading-snug";
const KPI_STAT_ICON_CN = "h-4 w-4 shrink-0 text-primary";

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <Card className={KPI_STAT_CARD_CN}>
      <CardContent className={KPI_STAT_CONTENT_CN}>
        <div className="flex items-start justify-between gap-2">
          <p className={KPI_STAT_VALUE_CN}>{value}</p>
          <Icon className={cn(KPI_STAT_ICON_CN)} aria-hidden />
        </div>
        <p className={KPI_STAT_LABEL_CN}>{label}</p>
      </CardContent>
    </Card>
  );
}

function LineChartDemo({
  label,
  xLabels,
  series,
  yTickFormat,
  chartSurfaceClassName,
  titleInSurface,
}: {
  label: string;
  xLabels: string[];
  series: { name: string; values: number[]; stroke?: string }[];
  yTickFormat: "usd" | "count" | "rating";
  chartSurfaceClassName?: string;
  titleInSurface?: boolean;
}) {
  const n = Math.max(1, xLabels.length);
  const normSeries = series.map((s) => ({
    ...s,
    values: Array.from({ length: n }, (_, i) => s.values[i] ?? 0),
  }));
  const allValues = normSeries.flatMap((s) => s.values);
  const dataMax = Math.max(1, ...allValues, 0);
  const step = niceStep(dataMax, 4);
  const yMax = Math.max(step, Math.ceil(dataMax / step) * step);

  const fmtY = (v: number) => {
    if (yTickFormat === "usd") return formatUsdCompact(v);
    if (yTickFormat === "rating") return v.toFixed(1);
    return formatNumber(v);
  };

  const vw = 520;
  const vh = 200;
  const ml = 52;
  const mr = 8;
  const mt = 8;
  const mb = 46;
  const cw = vw - ml - mr;
  const ch = vh - mt - mb;

  const yScale = (v: number) => mt + ch - (v / yMax) * ch;
  const xScale = (i: number) => ml + (n <= 1 ? cw / 2 : (i / (n - 1)) * cw);

  const tickCount = 4;
  const yTickVals = Array.from({ length: tickCount + 1 }, (_, i) => (yMax / tickCount) * i);

  const paths = normSeries.map((s) => ({
    ...s,
    pts: s.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" "),
  }));

  const xSkip = n > 14 ? Math.ceil(n / 10) : n > 10 ? 2 : 1;

  const surface = cn("rounded-lg px-3 py-4", chartSurfaceClassName ?? "bg-muted/60");
  const body = (
    <div className="w-full min-w-0">
      <svg viewBox={`0 0 ${vw} ${vh}`} className="h-auto w-full max-h-[220px]" role="img" aria-label={label}>
            <line x1={ml} y1={mt + ch} x2={ml + cw} y2={mt + ch} stroke="#cbd5e1" strokeWidth={1} />
            <line x1={ml} y1={mt} x2={ml} y2={mt + ch} stroke="#cbd5e1" strokeWidth={1} />
            {yTickVals.map((tv) => {
              const y = yScale(tv);
              return (
                <g key={tv}>
                  <line x1={ml} y1={y} x2={ml + cw} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                  <text x={ml - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
                    {fmtY(tv)}
                  </text>
                </g>
              );
            })}
            {xLabels.map((xl, i) =>
              i % xSkip === 0 || i === n - 1 ? (
                <text
                  key={xl + String(i)}
                  x={xScale(i)}
                  y={vh - 10}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[8px]"
                  transform={n > 12 ? `rotate(-28 ${xScale(i)} ${vh - 10})` : undefined}
                >
                  {xl}
                </text>
              ) : null,
            )}
            {paths.map((s) => (
              <polyline
                key={s.name}
                fill="none"
                stroke={s.stroke ?? PRIMARY}
                strokeWidth="2.25"
                points={s.pts}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
      </svg>
      {normSeries.length > 1 ? (
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          {normSeries.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.stroke ?? PRIMARY }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (titleInSurface) {
    return (
      <div className={cn("flex flex-col gap-5", surface)}>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {body}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className={surface}>{body}</div>
    </div>
  );
}

function formatHorizontalValue(mode: "currency" | "percent" | "number" | "rating", value: number): string {
  if (mode === "currency") return formatUsdFull(value);
  if (mode === "percent") return `${Math.round(value)}%`;
  if (mode === "rating") return value.toFixed(1);
  return formatNumber(value);
}

function BarChartDemo({
  title,
  items,
  horizontal,
  chartSurfaceClassName,
  titleInSurface,
  horizontalValueMode = "percent",
  verticalAxisFormat = "count",
  yScaleMax,
  formatBarValue,
}: {
  title: string;
  items: { label: string; value: number }[];
  horizontal?: boolean;
  chartSurfaceClassName?: string;
  titleInSurface?: boolean;
  horizontalValueMode?: "currency" | "percent" | "number" | "rating";
  /** Vertical: Y-axis tick and bar label format */
  verticalAxisFormat?: "currency" | "count" | "percent" | "rating";
  /** Vertical: fixed scale max (e.g. 100 for %, 5 for rating) */
  yScaleMax?: number;
  formatBarValue?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const scaleMax = yScaleMax != null ? Math.max(yScaleMax, max) : max;
  const surface = chartSurfaceClassName ?? "bg-muted/60";
  const fmtHorizontalBar =
    formatBarValue ?? ((v: number) => formatHorizontalValue(horizontalValueMode, v));
  const fmtVerticalBar =
    formatBarValue ??
    ((v: number) => {
      if (verticalAxisFormat === "currency") return formatUsdCompact(v);
      if (verticalAxisFormat === "percent") return `${Math.round(v)}%`;
      if (verticalAxisFormat === "rating") return v.toFixed(1);
      return formatNumber(v);
    });

  if (horizontal) {
    const rows = items.map((row) => (
      <div key={row.label} className="flex items-center gap-3 text-xs">
        <span className="w-32 shrink-0 truncate font-medium text-foreground" title={row.label}>
          {row.label}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(row.value / max) * 100}%`, backgroundColor: PRIMARY }}
          />
        </div>
        <span className="min-w-[4.5rem] shrink-0 text-right tabular-nums text-muted-foreground">
          {fmtHorizontalBar(row.value)}
        </span>
      </div>
    ));
    const inner = <div className="space-y-3">{rows}</div>;
    if (titleInSurface) {
      return (
        <div className={cn("flex flex-col gap-5 rounded-lg px-3 py-4", surface)}>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {inner}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className={cn("space-y-3 rounded-lg px-3 py-4", surface)}>{inner}</div>
      </div>
    );
  }

  const tickCount = 4;
  const yTickVals = Array.from({ length: tickCount + 1 }, (_, i) => (scaleMax / tickCount) * i);
  const bars = (
    <div className="flex gap-2">
      <div className="flex w-9 shrink-0 flex-col justify-between pb-7 pt-1 text-[9px] tabular-nums text-muted-foreground">
        {[...yTickVals].reverse().map((tv) => (
          <span key={tv} className="block text-right leading-none">
            {verticalAxisFormat === "currency"
              ? formatUsdCompact(tv)
              : verticalAxisFormat === "rating"
                ? tv.toFixed(1)
                : verticalAxisFormat === "percent"
                  ? `${Math.round(tv)}%`
                  : formatNumber(tv)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-44 items-end gap-2 border-b border-border pb-0.5 sm:gap-3">
          {items.map((row) => (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-medium tabular-nums text-foreground">
                {fmtVerticalBar(row.value)}
              </span>
              <div
                className="w-full max-w-[48px] rounded-t-sm sm:max-w-[52px]"
                style={{
                  height: `${Math.max(12, (row.value / scaleMax) * 120)}px`,
                  backgroundColor: PRIMARY,
                  opacity: 0.65 + (row.value / scaleMax) * 0.35,
                }}
              />
              <span className="max-w-[4.5rem] text-center text-[9px] leading-tight text-muted-foreground">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (titleInSurface) {
    return (
      <div className={cn("flex flex-col gap-5 rounded-lg px-3 py-4", surface)}>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {bars}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className={cn("rounded-lg px-4 pb-3 pt-4", surface)}>
        {bars}
      </div>
    </div>
  );
}

function PieChartDemo({
  title,
  segments,
  chartSurfaceClassName,
  titleInSurface,
}: {
  title: string;
  segments: { label: string; pct: number; amount?: number; color: string }[];
  chartSurfaceClassName?: string;
  titleInSurface?: boolean;
}) {
  const totalAmt = segments.reduce((s, x) => s + (x.amount ?? 0), 0);
  let accPct = 0;
  const gradientParts: string[] = [];
  for (const seg of segments) {
    const slice = totalAmt > 0 ? ((seg.amount ?? 0) / totalAmt) * 100 : 100 / Math.max(1, segments.length);
    const start = accPct;
    accPct += slice;
    gradientParts.push(`${seg.color} ${start}% ${accPct}%`);
  }
  const stops = gradientParts.join(", ");
  const mixRow = (
    <>
      <div
        className="h-36 w-36 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${stops})`,
        }}
        role="img"
        aria-label={title}
      />
      <ul className="min-w-0 flex-1 space-y-2 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate text-muted-foreground">{s.label}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums font-medium text-foreground">
              {s.pct}%
              {s.amount != null ? <span className="block text-[10px] font-normal text-muted-foreground">{formatUsdFull(s.amount)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
  if (titleInSurface) {
    return (
      <div className={cn("flex flex-col gap-5 rounded-lg px-3 py-4", chartSurfaceClassName ?? "bg-muted/60")}>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="flex flex-wrap items-center gap-6">{mixRow}</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="flex flex-wrap items-center gap-6 rounded-lg bg-muted/60 px-4 py-6">{mixRow}</div>
    </div>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[8rem] shrink-0" role="group" aria-label={label}>
      {children}
    </div>
  );
}

const selectClass = "h-9 w-full min-w-[8rem] rounded-md border border-input bg-background px-3 text-xs";

function formatSpendShort(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
  if (usd >= 1000) return `$${Math.round(usd / 1000)}K`;
  return formatUsdFull(usd);
}

/** Canonical PO ledger — charts aggregate from this list */
const purchaseOrders: PurchaseOrder[] = [
  { po: "PO-0981", supplierName: "ABC Supplier", source: "Project", requestType: "Product", totalAmount: 18500, status: "Approved", createdAt: "2026-01-04" },
  { po: "PO-0982", supplierName: "Hansei Global", source: "Project", requestType: "Product", totalAmount: 67200, status: "Approved", createdAt: "2026-01-11" },
  { po: "PO-0983", supplierName: "XYZ Services", source: "Department", requestType: "Service", totalAmount: 9400, status: "Approved", createdAt: "2026-01-18" },
  { po: "PO-0984", supplierName: "Swift Supplies", source: "Department", requestType: "Product", totalAmount: 5100, status: "Approved", createdAt: "2026-01-22" },
  { po: "PO-0985", supplierName: "Global Training Co.", source: "Project", requestType: "Training", totalAmount: 14200, status: "Approved", createdAt: "2026-02-02" },
  { po: "PO-0986", supplierName: "ABC Supplier", source: "Project", requestType: "Product", totalAmount: 22400, status: "Approved", createdAt: "2026-02-09" },
  { po: "PO-0987", supplierName: "Hansei Global", source: "Project", requestType: "Product", totalAmount: 98100, status: "Approved", createdAt: "2026-02-14" },
  { po: "PO-0988", supplierName: "XYZ Services", source: "Department", requestType: "Service", totalAmount: 7800, status: "Pending", createdAt: "2026-02-20" },
  { po: "PO-0989", supplierName: "Swift Supplies", source: "Department", requestType: "Product", totalAmount: 3300, status: "Approved", createdAt: "2026-02-26" },
  { po: "PO-0990", supplierName: "Global Training Co.", source: "Project", requestType: "Training", totalAmount: 8800, status: "Approved", createdAt: "2026-03-05" },
  { po: "PO-0991", supplierName: "ABC Supplier", source: "Project", requestType: "Product", totalAmount: 41200, status: "Approved", createdAt: "2026-03-12" },
  { po: "PO-0992", supplierName: "Hansei Global", source: "Project", requestType: "Product", totalAmount: 125000, status: "Approved", createdAt: "2026-03-18" },
  { po: "PO-0993", supplierName: "XYZ Services", source: "Department", requestType: "Service", totalAmount: 15000, status: "Approved", createdAt: "2026-03-24" },
  { po: "PO-0994", supplierName: "Swift Supplies", source: "Department", requestType: "Product", totalAmount: 6200, status: "Approved", createdAt: "2026-03-29" },
  { po: "PO-0995", supplierName: "Lakeside Logistics", source: "Project", requestType: "Service", totalAmount: 17600, status: "Approved", createdAt: "2026-04-02" },
  { po: "PO-0996", supplierName: "Northwind Parts", source: "Project", requestType: "Product", totalAmount: 28900, status: "Approved", createdAt: "2026-04-05" },
  { po: "PO-0997", supplierName: "Coastal Fab", source: "Department", requestType: "Product", totalAmount: 44600, status: "Approved", createdAt: "2026-04-07" },
  { po: "PO-1001", supplierName: "ABC Supplier", source: "Project", requestType: "Product", totalAmount: 48200, status: "Approved", createdAt: "2026-04-12" },
  { po: "PO-1002", supplierName: "XYZ Services", source: "Department", requestType: "Service", totalAmount: 12400, status: "Pending", createdAt: "2026-04-14" },
  { po: "PO-1003", supplierName: "Global Training Co.", source: "Project", requestType: "Training", totalAmount: 9850, status: "Approved", createdAt: "2026-04-10" },
  { po: "PO-1004", supplierName: "Hansei Global", source: "Project", requestType: "Product", totalAmount: 112000, status: "Approved", createdAt: "2026-04-08" },
  { po: "PO-1005", supplierName: "Swift Supplies", source: "Department", requestType: "Product", totalAmount: 3200, status: "Pending", createdAt: "2026-04-16" },
];

const stockPositions: StockPosition[] = [
  { item: "Cast Iron Valve", itemKind: "Item", category: "Hardware", availableQuantity: 240, reserved: 12, location: "Main DC", status: "In Stock" },
  { item: "Packing Tape", itemKind: "Item", category: "Consumables", availableQuantity: 18, reserved: 4, location: "Line A", status: "Low Stock" },
  { item: "Steel Beam 6m", itemKind: "Asset", category: "Raw Materials", availableQuantity: 0, reserved: 0, location: "Yard", status: "Out of Stock" },
  { item: "Office Chair", itemKind: "Item", category: "Furniture", availableQuantity: 45, reserved: 8, location: "HQ", status: "In Stock" },
  { item: "Safety Gloves", itemKind: "Item", category: "PPE", availableQuantity: 900, reserved: 100, location: "Main DC", status: "In Stock" },
  { item: "Torque Wrench Set", itemKind: "Tool", category: "Hardware", availableQuantity: 34, reserved: 6, location: "Main DC", status: "In Stock" },
  { item: "Electric Pallet Jack", itemKind: "Asset", category: "Equipment", availableQuantity: 6, reserved: 1, location: "Yard", status: "In Stock" },
];

const stockMovementBuckets: StockMovementBucket[] = [
  { movementDate: "2026-01", IN: 1420, OUT: 1180 },
  { movementDate: "2026-02", IN: 1580, OUT: 1320 },
  { movementDate: "2026-03", IN: 1710, OUT: 1490 },
  { movementDate: "2026-04", IN: 1240, OUT: 1110 },
];

const supplierProfiles: SupplierRecord[] = [
  { supplierName: "ABC Supplier", category: "Industrial", orders: 42, totalSpend: 0, onTimeDeliveryRate: 94, rating: 4.6, completionPct: 96, status: "Strong" },
  { supplierName: "Hansei Global", category: "Offshore", orders: 28, totalSpend: 0, onTimeDeliveryRate: 88, rating: 4.4, completionPct: 92, status: "Strong" },
  { supplierName: "Swift Supplies", category: "Local", orders: 61, totalSpend: 0, onTimeDeliveryRate: 97, rating: 4.8, completionPct: 98, status: "Strong" },
  { supplierName: "XYZ Services", category: "Services", orders: 15, totalSpend: 0, onTimeDeliveryRate: 79, rating: 4.1, completionPct: 84, status: "Watch" },
  { supplierName: "Global Training Co.", category: "Training", orders: 9, totalSpend: 0, onTimeDeliveryRate: 91, rating: 4.5, completionPct: 93, status: "Strong" },
  { supplierName: "Lakeside Logistics", category: "Logistics", orders: 11, totalSpend: 0, onTimeDeliveryRate: 93, rating: 4.5, completionPct: 95, status: "Strong" },
  { supplierName: "Northwind Parts", category: "Industrial", orders: 8, totalSpend: 0, onTimeDeliveryRate: 90, rating: 4.3, completionPct: 91, status: "Strong" },
  { supplierName: "Coastal Fab", category: "Industrial", orders: 13, totalSpend: 0, onTimeDeliveryRate: 86, rating: 4.2, completionPct: 89, status: "Strong" },
];

function mergeSupplierSpend(profiles: SupplierRecord[], orders: PurchaseOrder[]): SupplierRecord[] {
  const spend = new Map<string, number>();
  for (const o of orders) {
    spend.set(o.supplierName, (spend.get(o.supplierName) ?? 0) + o.totalAmount);
  }
  return profiles.map((p) => ({ ...p, totalSpend: spend.get(p.supplierName) ?? 0 }));
}

export function ReportingModule() {
  const [tab, setTab] = useState<ReportTab>("purchase");
  const [purchaseFrom, setPurchaseFrom] = useState("2026-01-01");
  const [purchaseTo, setPurchaseTo] = useState("2026-04-18");
  const [purchaseSupplier, setPurchaseSupplier] = useState("");
  const [purchaseSource, setPurchaseSource] = useState("");
  const [purchaseRequestType, setPurchaseRequestType] = useState("");

  const [supplierFrom, setSupplierFrom] = useState("2026-01-01");
  const [supplierTo, setSupplierTo] = useState("2026-04-18");

  const purchaseFiltered = useMemo(() => {
    const a = parseIsoDate(purchaseFrom);
    const b = parseIsoDate(purchaseTo);
    return purchaseOrders.filter((o) => {
      const t = parseIsoDate(o.createdAt).getTime();
      if (t < a.getTime() || t > b.getTime()) return false;
      if (purchaseSupplier && o.supplierName !== purchaseSupplier) return false;
      if (purchaseSource && o.source !== purchaseSource) return false;
      if (purchaseRequestType && o.requestType !== purchaseRequestType) return false;
      return true;
    });
  }, [purchaseFrom, purchaseTo, purchaseSupplier, purchaseSource, purchaseRequestType]);

  const purchaseSortedTable = useMemo(
    () => [...purchaseFiltered].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)),
    [purchaseFiltered],
  );

  const purchaseSpendTime = useMemo(
    () => aggregatePurchaseSpendByPeriod(purchaseFiltered, parseIsoDate(purchaseFrom), parseIsoDate(purchaseTo)),
    [purchaseFiltered, purchaseFrom, purchaseTo],
  );

  const spendByCategoryBars = useMemo(
    () => aggregateSpendByRequestType(purchaseFiltered).map(({ label, amount }) => ({ label, value: amount })),
    [purchaseFiltered],
  );

  const spendMix = useMemo(() => spendMixSegments(purchaseFiltered), [purchaseFiltered]);

  const purchaseKpis = useMemo(() => {
    const total = purchaseFiltered.reduce((s, o) => s + o.totalAmount, 0);
    const n = purchaseFiltered.length;
    const pending = purchaseFiltered.filter((o) => o.status === "Pending").length;
    return { total, n, avg: n ? total / n : 0, pending };
  }, [purchaseFiltered]);

  const supplierOrdersFiltered = useMemo(() => {
    const a = parseIsoDate(supplierFrom);
    const b = parseIsoDate(supplierTo);
    return purchaseOrders.filter((o) => {
      const t = parseIsoDate(o.createdAt).getTime();
      return t >= a.getTime() && t <= b.getTime();
    });
  }, [supplierFrom, supplierTo]);

  const suppliersMerged = useMemo(
    () => mergeSupplierSpend(supplierProfiles, supplierOrdersFiltered),
    [supplierOrdersFiltered],
  );

  const topSpendBars = useMemo(() => {
    const ranked = [...suppliersMerged]
      .filter((s) => s.totalSpend > 0)
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 8)
      .map((s) => ({ label: s.supplierName, value: s.totalSpend }));
    return ranked.length ? ranked : [{ label: "No PO spend in range", value: 0 }];
  }, [suppliersMerged]);

  const perfBars = useMemo(
    () => suppliersMerged.map((s) => ({ label: s.supplierName, value: s.onTimeDeliveryRate })),
    [suppliersMerged],
  );

  const supplierRatingAvg = useMemo(() => {
    const w = suppliersMerged.reduce((s, x) => s + x.orders, 0) || 1;
    return suppliersMerged.reduce((s, x) => s + x.rating * x.orders, 0) / w;
  }, [suppliersMerged]);

  const supplierOnTimeAvg = useMemo(() => {
    const w = suppliersMerged.reduce((s, x) => s + x.orders, 0) || 1;
    return suppliersMerged.reduce((s, x) => s + x.onTimeDeliveryRate * x.orders, 0) / w;
  }, [suppliersMerged]);

  const stockQtyTotal = useMemo(() => stockPositions.reduce((s, p) => s + p.availableQuantity, 0), []);
  const stockLow = useMemo(() => stockPositions.filter((p) => p.status === "Low Stock").length, []);
  const stockOut = useMemo(() => stockPositions.filter((p) => p.status === "Out of Stock").length, []);
  const stockByCategory = useMemo(() => aggregateStockByCategory(stockPositions), []);

  return (
    <div className="space-y-8">
      <ReportTabs tab={tab} setTab={setTab} />

      {tab === "purchase" && (
        <div className="space-y-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Purchase Amount" value={formatSpendShort(purchaseKpis.total)} icon={HandCoins} />
            <SummaryCard label="Total Orders" value={String(purchaseKpis.n)} icon={ShoppingCart} />
            <SummaryCard
              label="Average Order Value"
              value={purchaseKpis.n ? formatSpendShort(purchaseKpis.avg) : "—"}
              icon={BarChart3}
            />
            <SummaryCard label="Pending Orders" value={String(purchaseKpis.pending)} icon={Clock} />
          </section>

          <FilterRow>
            <FilterField label="Date range">
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 w-36 text-xs"
                  type="date"
                  value={purchaseFrom}
                  onChange={(e) => setPurchaseFrom(e.target.value)}
                />
                <span className="text-muted-foreground">–</span>
                <Input className="h-9 w-36 text-xs" type="date" value={purchaseTo} onChange={(e) => setPurchaseTo(e.target.value)} />
              </div>
            </FilterField>
            <FilterField label="Supplier">
              <select className={selectClass} value={purchaseSupplier} onChange={(e) => setPurchaseSupplier(e.target.value)}>
                <option value="">All suppliers</option>
                <option>ABC Supplier</option>
                <option>Hansei Global</option>
                <option>Swift Supplies</option>
                <option>XYZ Services</option>
                <option>Global Training Co.</option>
                <option>Lakeside Logistics</option>
                <option>Northwind Parts</option>
                <option>Coastal Fab</option>
              </select>
            </FilterField>
            <FilterField label="Order source">
              <select className={selectClass} value={purchaseSource} onChange={(e) => setPurchaseSource(e.target.value)}>
                <option value="">All</option>
                <option>Project</option>
                <option>Department</option>
              </select>
            </FilterField>
            <FilterField label="Request type">
              <select className={selectClass} value={purchaseRequestType} onChange={(e) => setPurchaseRequestType(e.target.value)}>
                <option value="">All</option>
                <option>Product</option>
                <option>Service</option>
                <option>Training</option>
              </select>
            </FilterField>
          </FilterRow>

          <div className="grid gap-8 lg:grid-cols-2">
            <LineChartDemo
              label="Spend over time"
              xLabels={purchaseSpendTime.labels}
              series={[{ name: "totalAmount", values: purchaseSpendTime.totals, stroke: PRIMARY }]}
              yTickFormat="usd"
              titleInSurface
              chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
            />
            <div className="grid gap-6">
              <BarChartDemo
                title="Spend by category"
                titleInSurface
                chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
                items={spendByCategoryBars}
                verticalAxisFormat="currency"
              />
              <PieChartDemo
                title="Spend mix"
                titleInSurface
                chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
                segments={spendMix}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Purchase orders</p>
            <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-border/60">
              <table className="w-full min-w-[800px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Purchase Order Number</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium">Order Source</th>
                    <th className="px-4 py-3 font-medium">Request Type</th>
                    <th className="px-4 py-3 font-medium">Total Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseSortedTable.map((o) => (
                    <tr key={o.po} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{o.po}</td>
                      <td className="px-4 py-3">{o.supplierName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.source}</td>
                      <td className="px-4 py-3">{o.requestType}</td>
                      <td className="px-4 py-3 tabular-nums">{formatUsdFull(o.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="font-normal">
                          {o.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{o.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div className="space-y-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Stock Quantity" value={formatNumber(stockQtyTotal)} icon={Package} />
            <SummaryCard label="Total Stock Value" value="$3.18M" icon={Wallet} />
            <SummaryCard label="Low Stock Items" value={String(stockLow)} icon={AlertTriangle} />
            <SummaryCard label="Out of Stock Items" value={String(stockOut)} icon={CircleAlert} />
          </section>

          <FilterRow>
            <FilterField label="Location">
              <select className={selectClass} defaultValue="">
                <option value="">All locations</option>
                <option>Main DC</option>
                <option>Line A</option>
                <option>HQ</option>
                <option>Yard</option>
              </select>
            </FilterField>
            <FilterField label="Category">
              <select className={selectClass} defaultValue="">
                <option value="">All categories</option>
                <option>Hardware</option>
                <option>Consumables</option>
                <option>Raw Materials</option>
              </select>
            </FilterField>
            <FilterField label="Status">
              <select className={selectClass} defaultValue="All">
                <option>All</option>
                <option>In Stock</option>
                <option>Low Stock</option>
                <option>Out of Stock</option>
              </select>
            </FilterField>
          </FilterRow>

          <div className="grid gap-8 lg:grid-cols-2">
            <BarChartDemo
              title="Stock distribution by category"
              chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
              titleInSurface
              items={stockByCategory}
              verticalAxisFormat="count"
            />
            <LineChartDemo
              label="Stock movement trend"
              xLabels={stockMovementBuckets.map((b) => b.movementDate)}
              series={[
                { name: "IN", values: stockMovementBuckets.map((b) => b.IN), stroke: PRIMARY },
                { name: "OUT", values: stockMovementBuckets.map((b) => b.OUT), stroke: LINE_OUT },
              ]}
              yTickFormat="count"
              chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
              titleInSurface
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Stock positions</p>
            <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-border/60">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Item Name</th>
                    <th className="px-4 py-3 font-medium">Item kind</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Available Quantity</th>
                    <th className="px-4 py-3 font-medium">Reserved Quantity</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPositions.map((row) => (
                    <tr key={row.item} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{row.item}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.itemKind}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                      <td className="px-4 py-3 tabular-nums">{row.availableQuantity}</td>
                      <td className="px-4 py-3 tabular-nums">{row.reserved}</td>
                      <td className="px-4 py-3">{row.location}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-normal",
                            row.status === "Low Stock" && "bg-amber-100 text-amber-900",
                            row.status === "Out of Stock" && "bg-red-100 text-red-800"
                          )}
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "supplier" && (
        <div className="space-y-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Suppliers" value={String(supplierProfiles.length)} icon={Users} />
            <SummaryCard label="Active Suppliers" value={String(supplierProfiles.filter((s) => s.status === "Strong").length)} icon={UserCheck} />
            <SummaryCard label="Average Supplier Rating" value={`${supplierRatingAvg.toFixed(1)} / 5`} icon={Star} />
            <SummaryCard label="On-time Delivery Rate" value={`${Math.round(supplierOnTimeAvg)}%`} icon={Truck} />
          </section>

          <FilterRow>
            <FilterField label="Supplier">
              <select className={selectClass} defaultValue="">
                <option value="">All suppliers</option>
                <option>ABC Supplier</option>
                <option>Hansei Global</option>
              </select>
            </FilterField>
            <FilterField label="Category">
              <select className={selectClass} defaultValue="">
                <option value="">All categories</option>
                <option>Industrial</option>
                <option>Offshore</option>
                <option>Local</option>
              </select>
            </FilterField>
            <FilterField label="Date range (PO-based spend)">
              <div className="flex items-center gap-2">
                <Input className="h-9 w-36 text-xs" type="date" value={supplierFrom} onChange={(e) => setSupplierFrom(e.target.value)} />
                <span className="text-muted-foreground">–</span>
                <Input className="h-9 w-36 text-xs" type="date" value={supplierTo} onChange={(e) => setSupplierTo(e.target.value)} />
              </div>
            </FilterField>
          </FilterRow>

          <div className="grid gap-8 lg:grid-cols-2">
            <BarChartDemo
              horizontal
              titleInSurface
              chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
              title="Top suppliers by spend"
              items={topSpendBars}
              horizontalValueMode="currency"
            />
            <BarChartDemo
              titleInSurface
              chartSurfaceClassName="bg-card shadow-sm ring-1 ring-border/60"
              title="Supplier performance comparison"
              items={perfBars}
              verticalAxisFormat="percent"
              yScaleMax={100}
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Supplier overview</p>
            <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-border/60">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Supplier Name</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Total Orders</th>
                    <th className="px-4 py-3 font-medium">Total Spend</th>
                    <th className="px-4 py-3 font-medium">On-time Delivery (%)</th>
                    <th className="px-4 py-3 font-medium">Rating</th>
                    <th className="px-4 py-3 font-medium">Performance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...suppliersMerged]
                    .sort((a, b) => b.totalSpend - a.totalSpend)
                    .map((row) => (
                      <tr key={row.supplierName} className="border-t border-border/60">
                        <td className="px-4 py-3 font-medium">{row.supplierName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                        <td className="px-4 py-3 tabular-nums">{row.orders}</td>
                        <td className="px-4 py-3 tabular-nums">{formatSpendShort(row.totalSpend)}</td>
                        <td className="px-4 py-3 tabular-nums">{row.onTimeDeliveryRate}%</td>
                        <td className="px-4 py-3 tabular-nums">{row.rating.toFixed(1)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-medium",
                              row.status === "Strong" && "bg-emerald-50 text-emerald-800",
                              row.status === "Watch" && "bg-amber-50 text-amber-900"
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
