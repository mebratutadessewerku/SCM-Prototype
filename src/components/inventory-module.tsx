"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, CircleAlert, MoreVertical, Package, Plus, Search, Settings, Warehouse, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

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
type InvConditionStatus = "Good" | "Damaged" | "Faulty" | "Under Maintenance" | "Lost" | "Obsolete";

type InvStockRow = {
  id: string;
  itemName: string;
  category: InvItemCategory;
  conditionStatus: InvConditionStatus;
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
type ReturnReviewStatus = "Pending" | "Approved" | "Received" | "Rejected";
type InvRequestRecord = {
  id: string;
  itemName: string;
  category: InvItemCategory;
  quantity: number;
  uom: string;
  projectKey: string;
  departmentKey: string;
  mode: InvRequestMode;
  requestedAt: string;
  status: "Pending" | "Approved" | "Delivered" | "Rejected";
  reviewedAt: string | null;
  deliveredAt: string | null;
};

type CustomSettingKey =
  | "itemCategory"
  | "unitOfMeasurement"
  | "location"
  | "store"
  | "bin"
  | "availabilityStatus"
  | "conditionStatus"
  | "performanceStatus"
  | "currency";

type CustomSettingOptions = Record<CustomSettingKey, string[]>;

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

function getItemStockTotals(stockRows: InvStockRow[], itemName: string) {
  return stockRows
    .filter((row) => row.itemName === itemName)
    .reduce(
      (totals, row) => ({
        available: totals.available + row.available,
        reserved: totals.reserved + row.reserved,
      }),
      { available: 0, reserved: 0 },
    );
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";
const filterSelect = "h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs sm:w-40";

function InventoryTabs({
  tab,
  onTab,
  onOpenSettings,
}: {
  tab: InventoryTab;
  onTab: (t: InventoryTab) => void;
  onOpenSettings: () => void;
}) {
  const items: InventoryTab[] = ["Overview", "Stock", "Transaction", "Requested", "Returned"];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-transparent">
      <div className="flex flex-wrap gap-8">
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
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={onOpenSettings}>
        <Settings className="mr-1 h-3.5 w-3.5" />
        Settings
      </Button>
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
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

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
      conditionStatus: "Good",
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
      conditionStatus: "Good",
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
      conditionStatus: "Good",
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
      conditionStatus: "Under Maintenance",
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
    itemNumber: "",
    type: "Consumable",
    quantity: "",
    uom: "pcs",
    description: "",
    store: "",
    locationId: "",
    status: "Active",
    minLevel: "",
    model: "",
    serialNumber: "",
    manufacturer: "",
    price: "",
    currency: "USD",
    dateOfPurchase: "",
    warranty: "",
    conditionStatus: "Good" as InvConditionStatus,
    projectKey: "",
    departmentKey: "",
  });
  const [addItemError, setAddItemError] = useState("");

  const [stockSearch, setStockSearch] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>("All");
  const [stockLocFilter, setStockLocFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("All");
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const requestImportInputRef = useRef<HTMLInputElement | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestMode, setRequestMode] = useState<InvRequestMode>("single");
  const [requestProjectKey, setRequestProjectKey] = useState("");
  const [requestDepartmentKey, setRequestDepartmentKey] = useState("");
  const [requestRows, setRequestRows] = useState<Array<{ id: string; itemName: string; category: InvItemCategory; quantity: string; uom: string }>>(
    [],
  );
  const [requestItemPickerOpen, setRequestItemPickerOpen] = useState(false);
  const [requestItemSearch, setRequestItemSearch] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestRecords, setRequestRecords] = useState<InvRequestRecord[]>([]);
  const [returnReviewById, setReturnReviewById] = useState<
    Record<string, { status: ReturnReviewStatus; reviewedAt: string | null; receivedAt: string | null }>
  >({});
  const [customSettingOptions, setCustomSettingOptions] = useState<CustomSettingOptions>({
    itemCategory: ["Stock Item", "Consumable Item", "Service Item", "Asset Item"],
    unitOfMeasurement: ["pcs", "m", "kg", "l"],
    location: ["Warehouse", "Site", "Bin"],
    store: ["Main Store", "Regional Store"],
    bin: ["A-01", "B-14"],
    availabilityStatus: ["In Stock", "Low Stock", "Out of Stock"],
    conditionStatus: ["Good", "Damaged", "Faulty", "Under Maintenance", "Lost", "Obsolete"],
    performanceStatus: ["Active", "Inactive", "Under Maintenance"],
    currency: ["USD", "EUR", "ETB"],
  });
  const [customSettingInputs, setCustomSettingInputs] = useState<Record<CustomSettingKey, string>>({
    itemCategory: "",
    unitOfMeasurement: "",
    location: "",
    store: "",
    bin: "",
    availabilityStatus: "",
    conditionStatus: "",
    performanceStatus: "",
    currency: "",
  });

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
      itemNumber: "",
      type: "Consumable",
      quantity: "",
      uom: "pcs",
      description: "",
      store: "",
      locationId: locations[0]?.id ?? "",
      status: "Active",
      minLevel: String(INV_DEFAULT_MIN),
      model: "",
      serialNumber: "",
      manufacturer: "",
      price: "",
      currency: "USD",
      dateOfPurchase: "",
      warranty: "",
      conditionStatus: "Good",
      projectKey: "",
      departmentKey: "",
    });
    setAddItemError("");
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
    (movementId: string) => returnReviewById[movementId] ?? { status: "Pending" as const, reviewedAt: null, receivedAt: null },
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

  const requestSelectableItems = useMemo(() => {
    return [...stockRows]
      .sort((a, b) => a.itemName.localeCompare(b.itemName))
      .filter((row) => {
        const q = requestItemSearch.trim().toLowerCase();
        if (!q) return true;
        return (
          row.itemName.toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q) ||
          row.uom.toLowerCase().includes(q)
        );
      });
  }, [stockRows, requestItemSearch]);

  const submitAddItem = useCallback(() => {
    setAddItemError("");
    const qty = Number(addItemForm.quantity);
    const minL = Number(addItemForm.minLevel) || INV_DEFAULT_MIN;
    const isBulkItem = Number.isFinite(qty) && qty > 1;
    const requiresSerial = addItemForm.type === "Tool" || addItemForm.type === "Asset";
    if (!addItemForm.name.trim() || !Number.isFinite(qty) || qty < 0 || !addItemForm.locationId) {
      setAddItemError("Please fill required fields: item name, quantity, and location.");
      return;
    }
    if (requiresSerial && !isBulkItem && !addItemForm.serialNumber.trim()) {
      setAddItemError("Serial Number is required for Tool/Asset when quantity is 1.");
      return;
    }
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `stk-${Date.now()}`;
    setStockRows((prev) => [
      ...prev,
      {
        id,
        itemName: addItemForm.name.trim(),
        category: addItemForm.category,
        conditionStatus: addItemForm.conditionStatus,
        available: qty,
        reserved: 0,
        uom: addItemForm.uom.trim() || "pcs",
        locationId: addItemForm.locationId,
        minLevel: minL,
      },
    ]);
    setAddItemError("");
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
      setRequestItemSearch("");
      setRequestItemPickerOpen(false);
      setRequestRows(
        rows.map((row) => ({
          id: row.id,
          itemName: row.itemName,
          category: row.category,
          quantity: "1",
          uom: row.uom,
        })),
      );
      setRequestModalOpen(true);
    },
    [stockRows],
  );

  const addRequestItemRow = useCallback((item: InvStockRow) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-row-${Date.now()}`;
    setRequestRows((prev) => [
      ...prev,
      {
        id,
        itemName: item.itemName,
        category: item.category,
        quantity: "1",
        uom: item.uom,
      },
    ]);
    setRequestItemPickerOpen(false);
    setRequestItemSearch("");
    setRequestError("");
  }, []);

  const removeRequestRow = useCallback((id: string) => {
    setRequestRows((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const submitRequest = useCallback(() => {
    if (requestRows.length === 0) {
      setRequestError("Add at least one item category before submitting.");
      return;
    }
    const validNames = requestRows.every((row) => row.itemName.trim().length > 0);
    if (!validNames) {
      setRequestError("Each row must include an item/tool name.");
      return;
    }
    const validQty = requestRows.every((row) => Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0);
    if (!validQty) {
      setRequestError("All quantities must be greater than 0.");
      return;
    }
    const requestedByItem = requestRows.reduce<Record<string, { quantity: number; uom: string }>>((acc, row) => {
      const key = row.itemName.trim();
      if (!key) return acc;
      const quantity = Number(row.quantity);
      const existing = acc[key];
      if (existing) {
        acc[key] = { ...existing, quantity: existing.quantity + quantity };
      } else {
        acc[key] = { quantity, uom: row.uom };
      }
      return acc;
    }, {});
    const overAllocatedEntry = Object.entries(requestedByItem).find(([itemName, req]) => {
      const totals = getItemStockTotals(stockRows, itemName);
      const freeToReserve = Math.max(0, totals.available - totals.reserved);
      return req.quantity > freeToReserve;
    });
    if (overAllocatedEntry) {
      const [itemName, req] = overAllocatedEntry;
      const totals = getItemStockTotals(stockRows, itemName);
      const freeToReserve = Math.max(0, totals.available - totals.reserved);
      setRequestError(
        `${itemName}: requested ${req.quantity} ${req.uom}, but ${totals.reserved} ${req.uom} is already reserved out of ${totals.available} total. Only ${freeToReserve} ${req.uom} can be reserved now.`,
      );
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
    setStockRows((prev) => {
      const requestedCopy = Object.entries(requestedByItem).reduce<Record<string, number>>((acc, [itemName, req]) => {
        acc[itemName] = req.quantity;
        return acc;
      }, {});
      return prev.map((row) => {
        const remaining = requestedCopy[row.itemName] ?? 0;
        if (remaining <= 0) return row;
        const reservable = Math.max(0, row.available - row.reserved);
        const reserveNow = Math.min(reservable, remaining);
        if (reserveNow <= 0) return row;
        requestedCopy[row.itemName] = remaining - reserveNow;
        return { ...row, reserved: row.reserved + reserveNow };
      });
    });
    setRequestRecords((prev) => [
      ...requestRows.map((row) => ({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${row.id}`,
        itemName: row.itemName.trim(),
        category: row.category,
        quantity: Number(row.quantity),
        uom: row.uom,
        projectKey: requestProjectKey,
        departmentKey: requestDepartmentKey,
        mode: requestMode,
        requestedAt: todayStr,
        status: "Pending" as const,
        reviewedAt: null,
        deliveredAt: null,
      })),
      ...prev,
    ]);
    setRequestModalOpen(false);
    setRequestError("");
  }, [requestDepartmentKey, requestMode, requestProjectKey, requestRows, stockRows, todayStr]);

  const approveRequestRecord = useCallback(
    (requestId: string) => {
      const request = requestRecords.find((r) => r.id === requestId);
      if (!request || request.status !== "Pending") return;

      setRequestRecords((prev) =>
        prev.map((row) =>
          row.id === requestId ? { ...row, status: "Approved", reviewedAt: todayStr, deliveredAt: null } : row,
        ),
      );
      setStockNotice(`${request.itemName} request approved. Awaiting storekeeper delivery confirmation.`);
    },
    [requestRecords, todayStr],
  );

  const confirmRequestDelivery = useCallback(
    (requestId: string) => {
      const request = requestRecords.find((r) => r.id === requestId);
      if (!request || request.status !== "Approved") return;

      const totals = getItemStockTotals(stockRows, request.itemName);
      if (totals.reserved < request.quantity) {
        setStockNotice(
          `Cannot deliver ${request.itemName}. Requested ${request.quantity} ${request.uom}, but only ${totals.reserved} ${request.uom} is reserved (${totals.available} total available).`,
        );
        return;
      }

      let remaining = request.quantity;
      setStockRows((prev) =>
        prev.map((row) => {
          if (row.itemName !== request.itemName || remaining <= 0) return row;
          const issueNow = Math.min(row.reserved, remaining);
          remaining -= issueNow;
          return {
            ...row,
            available: row.available - issueNow,
            reserved: row.reserved - issueNow,
          };
        }),
      );

      setRequestRecords((prev) =>
        prev.map((row) =>
          row.id === requestId ? { ...row, status: "Delivered", deliveredAt: todayStr } : row,
        ),
      );
      setStockNotice(`${request.itemName} delivery confirmed and ${request.quantity} ${request.uom} deducted from stock.`);
    },
    [requestRecords, stockRows, todayStr],
  );

  const rejectRequestRecord = useCallback(
    (requestId: string) => {
      const request = requestRecords.find((r) => r.id === requestId);
      if (!request || (request.status !== "Pending" && request.status !== "Approved")) return;

      let releaseRemaining = request.quantity;
      setStockRows((prev) =>
        prev.map((row) => {
          if (row.itemName !== request.itemName || releaseRemaining <= 0) return row;
          const releaseNow = Math.min(row.reserved, releaseRemaining);
          releaseRemaining -= releaseNow;
          return { ...row, reserved: row.reserved - releaseNow };
        }),
      );
      setRequestRecords((prev) =>
        prev.map((row) =>
          row.id === requestId && (row.status === "Pending" || row.status === "Approved")
            ? { ...row, status: "Rejected", reviewedAt: todayStr, deliveredAt: null }
            : row,
        ),
      );
      setStockNotice("Request rejected.");
    },
    [requestRecords, todayStr],
  );

  const approveReturnRecord = useCallback(
    (movementId: string) => {
      const movement = movements.find((m) => m.id === movementId && m.type === "Return");
      if (!movement) return;
      if ((returnReviewById[movementId]?.status ?? "Pending") !== "Pending") return;

      setReturnReviewById((prev) => ({
        ...prev,
        [movementId]: { status: "Approved", reviewedAt: todayStr, receivedAt: null },
      }));
      setStockNotice(`Return ${movement.id} approved. Awaiting storekeeper receipt confirmation.`);
    },
    [movements, returnReviewById, todayStr],
  );

  const confirmReturnReceipt = useCallback(
    (movementId: string) => {
      const movement = movements.find((m) => m.id === movementId && m.type === "Return");
      if (!movement) return;
      if ((returnReviewById[movementId]?.status ?? "Pending") !== "Approved") return;
      if (!movement.toLocationId) {
        setStockNotice(`Cannot confirm receipt for ${movement.id} because destination location is missing.`);
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
            conditionStatus: template?.conditionStatus ?? "Good",
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
        [movementId]: {
          status: "Received",
          reviewedAt: prev[movementId]?.reviewedAt ?? todayStr,
          receivedAt: todayStr,
        },
      }));
      setStockNotice(`Receipt confirmed for ${movement.id}. ${movement.quantity} added back to stock.`);
    },
    [movements, returnReviewById, todayStr],
  );

  const rejectReturnRecord = useCallback(
    (movementId: string) => {
      if ((returnReviewById[movementId]?.status ?? "Pending") !== "Pending") return;
      setReturnReviewById((prev) => ({
        ...prev,
        [movementId]: { status: "Rejected", reviewedAt: todayStr, receivedAt: null },
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

  const addCustomSettingOption = useCallback(
    (key: CustomSettingKey) => {
      const value = customSettingInputs[key].trim();
      if (!value) return;
      setCustomSettingOptions((prev) => {
        const exists = prev[key].some((item) => item.toLowerCase() === value.toLowerCase());
        if (exists) return prev;
        return { ...prev, [key]: [...prev[key], value] };
      });
      setCustomSettingInputs((prev) => ({ ...prev, [key]: "" }));
      setStockNotice(`Added "${value}" to ${key}.`);
    },
    [customSettingInputs],
  );

  const removeCustomSettingOption = useCallback((key: CustomSettingKey, value: string) => {
    setCustomSettingOptions((prev) => ({ ...prev, [key]: prev[key].filter((item) => item !== value) }));
  }, []);

  const exportStockTemplate = useCallback(() => {
    const rows = stockRows.map((row) => ({
      "Item / Tool name": row.itemName,
      Category: row.category,
      Quantity: row.available,
      UoM: row.uom,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Items");
    XLSX.writeFile(wb, "stock-items-template.xlsx");
    setStockNotice("Stock template exported successfully.");
  }, [stockRows]);

  const importBulkRequestFile = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          setStockNotice("Import failed: workbook has no sheets.");
          return;
        }
        const sheet = wb.Sheets[firstSheet];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const normalized = rawRows
          .map((r) => {
            const itemName = String(r["Item / Tool name"] ?? r["Item Name"] ?? r["itemName"] ?? "").trim();
            const category = String(r["Category"] ?? r["category"] ?? "").trim() as InvItemCategory | "";
            const quantityRaw = String(r["Quantity"] ?? r["quantity"] ?? "").trim();
            const uom = String(r["UoM"] ?? r["UOM"] ?? r["uom"] ?? "").trim();
            return { itemName, category, quantityRaw, uom };
          })
          .filter((r) => r.itemName.length > 0);

        if (normalized.length === 0) {
          setStockNotice("Import failed: no valid rows were found.");
          return;
        }

        const importedRows = normalized
          .map((row, idx) => {
            const matched =
              stockRows.find(
                (s) =>
                  s.itemName.toLowerCase() === row.itemName.toLowerCase() &&
                  (!row.category || s.category.toLowerCase() === row.category.toLowerCase()),
              ) ?? stockRows.find((s) => s.itemName.toLowerCase() === row.itemName.toLowerCase());

            if (!matched) return null;

            const id =
              typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-import-${Date.now()}-${idx}`;
            const parsedQty = Number(row.quantityRaw);
            const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? String(parsedQty) : "1";
            return {
              id,
              itemName: matched.itemName,
              category: matched.category,
              quantity,
              uom: row.uom || matched.uom,
            };
          })
          .filter((row): row is { id: string; itemName: string; category: InvItemCategory; quantity: string; uom: string } => row !== null);

        if (importedRows.length === 0) {
          setStockNotice("Import failed: no rows matched existing stock items.");
          return;
        }

        setRequestMode("bulk");
        setRequestProjectKey("");
        setRequestDepartmentKey("");
        setRequestError("");
        setRequestItemSearch("");
        setRequestItemPickerOpen(false);
        setRequestRows(importedRows);
        setRequestModalOpen(true);
        setStockNotice(`Imported ${importedRows.length} item(s) into bulk request form.`);
      } catch {
        setStockNotice("Import failed: unsupported or invalid file format.");
      }
    },
    [stockRows],
  );

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
        return [
          ...prev,
          { id, itemName, category: cat, conditionStatus: template?.conditionStatus ?? "Good", available: qty, reserved: 0, uom: u, locationId, minLevel },
        ];
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
              conditionStatus: src.conditionStatus,
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

  const addItemQty = Number(addItemForm.quantity);
  const isConsumableType = addItemForm.type === "Consumable";
  const isToolOrAssetType = addItemForm.type === "Tool" || addItemForm.type === "Asset";
  const disableSerialTracking = Number.isFinite(addItemQty) && addItemQty > 1;
  const customSettingFields: Array<{ key: CustomSettingKey; label: string }> = [
    { key: "itemCategory", label: "Item category" },
    { key: "unitOfMeasurement", label: "Unit of measurement" },
    { key: "location", label: "Location" },
    { key: "store", label: "Store" },
    { key: "bin", label: "Bin" },
    { key: "availabilityStatus", label: "Availability status" },
    { key: "conditionStatus", label: "Condition status" },
    { key: "performanceStatus", label: "Performance status" },
    { key: "currency", label: "Currency" },
  ];

  return (
    <div className="space-y-6">
      <InventoryTabs tab={tab} onTab={setTab} onOpenSettings={() => setSettingsModalOpen(true)} />

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
                  <th className="px-4 py-3 font-medium">Availability status</th>
                  <th className="px-4 py-3 font-medium">Condition status</th>
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
                      <td className="px-4 py-3">{row.conditionStatus}</td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="More stock actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={exportStockTemplate}>Import Template</DropdownMenuItem>
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
                      <td className="px-4 py-3 font-medium text-foreground">{row.itemName} ({row.category})</td>
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
                            row.status === "Delivered"
                              ? "bg-emerald-100 text-emerald-800"
                              : row.status === "Approved"
                                ? "bg-blue-100 text-blue-800"
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
                        ) : row.status === "Approved" ? (
                          <Button type="button" size="sm" className="h-8" onClick={() => confirmRequestDelivery(row.id)}>
                            Confirm delivered
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">{row.deliveredAt ?? row.reviewedAt ?? "-"}</span>
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
                            review.status === "Received"
                                ? "bg-emerald-100 text-emerald-800"
                              : review.status === "Approved"
                                ? "bg-blue-100 text-blue-800"
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
                          ) : review.status === "Approved" ? (
                            <Button type="button" size="sm" className="h-8" onClick={() => confirmReturnReceipt(row.id)}>
                              Confirm receipt
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">{review.receivedAt ?? review.reviewedAt ?? "-"}</span>
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

      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,760px)] w-full max-w-4xl overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Custom settings</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setSettingsModalOpen(false)} aria-label="Close settings form">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {customSettingFields.map((field) => (
                <div key={field.key} className="space-y-2 rounded-md border border-border p-3">
                  <label className="text-xs font-semibold text-foreground">{field.label}</label>
                  <div className="flex gap-2">
                    <Input
                      className="h-8"
                      value={customSettingInputs[field.key]}
                      placeholder={`Add ${field.label.toLowerCase()}`}
                      onChange={(e) => setCustomSettingInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                    <Button type="button" size="sm" className="h-8" onClick={() => addCustomSettingOption(field.key)}>
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {customSettingOptions[field.key].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                        onClick={() => removeCustomSettingOption(field.key, value)}
                        title="Click to remove"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
              <Button type="button" className="h-9 min-w-24" onClick={() => setSettingsModalOpen(false)}>
                Done
              </Button>
            </div>
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
                  setAddItemError("");
                  setAddItemModalOpen(false);
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-6 text-xs">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Item Master</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Item Name</label>
                    <Input className="h-9" value={addItemForm.name} onChange={(e) => setAddItemForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Item Number</label>
                    <Input
                      className="h-9"
                      value={addItemForm.itemNumber}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, itemNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <select className={selectClass} value={addItemForm.type} onChange={(e) => setAddItemForm((f) => ({ ...f, type: e.target.value }))}>
                      <option value="Consumable">Consumable</option>
                      <option value="Tool">Tool</option>
                      <option value="Asset">Asset</option>
                      <option value="Service">Service</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Category</label>
                    <select
                      className={selectClass}
                      value={addItemForm.category}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, category: e.target.value as InvItemCategory }))}
                    >
                      {customSettingOptions.itemCategory.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">UOM</label>
                    <select className={selectClass} value={addItemForm.uom} onChange={(e) => setAddItemForm((f) => ({ ...f, uom: e.target.value }))}>
                      {customSettingOptions.unitOfMeasurement.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
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
                    <label className="text-xs font-medium text-muted-foreground">Image</label>
                    <Input className="h-9 cursor-pointer text-xs file:mr-2" type="file" accept="image/*" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Inventory Info</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Store</label>
                    <select className={selectClass} value={addItemForm.store} onChange={(e) => setAddItemForm((f) => ({ ...f, store: e.target.value }))}>
                      <option value="">Select store</option>
                      {customSettingOptions.store.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
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
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <select className={selectClass} value={addItemForm.status} onChange={(e) => setAddItemForm((f) => ({ ...f, status: e.target.value }))}>
                      {customSettingOptions.performanceStatus.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Condition Status</label>
                    <select
                      className={selectClass}
                      value={addItemForm.conditionStatus}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, conditionStatus: e.target.value as InvConditionStatus }))}
                    >
                      <option value="Good">Good</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Faulty">Faulty</option>
                      <option value="Under Maintenance">Under Maintenance</option>
                      <option value="Lost">Lost</option>
                      <option value="Obsolete">Obsolete</option>
                    </select>
                  </div>
                </div>
              </div>

              {!isConsumableType ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-foreground">Asset/Tool Details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Model</label>
                      <Input className="h-9" value={addItemForm.model} onChange={(e) => setAddItemForm((f) => ({ ...f, model: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Serial Number {isToolOrAssetType && !disableSerialTracking ? <span className="text-red-600">*</span> : null}
                      </label>
                      <Input
                        className="h-9"
                        value={disableSerialTracking ? "" : addItemForm.serialNumber}
                        disabled={disableSerialTracking}
                        placeholder={disableSerialTracking ? "Disabled for bulk items" : "Enter serial number"}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, serialNumber: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Manufacturer</label>
                      <Input
                        className="h-9"
                        value={addItemForm.manufacturer}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, manufacturer: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Warranty</label>
                      <Input className="h-9" value={addItemForm.warranty} onChange={(e) => setAddItemForm((f) => ({ ...f, warranty: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Warranty Document</label>
                      <Input className="h-9 cursor-pointer text-xs file:mr-2" type="file" />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Procurement Info</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Price</label>
                    <Input className="h-9" value={addItemForm.price} onChange={(e) => setAddItemForm((f) => ({ ...f, price: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Currency</label>
                    <select
                      className={selectClass}
                      value={addItemForm.currency}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, currency: e.target.value }))}
                    >
                      {customSettingOptions.currency.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date of Purchase</label>
                    <Input
                      className="h-9"
                      type="date"
                      value={addItemForm.dateOfPurchase}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, dateOfPurchase: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">PI Document</label>
                    <Input className="h-9 cursor-pointer text-xs file:mr-2" type="file" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Assignment</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Department</label>
                    <select
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
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Project</label>
                    <select
                      className={selectClass}
                      value={addItemForm.projectKey}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, projectKey: e.target.value }))}
                    >
                      <option value="">None</option>
                      {INV_PROJECT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {disableSerialTracking && isToolOrAssetType ? (
                <p className="text-[11px] text-amber-700">Serial tracking is disabled for bulk items (quantity greater than 1).</p>
              ) : null}
              {addItemError ? <p className="text-xs text-red-600">{addItemError}</p> : null}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                className="h-9 min-w-24"
                onClick={() => {
                  setAddItemError("");
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
                      <th className="px-3 py-2 font-medium">Item / Tool name</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Quantity</th>
                      <th className="px-3 py-2 font-medium">UoM</th>
                      <th className="px-3 py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((row) => (
                      <tr key={row.id} className="border-t border-border/50">
                        <td className="px-3 py-2">{row.itemName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category}</td>
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
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => removeRequestRow(row.id)}
                            disabled={requestRows.length === 1}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <input
                  ref={requestImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void importBulkRequestFile(file);
                    }
                    e.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mr-2 h-8"
                  onClick={() => requestImportInputRef.current?.click()}
                >
                  Import
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setRequestItemPickerOpen((prev) => !prev)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>
              {requestItemPickerOpen ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <Input
                    className="h-8"
                    placeholder="Search item, category, or UoM"
                    value={requestItemSearch}
                    onChange={(e) => setRequestItemSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-auto rounded-md border border-border/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-2 font-medium">Item / Tool name</th>
                          <th className="px-2 py-2 font-medium">Category</th>
                          <th className="px-2 py-2 font-medium">Quantity</th>
                          <th className="px-2 py-2 font-medium">UoM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requestSelectableItems.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-center text-muted-foreground" colSpan={4}>
                              No matching items found.
                            </td>
                          </tr>
                        ) : (
                          requestSelectableItems.map((item) => (
                            <tr
                              key={item.id}
                              className="cursor-pointer border-t border-border/50 hover:bg-muted/40"
                              onClick={() => addRequestItemRow(item)}
                            >
                              <td className="px-2 py-2">{item.itemName}</td>
                              <td className="px-2 py-2 text-muted-foreground">{item.category}</td>
                              <td className="px-2 py-2 tabular-nums">{item.available}</td>
                              <td className="px-2 py-2">{item.uom}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

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
