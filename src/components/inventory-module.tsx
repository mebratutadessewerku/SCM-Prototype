"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, CircleAlert, Package, Plus, Search, Warehouse, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const PRIMARY = "#0D9488";

type InventoryTab = "Overview" | "Stock" | "Movements";

type InvLocationType = "Warehouse" | "Site" | "Bin";

type InvLocation = {
  id: string;
  name: string;
  type: InvLocationType;
  description: string;
};

type InvItemCategory = "Item" | "Tool" | "Asset";

type InvStockRow = {
  id: string;
  itemName: string;
  category: InvItemCategory;
  available: number;
  reserved: number;
  uom: string;
  locationId: string;
  minLevel: number;
};

type InvMovementType = "In" | "Out" | "Transfer" | "Return";

type InvMovement = {
  id: string;
  itemName: string;
  type: InvMovementType;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  date: string;
  reference: string;
};

type InvMovementUiKind = "receive" | "issue" | "transfer" | "return";

const INV_DEFAULT_MIN = 10;

const INV_PROJECT_OPTIONS = [
  { value: "proj-a", label: "Construction Project A" },
  { value: "proj-b", label: "Road Expansion Project" },
  { value: "proj-c", label: "Warehouse Setup" },
];

const INV_DEPT_OPTIONS = [
  { value: "ops", label: "Operations" },
  { value: "log", label: "Logistics" },
  { value: "mro", label: "MRO" },
  { value: "it", label: "IT Department" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "HR Department" },
];

const invStatusTone: Record<string, string> = {
  "Low Stock": "bg-amber-100 text-amber-800",
  "In Stock": "bg-emerald-100 text-emerald-800",
  "Out of Stock": "bg-slate-200 text-slate-800",
};

function InvStatusBadge({ value }: { value: string }) {
  return <Badge className={cn("font-normal hover:opacity-100", invStatusTone[value] ?? "bg-slate-100 text-slate-700")}>{value}</Badge>;
}

function invStockStatus(available: number, minLevel: number): "Out of Stock" | "Low Stock" | "In Stock" {
  if (available === 0) return "Out of Stock";
  if (available > 0 && available <= minLevel) return "Low Stock";
  return "In Stock";
}

function nextMovementId(movements: InvMovement[]) {
  const n = movements.length + 1;
  return `MOV-${String(n).padStart(4, "0")}`;
}

function invLocName(locations: InvLocation[], id: string | null) {
  if (!id) return "—";
  return locations.find((l) => l.id === id)?.name ?? "—";
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";
const filterSelect = "h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs sm:w-40";

function InventoryTabs({
  tab,
  onTab,
}: {
  tab: InventoryTab;
  onTab: (t: InventoryTab) => void;
}) {
  const items: InventoryTab[] = ["Overview", "Stock", "Movements"];
  return (
    <div className="flex flex-wrap gap-8 border-b border-transparent">
      {items.map((item) => {
        const active = tab === item;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onTab(item)}
            className={cn(
              "-mb-px border-b-2 border-transparent pb-2 text-sm transition-colors",
              active ? "font-semibold" : "font-normal text-muted-foreground hover:text-foreground",
            )}
            style={active ? { color: PRIMARY, borderBottomColor: PRIMARY } : undefined}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) {
  return (
    <div className="rounded-lg bg-card px-4 py-4 shadow-sm ring-1 ring-slate-100/80">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export function InventoryModule() {
  const [tab, setTab] = useState<InventoryTab>("Overview");

  const locations = useMemo<InvLocation[]>(
    () => [
      { id: "loc-1", name: "WH-A — Main", type: "Warehouse", description: "Primary distribution hub" },
      { id: "loc-2", name: "WH-C — Regional", type: "Warehouse", description: "Regional buffer stock" },
      { id: "loc-3", name: "Site-1 — Staging", type: "Site", description: "Project staging yard" },
      { id: "loc-4", name: "WH-A / Bin B-14", type: "Bin", description: "Fast-moving small parts" },
    ],
    [],
  );

  const [stockRows, setStockRows] = useState<InvStockRow[]>(() => [
    {
      id: "stk-1",
      itemName: "Cast Iron Valve 4\"",
      category: "Item",
      available: 220,
      reserved: 40,
      uom: "pcs",
      locationId: "loc-4",
      minLevel: 50,
    },
    {
      id: "stk-2",
      itemName: "Stainless Bolts M16",
      category: "Tool",
      available: 90,
      reserved: 22,
      uom: "pcs",
      locationId: "loc-2",
      minLevel: 100,
    },
    {
      id: "stk-3",
      itemName: "Electrical Cable 3×2.5",
      category: "Item",
      available: 0,
      reserved: 0,
      uom: "m",
      locationId: "loc-1",
      minLevel: 200,
    },
    {
      id: "stk-4",
      itemName: "Hydraulic Hose Assembly",
      category: "Asset",
      available: 45,
      reserved: 8,
      uom: "pcs",
      locationId: "loc-1",
      minLevel: 20,
    },
  ]);

  const [movements, setMovements] = useState<InvMovement[]>(() => [
    {
      id: "MOV-0001",
      itemName: "Cast Iron Valve 4\"",
      type: "In",
      quantity: 120,
      fromLocationId: null,
      toLocationId: "loc-4",
      date: "2026-04-10",
      reference: "PO-991",
    },
    {
      id: "MOV-0002",
      itemName: "Stainless Bolts M16",
      type: "Out",
      quantity: 30,
      fromLocationId: "loc-2",
      toLocationId: null,
      date: "2026-04-12",
      reference: "WO-442",
    },
    {
      id: "MOV-0003",
      itemName: "Hydraulic Hose Assembly",
      type: "Transfer",
      quantity: 12,
      fromLocationId: "loc-1",
      toLocationId: "loc-3",
      date: "2026-04-14",
      reference: "TRF-108",
    },
    {
      id: "MOV-0004",
      itemName: "Electrical Cable 3×2.5",
      type: "Out",
      quantity: 80,
      fromLocationId: "loc-1",
      toLocationId: null,
      date: "2026-04-15",
      reference: "WO-451",
    },
    {
      id: "MOV-0005",
      itemName: "Stainless Bolts M16",
      type: "Return",
      quantity: 15,
      fromLocationId: null,
      toLocationId: "loc-2",
      date: "2026-04-16",
      reference: "RMA-2201",
    },
    {
      id: "MOV-0006",
      itemName: "Stainless Bolts M16",
      type: "In",
      quantity: 200,
      fromLocationId: null,
      toLocationId: "loc-2",
      date: "2026-04-16",
      reference: "PO-1002",
    },
  ]);

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [movementForm, setMovementForm] = useState<{
    kind: InvMovementUiKind;
    itemName: string;
    quantity: string;
    uom: string;
    locationId: string;
    fromLocationId: string;
    toLocationId: string;
    reference: string;
    date: string;
  }>({
    kind: "receive",
    itemName: "",
    quantity: "",
    uom: "",
    locationId: "",
    fromLocationId: "",
    toLocationId: "",
    reference: "",
    date: "",
  });

  const [addItemForm, setAddItemForm] = useState({
    category: "Item" as InvItemCategory,
    name: "",
    quantity: "",
    uom: "",
    locationId: "",
    minLevel: "",
    model: "",
    itemNumber: "",
    serialNumber: "",
    manufacturer: "",
    subCategory: "",
    type: "",
    price: "",
    currency: "USD",
    dateOfPurchase: "",
    warranty: "",
    projectKey: "",
    departmentKey: "",
    status: "Active",
    description: "",
  });

  const [addItemProjectError, setAddItemProjectError] = useState("");

  const [stockSearch, setStockSearch] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>("All");
  const [stockLocFilter, setStockLocFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("All");

  const [movSearch, setMovSearch] = useState("");
  const [movTypeFilter, setMovTypeFilter] = useState("All");
  const [movItemFilter, setMovItemFilter] = useState("");
  const [movDateFrom, setMovDateFrom] = useState("");
  const [movDateTo, setMovDateTo] = useState("");

  const itemOptions = useMemo(() => {
    const names = new Set(stockRows.map((r) => r.itemName));
    return Array.from(names).sort();
  }, [stockRows]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const openMovementModal = useCallback(() => {
    const loc0 = locations[0]?.id ?? "";
    const loc1 = locations[1]?.id ?? "";
    const firstItem = itemOptions[0] ?? "";
    const u0 = stockRows.find((r) => r.itemName === firstItem)?.uom ?? "pcs";
    setMovementForm({
      kind: "receive",
      itemName: firstItem,
      quantity: "",
      uom: u0,
      locationId: loc0,
      fromLocationId: loc0,
      toLocationId: loc1 !== loc0 ? loc1 : loc0,
      reference: "",
      date: todayStr,
    });
    setMovementModalOpen(true);
  }, [itemOptions, locations, stockRows, todayStr]);

  const openAddItemModal = useCallback(() => {
    setAddItemForm({
      category: "Item",
      name: "",
      quantity: "",
      uom: "pcs",
      locationId: locations[0]?.id ?? "",
      minLevel: String(INV_DEFAULT_MIN),
      model: "",
      itemNumber: "",
      serialNumber: "",
      manufacturer: "",
      subCategory: "",
      type: "",
      price: "",
      currency: "USD",
      dateOfPurchase: "",
      warranty: "",
      projectKey: "",
      departmentKey: "",
      status: "Active",
      description: "",
    });
    setAddItemProjectError("");
    setAddItemModalOpen(true);
  }, [locations]);

  const overviewStats = useMemo(() => {
    const totalItems = stockRows.length;
    const totalAvailable = stockRows.reduce((s, r) => s + r.available, 0);
    const lowCount = stockRows.filter((r) => invStockStatus(r.available, r.minLevel) === "Low Stock").length;
    const outCount = stockRows.filter((r) => invStockStatus(r.available, r.minLevel) === "Out of Stock").length;
    return { totalItems, totalAvailable, lowCount, outCount };
  }, [stockRows]);

  const lowStockRows = useMemo(
    () => stockRows.filter((r) => invStockStatus(r.available, r.minLevel) === "Low Stock"),
    [stockRows],
  );

  const recentMovements = useMemo(() => {
    return [...movements].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 6);
  }, [movements]);

  const filteredStock = useMemo(() => {
    return stockRows.filter((row) => {
      const status = invStockStatus(row.available, row.minLevel);
      if (stockStatusFilter !== "All" && status !== stockStatusFilter) return false;
      if (stockCategoryFilter !== "All" && row.category !== stockCategoryFilter) return false;
      if (stockLocFilter && row.locationId !== stockLocFilter) return false;
      if (stockSearch.trim() && !row.itemName.toLowerCase().includes(stockSearch.trim().toLowerCase())) return false;
      return true;
    });
  }, [stockRows, stockSearch, stockLocFilter, stockStatusFilter, stockCategoryFilter]);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movTypeFilter !== "All" && m.type !== movTypeFilter) return false;
      if (movItemFilter && m.itemName !== movItemFilter) return false;
      const q = movSearch.trim().toLowerCase();
      if (q && !m.itemName.toLowerCase().includes(q) && !m.reference.toLowerCase().includes(q)) return false;
      if (movDateFrom && m.date < movDateFrom) return false;
      if (movDateTo && m.date > movDateTo) return false;
      return true;
    });
  }, [movements, movSearch, movTypeFilter, movDateFrom, movDateTo, movItemFilter]);

  const submitAddItem = useCallback(() => {
    if (!addItemForm.projectKey.trim()) {
      setAddItemProjectError("Project is required");
      return;
    }
    setAddItemProjectError("");
    const qty = Number(addItemForm.quantity);
    const minL = Number(addItemForm.minLevel) || INV_DEFAULT_MIN;
    if (!addItemForm.name.trim() || !Number.isFinite(qty) || qty < 0 || !addItemForm.locationId) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `stk-${Date.now()}`;
    setStockRows((prev) => [
      ...prev,
      {
        id,
        itemName: addItemForm.name.trim(),
        category: addItemForm.category,
        available: qty,
        reserved: 0,
        uom: addItemForm.uom.trim() || "pcs",
        locationId: addItemForm.locationId,
        minLevel: minL,
      },
    ]);
    setAddItemProjectError("");
    setAddItemModalOpen(false);
  }, [addItemForm]);

  const submitMovement = useCallback(() => {
    const { kind, itemName, quantity, locationId, fromLocationId, toLocationId, reference, date, uom } = movementForm;
    const qty = Number(quantity);
    if (!itemName || !Number.isFinite(qty) || qty <= 0) return;

    const applyReceiveOrReturn = (movType: "In" | "Return") => {
      if (!locationId) return;
      setStockRows((prev) => {
        const idx = prev.findIndex((r) => r.itemName === itemName && r.locationId === locationId);
        if (idx >= 0) {
          return prev.map((r, i) => (i === idx ? { ...r, available: r.available + qty } : r));
        }
        const template = prev.find((r) => r.itemName === itemName);
        const u = (uom || template?.uom || "pcs").trim() || "pcs";
        const minLevel = template?.minLevel ?? INV_DEFAULT_MIN;
        const cat = template?.category ?? "Item";
        const id =
          typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `stk-${String(prev.length)}`;
        return [...prev, { id, itemName, category: cat, available: qty, reserved: 0, uom: u, locationId, minLevel }];
      });
      setMovements((prev) => [
        ...prev,
        {
          id: nextMovementId(prev),
          itemName,
          type: movType,
          quantity: qty,
          fromLocationId: null,
          toLocationId: locationId,
          date,
          reference: reference.trim() || "—",
        },
      ]);
    };

    if (kind === "receive") {
      applyReceiveOrReturn("In");
    } else if (kind === "return") {
      applyReceiveOrReturn("Return");
    } else if (kind === "issue") {
      if (!locationId) return;
      const row = stockRows.find((r) => r.itemName === itemName && r.locationId === locationId);
      if (!row) {
        window.alert("No stock for this item at the selected location.");
        return;
      }
      if (row.available < qty) {
        window.alert("Not enough available quantity to issue (reserved stock is not usable).");
        return;
      }
      setStockRows((prev) => {
        const idx = prev.findIndex((r) => r.itemName === itemName && r.locationId === locationId);
        return prev.map((r, i) => (i === idx ? { ...r, available: r.available - qty } : r));
      });
      setMovements((prev) => [
        ...prev,
        {
          id: nextMovementId(prev),
          itemName,
          type: "Out",
          quantity: qty,
          fromLocationId: locationId,
          toLocationId: null,
          date,
          reference: reference.trim() || "—",
        },
      ]);
    } else {
      if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return;
      const srcRow = stockRows.find((r) => r.itemName === itemName && r.locationId === fromLocationId);
      if (!srcRow) {
        window.alert("No stock for this item at the source location.");
        return;
      }
      if (srcRow.available < qty) {
        window.alert("Not enough available quantity at the source location.");
        return;
      }
      setStockRows((prev) => {
        const srcIdx = prev.findIndex((r) => r.itemName === itemName && r.locationId === fromLocationId);
        const src = prev[srcIdx];
        let next = prev.map((r, i) => (i === srcIdx ? { ...r, available: r.available - qty } : r));
        const destIdx = next.findIndex((r) => r.itemName === itemName && r.locationId === toLocationId);
        if (destIdx >= 0) {
          next = next.map((r, i) => (i === destIdx ? { ...r, available: r.available + qty } : r));
        } else {
          const id =
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `stk-${String(next.length)}`;
          next = [
            ...next,
            {
              id,
              itemName,
              category: src.category,
              available: qty,
              reserved: 0,
              uom: src.uom,
              locationId: toLocationId,
              minLevel: src.minLevel,
            },
          ];
        }
        return next;
      });
      setMovements((prev) => [
        ...prev,
        {
          id: nextMovementId(prev),
          itemName,
          type: "Transfer",
          quantity: qty,
          fromLocationId,
          toLocationId,
          date,
          reference: "Transfer",
        },
      ]);
    }
    setMovementModalOpen(false);
  }, [movementForm, stockRows]);

  const nameFieldLabel =
    addItemForm.category === "Item" ? "Item Name" : addItemForm.category === "Tool" ? "Tool Name" : "Asset Name";

  return (
    <div className="space-y-6">
      <InventoryTabs tab={tab} onTab={setTab} />

      {tab === "Overview" && (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Items" value={String(overviewStats.totalItems)} icon={Package} />
            <SummaryCard
              label="Total Available Quantity"
              value={overviewStats.totalAvailable.toLocaleString()}
              icon={Warehouse}
            />
            <SummaryCard label="Low Stock Items" value={String(overviewStats.lowCount)} icon={AlertTriangle} />
            <SummaryCard label="Out of Stock Items" value={String(overviewStats.outCount)} icon={CircleAlert} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Low stock items</h3>
            <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Available Quantity</th>
                    <th className="px-4 py-3 font-medium">Minimum Level</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No low stock items
                      </td>
                    </tr>
                  ) : (
                    lowStockRows.map((row) => (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="px-4 py-3 font-medium text-foreground">{row.itemName}</td>
                        <td className="px-4 py-3 tabular-nums">{row.available}</td>
                        <td className="px-4 py-3 tabular-nums">{row.minLevel}</td>
                        <td className="px-4 py-3 text-muted-foreground">{invLocName(locations, row.locationId)}</td>
                        <td className="px-4 py-3">
                          <InvStatusBadge value={invStockStatus(row.available, row.minLevel)} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Recent movements</h3>
            <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Movement Type</th>
                    <th className="px-4 py-3 font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMovements.map((m) => (
                    <tr key={m.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium text-foreground">{m.itemName}</td>
                      <td className="px-4 py-3">{m.type}</td>
                      <td className="px-4 py-3 tabular-nums">{m.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "Stock" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="relative w-72 max-w-full shrink-0">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-9 pl-9 text-xs"
                  placeholder="Search by item name"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                />
              </div>
              <select
                className={filterSelect}
                value={stockCategoryFilter}
                onChange={(e) => setStockCategoryFilter(e.target.value)}
              >
                <option value="All">All categories</option>
                <option value="Item">Item</option>
                <option value="Tool">Tool</option>
                <option value="Asset">Asset</option>
              </select>
              <select
                className={filterSelect}
                value={stockStatusFilter}
                onChange={(e) => setStockStatusFilter(e.target.value)}
              >
                <option value="All">All statuses</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
              <select className={filterSelect} value={stockLocFilter} onChange={(e) => setStockLocFilter(e.target.value)}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={openMovementModal}>
                New movement
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 min-w-[7.5rem] text-white hover:opacity-90"
                style={{ backgroundColor: PRIMARY }}
                onClick={openAddItemModal}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add item
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Available Quantity</th>
                  <th className="px-4 py-3 font-medium">Reserved Quantity</th>
                  <th className="px-4 py-3 font-medium">Unit of Measurement</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Minimum Level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((row) => {
                  const st = invStockStatus(row.available, row.minLevel);
                  return (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium text-foreground">{row.itemName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                      <td className="px-4 py-3 tabular-nums">{row.available}</td>
                      <td className="px-4 py-3 tabular-nums">{row.reserved}</td>
                      <td className="px-4 py-3">{row.uom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{invLocName(locations, row.locationId)}</td>
                      <td className="px-4 py-3 tabular-nums">{row.minLevel}</td>
                      <td className="px-4 py-3">
                        <InvStatusBadge value={st} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Movements" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <select className={filterSelect} value={movTypeFilter} onChange={(e) => setMovTypeFilter(e.target.value)}>
              <option value="All">All movement types</option>
              <option value="In">In</option>
              <option value="Out">Out</option>
              <option value="Transfer">Transfer</option>
              <option value="Return">Return</option>
            </select>
            <Input className="h-9 w-36 shrink-0 text-xs" type="date" value={movDateFrom} onChange={(e) => setMovDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input className="h-9 w-36 shrink-0 text-xs" type="date" value={movDateTo} onChange={(e) => setMovDateTo(e.target.value)} />
            <select className={cn(filterSelect, "sm:w-56")} value={movItemFilter} onChange={(e) => setMovItemFilter(e.target.value)}>
              <option value="">All items</option>
              {itemOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-9 text-xs"
                placeholder="Search reference…"
                value={movSearch}
                onChange={(e) => setMovSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Movement ID</th>
                  <th className="px-4 py-3 font-medium">Item Name</th>
                  <th className="px-4 py-3 font-medium">Movement Type</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">From Location</th>
                  <th className="px-4 py-3 font-medium">To Location</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredMovements]
                  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
                  .map((m) => (
                    <tr key={m.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-mono text-[11px] text-foreground">{m.id}</td>
                      <td className="px-4 py-3 font-medium">{m.itemName}</td>
                      <td className="px-4 py-3">{m.type}</td>
                      <td className="px-4 py-3 tabular-nums">{m.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{invLocName(locations, m.fromLocationId)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{invLocName(locations, m.toLocationId)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.date}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,720px)] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Add item</h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setAddItemProjectError("");
                  setAddItemModalOpen(false);
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-6 text-xs">
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-foreground">Category</legend>
                <div className="flex flex-wrap gap-4">
                  {(["Item", "Tool", "Asset"] as const).map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="inv-add-category"
                        className="accent-primary"
                        checked={addItemForm.category === c}
                        onChange={() => setAddItemForm((f) => ({ ...f, category: c }))}
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Basic information</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">{nameFieldLabel}</label>
                    <Input
                      className="h-9"
                      value={addItemForm.name}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                    <Input
                      className="h-9"
                      type="number"
                      min={0}
                      value={addItemForm.quantity}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Unit of measurement</label>
                    <Input
                      className="h-9"
                      value={addItemForm.uom}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, uom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Location</label>
                    <select
                      className={selectClass}
                      value={addItemForm.locationId}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, locationId: e.target.value }))}
                    >
                      <option value="">Select location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Minimum level</label>
                    <Input
                      className="h-9"
                      type="number"
                      min={0}
                      value={addItemForm.minLevel}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, minLevel: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Details</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Model</label>
                    <Input className="h-9" value={addItemForm.model} onChange={(e) => setAddItemForm((f) => ({ ...f, model: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Item number</label>
                    <Input
                      className="h-9"
                      value={addItemForm.itemNumber}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, itemNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Serial number</label>
                    <Input
                      className="h-9"
                      value={addItemForm.serialNumber}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, serialNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Manufacturer</label>
                    <Input
                      className="h-9"
                      value={addItemForm.manufacturer}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, manufacturer: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Sub category</label>
                    <Input
                      className="h-9"
                      value={addItemForm.subCategory}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, subCategory: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <Input className="h-9" value={addItemForm.type} onChange={(e) => setAddItemForm((f) => ({ ...f, type: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Financial & purchase info</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Price</label>
                    <Input className="h-9" value={addItemForm.price} onChange={(e) => setAddItemForm((f) => ({ ...f, price: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Currency</label>
                    <Input
                      className="h-9"
                      value={addItemForm.currency}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, currency: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date of purchase</label>
                    <Input
                      className="h-9"
                      type="date"
                      value={addItemForm.dateOfPurchase}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, dateOfPurchase: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Warranty</label>
                    <Input
                      className="h-9"
                      value={addItemForm.warranty}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, warranty: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Warranty document</label>
                    <Input className="h-9 cursor-pointer text-xs file:mr-2" type="file" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">PI document</label>
                    <Input className="h-9 cursor-pointer text-xs file:mr-2" type="file" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Assignment</p>
                <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inv-add-project">
                      Project <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="inv-add-project"
                      className={cn(selectClass, addItemProjectError && "border-red-500 focus-visible:ring-red-200")}
                      value={addItemForm.projectKey}
                      onChange={(e) => {
                        setAddItemProjectError("");
                        setAddItemForm((f) => ({ ...f, projectKey: e.target.value }));
                      }}
                      aria-invalid={!!addItemProjectError}
                      aria-describedby={addItemProjectError ? "inv-add-project-error" : undefined}
                      required
                    >
                      <option value="">Select project</option>
                      {INV_PROJECT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {addItemProjectError ? (
                      <p id="inv-add-project-error" className="text-[11px] text-red-600">
                        {addItemProjectError}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inv-add-department">
                      Department <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <select
                      id="inv-add-department"
                      className={selectClass}
                      value={addItemForm.departmentKey}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, departmentKey: e.target.value }))}
                    >
                      <option value="">None</option>
                      {INV_DEPT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Additional</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <select
                      className={selectClass}
                      value={addItemForm.status}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <textarea
                      className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      value={addItemForm.description}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Image upload</label>
                    <Input className="h-9 cursor-pointer text-xs file:mr-2" type="file" accept="image/*" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                className="h-9 min-w-24"
                onClick={() => {
                  setAddItemProjectError("");
                  setAddItemModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button className="h-9 min-w-24 text-white hover:opacity-90" style={{ backgroundColor: PRIMARY }} onClick={submitAddItem}>
                Save item
              </Button>
            </div>
          </div>
        </div>
      )}

      {movementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border bg-card px-6 py-5 text-xs shadow-lg sm:max-w-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">New movement</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setMovementModalOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-5">
              <fieldset className="space-y-3">
                <legend className="text-xs font-medium text-foreground">Movement type</legend>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  {(
                    [
                      ["receive", "Receive goods (In)"],
                      ["issue", "Issue stock (Out)"],
                      ["transfer", "Transfer stock"],
                      ["return", "Return to stock"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name="inv-movement-kind"
                        className="accent-primary"
                        checked={movementForm.kind === value}
                        onChange={() => setMovementForm((f) => ({ ...f, kind: value }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {(movementForm.kind === "receive" || movementForm.kind === "return" || movementForm.kind === "issue") && (
                <div className="space-y-4 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Item</label>
                    <select
                      className={selectClass}
                      value={movementForm.itemName}
                      onChange={(e) => {
                        const n = e.target.value;
                        setMovementForm((f) => {
                          const u = stockRows.find((r) => r.itemName === n)?.uom ?? f.uom;
                          return { ...f, itemName: n, uom: u };
                        });
                      }}
                    >
                      <option value="">Select item</option>
                      {itemOptions.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      value={movementForm.quantity}
                      onChange={(e) => setMovementForm((f) => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Unit of measurement</label>
                    <Input
                      className="h-9"
                      value={movementForm.uom}
                      onChange={(e) => setMovementForm((f) => ({ ...f, uom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date</label>
                    <Input
                      className="h-9"
                      type="date"
                      value={movementForm.date}
                      onChange={(e) => setMovementForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  {(movementForm.kind === "receive" || movementForm.kind === "return") && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Location</label>
                        <select
                          className={selectClass}
                          value={movementForm.locationId}
                          onChange={(e) => setMovementForm((f) => ({ ...f, locationId: e.target.value }))}
                        >
                          <option value="">Select location</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Reference (optional)</label>
                        <Input
                          className="h-9"
                          placeholder={movementForm.kind === "receive" ? "e.g. PO-1024" : "e.g. RMA-…"}
                          value={movementForm.reference}
                          onChange={(e) => setMovementForm((f) => ({ ...f, reference: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                  {movementForm.kind === "issue" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">From location</label>
                        <select
                          className={selectClass}
                          value={movementForm.locationId}
                          onChange={(e) => setMovementForm((f) => ({ ...f, locationId: e.target.value }))}
                        >
                          <option value="">Select location</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Reference (optional)</label>
                        <Input
                          className="h-9"
                          placeholder="Work order, project ref…"
                          value={movementForm.reference}
                          onChange={(e) => setMovementForm((f) => ({ ...f, reference: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {movementForm.kind === "transfer" && (
                <div className="space-y-4 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Item</label>
                    <select
                      className={selectClass}
                      value={movementForm.itemName}
                      onChange={(e) => {
                        const n = e.target.value;
                        setMovementForm((f) => {
                          const u = stockRows.find((r) => r.itemName === n)?.uom ?? f.uom;
                          return { ...f, itemName: n, uom: u };
                        });
                      }}
                    >
                      <option value="">Select item</option>
                      {itemOptions.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      value={movementForm.quantity}
                      onChange={(e) => setMovementForm((f) => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Unit of measurement</label>
                    <Input
                      className="h-9"
                      value={movementForm.uom}
                      onChange={(e) => setMovementForm((f) => ({ ...f, uom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">From location</label>
                    <select
                      className={selectClass}
                      value={movementForm.fromLocationId}
                      onChange={(e) => setMovementForm((f) => ({ ...f, fromLocationId: e.target.value }))}
                    >
                      <option value="">Select</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">To location</label>
                    <select
                      className={selectClass}
                      value={movementForm.toLocationId}
                      onChange={(e) => setMovementForm((f) => ({ ...f, toLocationId: e.target.value }))}
                    >
                      <option value="">Select</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date</label>
                    <Input
                      className="h-9"
                      type="date"
                      value={movementForm.date}
                      onChange={(e) => setMovementForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-5">
              <Button className="h-9 min-w-24" variant="outline" onClick={() => setMovementModalOpen(false)}>
                Cancel
              </Button>
              <Button className="h-9 min-w-24" onClick={submitMovement}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
