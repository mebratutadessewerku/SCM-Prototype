"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, CircleAlert, MoreVertical, Package, Plus, Search, Warehouse, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const PRIMARY = "#0D9488";

type InventoryTab = "Overview" | "Stock" | "Transaction" | "Requested" | "Returned";

type InvLocationType = "Warehouse" | "Site" | "Bin";

type InvLocation = {
  id: string;
  name: string;
  type: InvLocationType;
  description: string;
};

type InvItemCategory = "Stock Item" | "Consumable Item" | "Service Item" | "Asset Item";

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
  transactionType: string;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  date: string;
  reference: string;
};

type InvMovementUiKind = "receive" | "issue" | "transfer" | "return";
type InvRequestMode = "single" | "bulk";
type ReturnReviewStatus = "Pending" | "Approved" | "Rejected";
type InvRequestRecord = {
  id: string;
  itemName: string;
  quantity: number;
  uom: string;
  projectKey: string;
  departmentKey: string;
  mode: InvRequestMode;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  reviewedAt: string | null;
};

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
  const items: InventoryTab[] = ["Overview", "Stock", "Transaction", "Requested", "Returned"];
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
      category: "Stock Item",
      available: 220,
      reserved: 40,
      uom: "pcs",
      locationId: "loc-4",
      minLevel: 50,
    },
    {
      id: "stk-2",
      itemName: "Stainless Bolts M16",
      category: "Consumable Item",
      available: 90,
      reserved: 22,
      uom: "pcs",
      locationId: "loc-2",
      minLevel: 100,
    },
    {
      id: "stk-3",
      itemName: "Electrical Cable 3×2.5",
      category: "Stock Item",
      available: 0,
      reserved: 0,
      uom: "m",
      locationId: "loc-1",
      minLevel: 200,
    },
    {
      id: "stk-4",
      itemName: "Hydraulic Hose Assembly",
      category: "Asset Item",
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
      transactionType: "Purchase receipt (from PO)",
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
      transactionType: "Sales issue (delivery)",
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
      transactionType: "Internal (movement)",
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
      transactionType: "Consumption (project or department use)",
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
      transactionType: "Customer return",
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
      transactionType: "Purchase receipt (from PO)",
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
  const [inboundTransactionType, setInboundTransactionType] = useState<
    "Purchase receipt (from PO)" | "Production output" | "Customer return" | "Transfer in"
  >("Purchase receipt (from PO)");
  const [outboundTransactionType, setOutboundTransactionType] = useState<
    "Sales issue (delivery)" | "Consumption (project or department use)" | "Scrap / damage" | "Transfer out"
  >("Sales issue (delivery)");

  const [addItemForm, setAddItemForm] = useState({
    category: "Stock Item" as InvItemCategory,
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
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestMode, setRequestMode] = useState<InvRequestMode>("single");
  const [requestProjectKey, setRequestProjectKey] = useState("");
  const [requestDepartmentKey, setRequestDepartmentKey] = useState("");
  const [requestRows, setRequestRows] = useState<Array<{ id: string; itemName: string; quantity: string; uom: string }>>([]);
  const [requestError, setRequestError] = useState("");
  const [requestRecords, setRequestRecords] = useState<InvRequestRecord[]>([]);
  const [returnReviewById, setReturnReviewById] = useState<Record<string, { status: ReturnReviewStatus; reviewedAt: string | null }>>({});

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

  const openMovementModal = useCallback((kind: InvMovementUiKind = "receive") => {
    const loc0 = locations[0]?.id ?? "";
    const loc1 = locations[1]?.id ?? "";
    const firstItem = itemOptions[0] ?? "";
    const u0 = stockRows.find((r) => r.itemName === firstItem)?.uom ?? "pcs";
    setMovementForm({
      kind,
      itemName: firstItem,
      quantity: "",
      uom: u0,
      locationId: loc0,
      fromLocationId: loc0,
      toLocationId: loc1 !== loc0 ? loc1 : loc0,
      reference: "",
      date: todayStr,
    });
    setInboundTransactionType("Purchase receipt (from PO)");
    setOutboundTransactionType("Sales issue (delivery)");
    setMovementModalOpen(true);
  }, [itemOptions, locations, stockRows, todayStr]);

  const openAddItemModal = useCallback(() => {
    setAddItemForm({
      category: "Stock Item",
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

  const returnedRows = useMemo(() => {
    return [...movements]
      .filter((m) => m.type === "Return")
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [movements]);

  const returnedRowReview = useCallback(
    (movementId: string) => returnReviewById[movementId] ?? { status: "Pending" as const, reviewedAt: null },
    [returnReviewById],
  );

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

  const allFilteredSelected = filteredStock.length > 0 && filteredStock.every((row) => selectedStockIds.includes(row.id));

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
    setStockNotice(`${addItemForm.category} "${addItemForm.name.trim()}" added successfully.`);
  }, [addItemForm]);

  const toggleStockSelection = useCallback((id: string) => {
    setSelectedStockIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleAllFilteredSelection = useCallback(() => {
    setSelectedStockIds((prev) => {
      const filteredIds = filteredStock.map((row) => row.id);
      const isAllSelected = filteredIds.every((id) => prev.includes(id));
      if (isAllSelected) return prev.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...prev, ...filteredIds]));
    });
  }, [filteredStock]);

  const openRequestModal = useCallback(
    (ids: string[], mode: InvRequestMode) => {
      if (ids.length === 0) return;
      const rows = stockRows.filter((row) => ids.includes(row.id));
      setRequestMode(mode);
      setRequestProjectKey("");
      setRequestDepartmentKey("");
      setRequestError("");
      setRequestRows(
        rows.map((row) => ({
          id: row.id,
          itemName: row.itemName,
          quantity: "1",
          uom: row.uom,
        })),
      );
      setRequestModalOpen(true);
    },
    [stockRows],
  );

  const submitRequest = useCallback(() => {
    const validQty = requestRows.every((row) => Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0);
    if (!validQty) {
      setRequestError("All quantities must be greater than 0.");
      return;
    }
    const projectLabel = requestProjectKey
      ? (INV_PROJECT_OPTIONS.find((p) => p.value === requestProjectKey)?.label ?? requestProjectKey)
      : "No project";
    const departmentLabel = requestDepartmentKey
      ? (INV_DEPT_OPTIONS.find((d) => d.value === requestDepartmentKey)?.label ?? requestDepartmentKey)
      : "No department";
    setStockNotice(
      `${requestMode === "single" ? "Single" : "Bulk"} request submitted for ${requestRows.length} item(s) under ${projectLabel} / ${departmentLabel}.`,
    );
    setRequestRecords((prev) => [
      ...requestRows.map((row) => ({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${row.id}`,
        itemName: row.itemName,
        quantity: Number(row.quantity),
        uom: row.uom,
        projectKey: requestProjectKey,
        departmentKey: requestDepartmentKey,
        mode: requestMode,
        requestedAt: todayStr,
        status: "Pending" as const,
        reviewedAt: null,
      })),
      ...prev,
    ]);
    setRequestModalOpen(false);
    setRequestError("");
  }, [requestDepartmentKey, requestMode, requestProjectKey, requestRows, todayStr]);

  const approveRequestRecord = useCallback(
    (requestId: string) => {
      const request = requestRecords.find((r) => r.id === requestId);
      if (!request || request.status !== "Pending") return;

      const totalAvailable = stockRows
        .filter((row) => row.itemName === request.itemName)
        .reduce((sum, row) => sum + row.available, 0);
      if (totalAvailable < request.quantity) {
        setStockNotice(
          `Cannot approve ${request.itemName}. Requested ${request.quantity} ${request.uom}, but only ${totalAvailable} available in stock.`,
        );
        return;
      }

      let remaining = request.quantity;
      setStockRows((prev) =>
        prev.map((row) => {
          if (row.itemName !== request.itemName || remaining <= 0) return row;
          const deduct = Math.min(row.available, remaining);
          remaining -= deduct;
          return { ...row, available: row.available - deduct };
        }),
      );

      setRequestRecords((prev) =>
        prev.map((row) =>
          row.id === requestId ? { ...row, status: "Approved", reviewedAt: todayStr } : row,
        ),
      );
      setStockNotice(`${request.itemName} request approved and ${request.quantity} ${request.uom} deducted from stock.`);
    },
    [requestRecords, stockRows, todayStr],
  );

  const rejectRequestRecord = useCallback(
    (requestId: string) => {
      setRequestRecords((prev) =>
        prev.map((row) =>
          row.id === requestId && row.status === "Pending"
            ? { ...row, status: "Rejected", reviewedAt: todayStr }
            : row,
        ),
      );
      setStockNotice("Request rejected.");
    },
    [todayStr],
  );

  const approveReturnRecord = useCallback(
    (movementId: string) => {
      const movement = movements.find((m) => m.id === movementId && m.type === "Return");
      if (!movement) return;
      if ((returnReviewById[movementId]?.status ?? "Pending") !== "Pending") return;
      if (!movement.toLocationId) {
        setStockNotice(`Cannot approve return ${movement.id} because destination location is missing.`);
        return;
      }

      setStockRows((prev) => {
        const idx = prev.findIndex((r) => r.itemName === movement.itemName && r.locationId === movement.toLocationId);
        if (idx >= 0) {
          return prev.map((r, i) => (i === idx ? { ...r, available: r.available + movement.quantity } : r));
        }
        const template = prev.find((r) => r.itemName === movement.itemName);
        return [
          ...prev,
          {
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `stk-${Date.now()}`,
            itemName: movement.itemName,
            category: template?.category ?? "Stock Item",
            available: movement.quantity,
            reserved: 0,
            uom: template?.uom ?? "pcs",
            locationId: movement.toLocationId,
            minLevel: template?.minLevel ?? INV_DEFAULT_MIN,
          },
        ];
      });

      setReturnReviewById((prev) => ({
        ...prev,
        [movementId]: { status: "Approved", reviewedAt: todayStr },
      }));
      setStockNotice(`Return ${movement.id} approved. ${movement.quantity} added back to stock.`);
    },
    [movements, returnReviewById, todayStr],
  );

  const rejectReturnRecord = useCallback(
    (movementId: string) => {
      if ((returnReviewById[movementId]?.status ?? "Pending") !== "Pending") return;
      setReturnReviewById((prev) => ({
        ...prev,
        [movementId]: { status: "Rejected", reviewedAt: todayStr },
      }));
      setStockNotice(`Return request ${movementId} rejected.`);
    },
    [returnReviewById, todayStr],
  );

  const editStockRows = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const nextMinLevel = typeof window !== "undefined" ? window.prompt("Set new minimum level for selected items/tools", "25") : null;
    const parsed = Number(nextMinLevel);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setStockRows((prev) => prev.map((row) => (ids.includes(row.id) ? { ...row, minLevel: parsed } : row)));
    setStockNotice(`Updated minimum level to ${parsed} for ${ids.length} selected item(s).`);
  }, []);

  const deleteStockRows = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(
            `Warning: You are about to delete ${ids.length} item/tool record(s). This action cannot be undone. Do you want to continue?`,
          )
        : true;
    if (!confirmed) return;
    setStockRows((prev) => prev.filter((row) => !ids.includes(row.id)));
    setSelectedStockIds((prev) => prev.filter((id) => !ids.includes(id)));
    setStockNotice(`Deleted ${ids.length} item/tool record(s) in one operation.`);
  }, []);

  const submitMovement = useCallback(() => {
    const { kind, itemName, quantity, locationId, fromLocationId, toLocationId, reference, date, uom } = movementForm;
    const qty = Number(quantity);
    if (!itemName || !Number.isFinite(qty) || qty <= 0) return;

    const applyReceiveOnly = () => {
      if (!locationId) return;
      setStockRows((prev) => {
        const idx = prev.findIndex((r) => r.itemName === itemName && r.locationId === locationId);
        if (idx >= 0) {
          return prev.map((r, i) => (i === idx ? { ...r, available: r.available + qty } : r));
        }
        const template = prev.find((r) => r.itemName === itemName);
        const u = (uom || template?.uom || "pcs").trim() || "pcs";
        const minLevel = template?.minLevel ?? INV_DEFAULT_MIN;
        const cat = template?.category ?? "Stock Item";
        const id =
          typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `stk-${String(prev.length)}`;
        return [...prev, { id, itemName, category: cat, available: qty, reserved: 0, uom: u, locationId, minLevel }];
      });
      setMovements((prev) => [
        ...prev,
        {
          id: nextMovementId(prev),
          itemName,
          type: "In",
          transactionType: inboundTransactionType,
          quantity: qty,
          fromLocationId: null,
          toLocationId: locationId,
          date,
          reference: reference.trim() || "—",
        },
      ]);
    };

    const applyTransferBetweenLocations = () => {
      if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return false;
      const srcRow = stockRows.find((r) => r.itemName === itemName && r.locationId === fromLocationId);
      if (!srcRow) {
        window.alert("No stock for this item at the source location.");
        return false;
      }
      if (srcRow.available < qty) {
        window.alert("Not enough available quantity at the source location.");
        return false;
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
          transactionType: kind === "receive" ? "Transfer in" : "Internal (movement)",
          quantity: qty,
          fromLocationId,
          toLocationId,
          date,
          reference: reference.trim() || "Transfer",
        },
      ]);
      return true;
    };

    if (kind === "receive") {
      if (inboundTransactionType === "Transfer in") {
        const ok = applyTransferBetweenLocations();
        if (!ok) return;
      } else {
        applyReceiveOnly();
      }
    } else if (kind === "return") {
      if (!locationId) return;
      setMovements((prev) => [
        ...prev,
        {
          id: nextMovementId(prev),
          itemName,
          type: "Return",
          transactionType: "Customer return",
          quantity: qty,
          fromLocationId: null,
          toLocationId: locationId,
          date,
          reference: reference.trim() || "—",
        },
      ]);
      setStockNotice(`Return request logged for ${itemName}. Approve it in Returned tab to add stock.`);
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
          transactionType: outboundTransactionType,
          quantity: qty,
          fromLocationId: locationId,
          toLocationId: null,
          date,
          reference: reference.trim() || "—",
        },
      ]);
    } else {
      const ok = applyTransferBetweenLocations();
      if (!ok) return;
    }
    setMovementModalOpen(false);
  }, [movementForm, stockRows, inboundTransactionType, outboundTransactionType]);

  const nameFieldLabel =
    addItemForm.category === "Service Item" ? "Service Name" : addItemForm.category === "Asset Item" ? "Asset Name" : "Item Name";

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
            <h3 className="text-sm font-semibold text-foreground">Recent transactions</h3>
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
          {stockNotice ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{stockNotice}</p>
          ) : null}
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
                <option value="Stock Item">Stock Item</option>
                <option value="Consumable Item">Consumable Item</option>
                <option value="Service Item">Service Item</option>
                <option value="Asset Item">Asset Item</option>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-9">
                    New transaction
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => openMovementModal("receive")}>Inbound</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openMovementModal("issue")}>Outbound</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openMovementModal("transfer")}>Internal (movement)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

          {selectedStockIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                {selectedStockIds.length} selected (items/tools) for batch operations
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => openRequestModal(selectedStockIds, "bulk")}>
                  Bulk request
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => editStockRows(selectedStockIds)}>
                  Bulk edit
                </Button>
                <Button type="button" size="sm" variant="destructive" className="h-8" onClick={() => deleteStockRows(selectedStockIds)}>
                  Bulk delete
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-medium">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFilteredSelection} aria-label="Select all listed items" />
                  </th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Available Quantity</th>
                  <th className="px-4 py-3 font-medium">Reserved Quantity</th>
                  <th className="px-4 py-3 font-medium">Unit of Measurement</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Minimum Level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((row) => {
                  const st = invStockStatus(row.available, row.minLevel);
                  const selected = selectedStockIds.includes(row.id);
                  return (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleStockSelection(row.id)}
                          aria-label={`Select ${row.itemName}`}
                        />
                      </td>
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
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="More stock actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => openRequestModal([row.id], "single")}>Request</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => editStockRows([row.id])}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteStockRows([row.id])}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Transaction" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <select className={filterSelect} value={movTypeFilter} onChange={(e) => setMovTypeFilter(e.target.value)}>
              <option value="All">All transaction types</option>
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
                  <th className="px-4 py-3 font-medium">Transaction Type</th>
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
                      <td className="px-4 py-3">{m.transactionType}</td>
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

      {tab === "Requested" && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Request Date</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Item / Tool</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requestRecords.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>
                      No requested items/tools yet.
                    </td>
                  </tr>
                ) : (
                  requestRecords.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-4 py-3 text-muted-foreground">{row.requestedAt}</td>
                      <td className="px-4 py-3">{row.mode === "single" ? "Single request" : "Bulk request"}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{row.itemName}</td>
                      <td className="px-4 py-3 tabular-nums">{row.quantity} {row.uom}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.projectKey ? (INV_PROJECT_OPTIONS.find((p) => p.value === row.projectKey)?.label ?? row.projectKey) : "No project"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.departmentKey ? (INV_DEPT_OPTIONS.find((d) => d.value === row.departmentKey)?.label ?? row.departmentKey) : "No department"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={cn(
                            "font-normal hover:opacity-100",
                            row.status === "Approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : row.status === "Rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800",
                          )}
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {row.status === "Pending" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="Requested item actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem onClick={() => approveRequestRecord(row.id)}>Approve</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => rejectRequestRecord(row.id)}>Reject</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-muted-foreground">{row.reviewedAt ?? "-"}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Returned" && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg bg-card shadow-sm ring-1 ring-slate-100/80">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Movement ID</th>
                  <th className="px-4 py-3 font-medium">Item Name</th>
                  <th className="px-4 py-3 font-medium">Returned Quantity</th>
                  <th className="px-4 py-3 font-medium">To Location</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {returnedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>
                      No returned items/tools yet.
                    </td>
                  </tr>
                ) : (
                  returnedRows.map((row) => {
                    const review = returnedRowReview(row.id);
                    return (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="px-4 py-3 font-mono text-[11px] text-foreground">{row.id}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{row.itemName}</td>
                        <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
                        <td className="px-4 py-3 text-muted-foreground">{invLocName(locations, row.toLocationId)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.reference}</td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              "font-normal hover:opacity-100",
                              review.status === "Approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : review.status === "Rejected"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800",
                            )}
                          >
                            {review.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {review.status === "Pending" ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="Returned item actions">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => approveReturnRecord(row.id)}>Approve</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => rejectReturnRecord(row.id)}>Reject</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-muted-foreground">{review.reviewedAt ?? "-"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
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
                  {(["Stock Item", "Consumable Item", "Service Item", "Asset Item"] as const).map((c) => (
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
              <h3 className="text-sm font-semibold">New transaction</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setMovementModalOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-5">
              <fieldset className="space-y-3">
                <legend className="text-xs font-medium text-foreground">Transaction type</legend>
                {movementForm.kind === "receive" ? (
                  <select
                    className={selectClass}
                    value={inboundTransactionType}
                    onChange={(e) =>
                      setInboundTransactionType(
                        e.target.value as "Purchase receipt (from PO)" | "Production output" | "Customer return" | "Transfer in",
                      )
                    }
                  >
                    <option value="Purchase receipt (from PO)">Purchase receipt (from PO)</option>
                    <option value="Production output">Production output</option>
                    <option value="Customer return">Customer return</option>
                    <option value="Transfer in">Transfer in</option>
                  </select>
                ) : movementForm.kind === "issue" ? (
                  <select
                    className={selectClass}
                    value={outboundTransactionType}
                    onChange={(e) =>
                      setOutboundTransactionType(
                        e.target.value as
                          | "Sales issue (delivery)"
                          | "Consumption (project or department use)"
                          | "Scrap / damage"
                          | "Transfer out",
                      )
                    }
                  >
                    <option value="Sales issue (delivery)">Sales issue (delivery)</option>
                    <option value="Consumption (project or department use)">Consumption (project or department use)</option>
                    <option value="Scrap / damage">Scrap / damage</option>
                    <option value="Transfer out">Transfer out</option>
                  </select>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                    {(
                      [
                        ["receive", "Inbound"],
                        ["issue", "Outbound"],
                        ["transfer", "Internal (movement)"],
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
                )}
              </fieldset>

              {(movementForm.kind === "receive" || movementForm.kind === "issue") && (
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
                  {movementForm.kind === "receive" ? (
                    inboundTransactionType === "Transfer in" ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">From warehouse</label>
                          <select
                            className={selectClass}
                            value={movementForm.fromLocationId}
                            onChange={(e) => setMovementForm((f) => ({ ...f, fromLocationId: e.target.value }))}
                          >
                            <option value="">Select source warehouse</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">To warehouse</label>
                          <select
                            className={selectClass}
                            value={movementForm.toLocationId}
                            onChange={(e) => setMovementForm((f) => ({ ...f, toLocationId: e.target.value }))}
                          >
                            <option value="">Select destination warehouse</option>
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
                            placeholder="e.g. Transfer note"
                            value={movementForm.reference}
                            onChange={(e) => setMovementForm((f) => ({ ...f, reference: e.target.value }))}
                          />
                        </div>
                      </>
                    ) : (
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
                            placeholder="e.g. PO-1024"
                            value={movementForm.reference}
                            onChange={(e) => setMovementForm((f) => ({ ...f, reference: e.target.value }))}
                          />
                        </div>
                      </>
                    )
                  ) : null}
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

      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,720px)] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {requestMode === "single" ? "Single Item/Tool Request" : "Bulk Request for Items/Tools"}
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setRequestError("");
                  setRequestModalOpen(false);
                }}
                aria-label="Close request form"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Project (optional)</label>
                  <select className={selectClass} value={requestProjectKey} onChange={(e) => setRequestProjectKey(e.target.value)}>
                    <option value="">None</option>
                    {INV_PROJECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Department (optional)</label>
                  <select className={selectClass} value={requestDepartmentKey} onChange={(e) => setRequestDepartmentKey(e.target.value)}>
                    <option value="">None</option>
                    {INV_DEPT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Item / Tool</th>
                      <th className="px-3 py-2 font-medium">Quantity</th>
                      <th className="px-3 py-2 font-medium">UoM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((row) => (
                      <tr key={row.id} className="border-t border-border/50">
                        <td className="px-3 py-2">{row.itemName}</td>
                        <td className="px-3 py-2">
                          <Input
                            className="h-8"
                            type="number"
                            min={1}
                            value={row.quantity}
                            onChange={(e) =>
                              setRequestRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r)),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2">{row.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {requestError ? <p className="text-xs text-red-600">{requestError}</p> : null}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                className="h-9 min-w-24"
                onClick={() => {
                  setRequestError("");
                  setRequestModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button className="h-9 min-w-28 text-white hover:opacity-90" style={{ backgroundColor: PRIMARY }} onClick={submitRequest}>
                Submit Request
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
