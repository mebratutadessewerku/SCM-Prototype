"use client";

import { ApprovalsWorkflowModule, WorkflowRuleEditorForm } from "@/components/approvals-workflow-module";
import { InventoryModule } from "@/components/inventory-module";
import { ReportingModule } from "@/components/reporting-module";
import {
  buildInitialDemoInstances,
  createWorkflowInstance,
  DEFAULT_WORKFLOW_RULES,
  newWorkflowId,
  type DocType,
  type SubmitApprovalDocumentInput,
  type WorkflowRule,
} from "@/lib/approval-workflow";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Activity,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FileBarChart2,
  FileSearch,
  FileText,
  HandCoins,
  LayoutGrid,
  MoreHorizontal,
  Eye,
  Download,
  Package,
  PieChart,
  Search,
  ShoppingCart,
  Users,
  Plus,
  Wallet,
  X,
  ClipboardList,
  CheckSquare,
} from "lucide-react";
import { TableDeleteIconButton, TableEditIconButton } from "@/components/table-action-icon-buttons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MainModule =
  | "Dashboard"
  | "Procurement"
  | "Project"
  | "Sourcing"
  | "Inventory"
  | "Budget"
  | "Approvals"
  | "Reporting";

type ProcurementTab =
  | "Overview"
  | "Master Data"
  | "Purchase Requisition"
  | "RFQ"
  | "Purchase Order"
  | "Settings";
type ProcurementSettingsSegment = "uom" | "item";
type ProcurementUomRow = { id: string; unitName: string; abbreviation: string; description: string };
type ProcurementItemCategoryRow = { id: string; categoryName: string; description: string; createdAt: string };

const modules: { label: MainModule; icon: React.ElementType }[] = [
  { label: "Dashboard", icon: LayoutGrid },
  { label: "Project", icon: Building2 },
  { label: "Sourcing", icon: Users },
  { label: "Procurement", icon: ShoppingCart },
  { label: "Inventory", icon: Boxes },
  { label: "Budget", icon: HandCoins },
  { label: "Approvals", icon: ClipboardCheck },
  { label: "Reporting", icon: FileBarChart2 },
];

const statusTone: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  "Not Approved": "bg-red-100 text-destructive",
  Rejected: "bg-red-100 text-destructive",
  Sent: "bg-blue-100 text-blue-700",
  Closed: "bg-slate-200 text-slate-700",
  Awarded: "bg-emerald-100 text-emerald-700",
  Open: "bg-blue-100 text-blue-700",
  Delayed: "bg-orange-100 text-orange-700",
  "Low Stock": "bg-amber-100 text-amber-800",
  "In Stock": "bg-emerald-100 text-emerald-800",
  "Out of Stock": "bg-slate-200 text-slate-800",
  Active: "bg-emerald-100 text-emerald-800",
  "Pending Approval": "bg-amber-100 text-amber-700",
  "Pending Sourcing": "bg-blue-100 text-blue-700",
  "In Sourcing Process": "bg-indigo-100 text-indigo-700",
  "Quotations Received": "bg-amber-100 text-amber-800",
};

function StatusBadge({ value }: { value: string }) {
  return <Badge className={cn("hover:opacity-100", statusTone[value] ?? "bg-slate-100 text-slate-700")}>{value}</Badge>;
}

/** Stat KPI tiles — shared height, padding, and 16px between value row and title/label (`gap-4`). */
const KPI_STAT_CARD_CN = "border border-border bg-card py-0 shadow-none ring-0";
const KPI_STAT_CONTENT_CN =
  "flex min-h-[104px] flex-col justify-center gap-4 px-4 py-4 text-left";
const KPI_STAT_VALUE_CN = "text-xl font-semibold tabular-nums leading-tight";
const KPI_STAT_LABEL_CN = "text-xs font-medium text-muted-foreground leading-snug";
const KPI_STAT_ICON_CN = "h-4 w-4 shrink-0 text-primary";

type DrawerKey =
  | "master-data"
  | "pr"
  | "rfq"
  | "po"
  | "supplier"
  | "inventory"
  | "approval-rule"
  | "report";

type ItemMasterRow = {
  id: string;
  itemName: string;
  prm: string;
  subSolutions: string[];
};

function createEmptyItemRow(): ItemMasterRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    itemName: "",
    prm: "",
    subSolutions: [""],
  };
}

type PrRequisitionKind = "project" | "operational";
type BomInputMethod = "upload" | "manual";
type CreatedPrRecord = {
  id: string;
  ref: string;
  typeLabel: string;
  entityLabel: string;
  requester: string;
  owner: string;
  status: string;
  sla: string;
  sourceKind: "project" | "department";
  projectKey: string | null;
  departmentKey: string | null;
  createdAt: string;
  lineItems: Array<{ name: string; quantity: string; unit: string; specification: string }>;
  baselineTotal: number;
  terms: string;
};

type PrBomRow = {
  id: string;
  itemName: string;
  quantity: string;
  unitOfMeasure: string;
  specification: string;
  requiredDate: string;
  estimatedCost: string;
};

type ProjectBillDocument = {
  id: string;
  label: string;
  lines: Array<{
    itemName: string;
    quantity: string;
    unitOfMeasure: string;
    specification?: string;
    requiredDate: string;
    estimatedCost: string;
  }>;
};

function createEmptyBomRow(): PrBomRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    itemName: "",
    quantity: "",
    unitOfMeasure: "",
    specification: "",
    requiredDate: "",
    estimatedCost: "",
  };
}

function formatPrCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

/** Demo snapshots keyed like PR / budget dropdowns; aligned with Budget table where entities overlap. */
const PR_BUDGET_BY_PROJECT: Record<string, { total: number; used: number }> = {
  "proj-a": { total: 2_500_000, used: 720_000 },
  "proj-b": { total: 1_800_000, used: 1_650_000 },
  "proj-c": { total: 400_000, used: 200_000 },
};

const PR_BUDGET_BY_DEPARTMENT: Record<string, { total: number; used: number }> = {
  ops: { total: 1_800_000, used: 1_210_000 },
  log: { total: 700_000, used: 552_000 },
  mro: { total: 320_000, used: 146_000 },
  it: { total: 450_000, used: 90_000 },
  hr: { total: 120_000, used: 45_000 },
  finance: { total: 600_000, used: 210_000 },
};

const PR_PROJECT_BILLS: Record<string, { boq: ProjectBillDocument[]; bom: ProjectBillDocument[] }> = {
  "proj-a": {
    boq: [
      {
        id: "boq-a-1",
        label: "BOQ - Foundation Works",
        lines: [
          { itemName: "Rebar Steel", quantity: "120", unitOfMeasure: "kg", requiredDate: "2026-05-10", estimatedCost: "3200" },
          { itemName: "Cement", quantity: "500", unitOfMeasure: "pcs", requiredDate: "2026-05-12", estimatedCost: "4200" },
        ],
      },
    ],
    bom: [
      {
        id: "bom-a-1",
        label: "BOM - Site Office Setup",
        lines: [
          { itemName: "Office Chairs", quantity: "20", unitOfMeasure: "pcs", requiredDate: "2026-05-05", estimatedCost: "2600" },
          { itemName: "Workstations", quantity: "10", unitOfMeasure: "pcs", requiredDate: "2026-05-08", estimatedCost: "8500" },
        ],
      },
    ],
  },
  "proj-b": {
    boq: [
      {
        id: "boq-b-1",
        label: "BOQ - Road Base Layer",
        lines: [
          { itemName: "Crushed Stone", quantity: "320", unitOfMeasure: "kg", requiredDate: "2026-05-14", estimatedCost: "5100" },
          { itemName: "Bitumen", quantity: "80", unitOfMeasure: "l", requiredDate: "2026-05-16", estimatedCost: "7400" },
        ],
      },
    ],
    bom: [
      {
        id: "bom-b-1",
        label: "BOM - Survey Kit",
        lines: [
          { itemName: "Total Station Battery", quantity: "6", unitOfMeasure: "pcs", requiredDate: "2026-05-09", estimatedCost: "1200" },
          { itemName: "Survey Marker", quantity: "150", unitOfMeasure: "pcs", requiredDate: "2026-05-11", estimatedCost: "600" },
        ],
      },
    ],
  },
  "proj-c": {
    boq: [
      {
        id: "boq-c-1",
        label: "BOQ - Warehouse Civil Works",
        lines: [
          { itemName: "Concrete Blocks", quantity: "900", unitOfMeasure: "pcs", requiredDate: "2026-05-20", estimatedCost: "9800" },
          { itemName: "Sand", quantity: "240", unitOfMeasure: "kg", requiredDate: "2026-05-18", estimatedCost: "2100" },
        ],
      },
    ],
    bom: [
      {
        id: "bom-c-1",
        label: "BOM - Racking System",
        lines: [
          { itemName: "Rack Upright", quantity: "40", unitOfMeasure: "pcs", requiredDate: "2026-05-22", estimatedCost: "6400" },
          { itemName: "Rack Beam", quantity: "120", unitOfMeasure: "pcs", requiredDate: "2026-05-22", estimatedCost: "7200" },
        ],
      },
    ],
  },
};

function PurchaseRequisitionForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (record: CreatedPrRecord) => void }) {
  const [kind, setKind] = useState<PrRequisitionKind | "">("");
  const [prType, setPrType] = useState<"Product" | "Service" | "Training">("Product");
  const [linkedProject, setLinkedProject] = useState("");
  const [department, setDepartment] = useState("");
  const [justification, setJustification] = useState("");
  const [materialSourceType, setMaterialSourceType] = useState<"Bill of Quantities" | "Bill of Materials" | "">("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [operationalInputMethod, setOperationalInputMethod] = useState<"upload" | "manual" | "">("");
  const [bomRows, setBomRows] = useState<PrBomRow[]>(() => [createEmptyBomRow()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadParseError, setUploadParseError] = useState<string | null>(null);

  const allOperationalBills = useMemo(() => {
    return Object.values(PR_PROJECT_BILLS).flatMap((group) => [...group.boq, ...group.bom]);
  }, []);

  const availableProjectBills = useMemo(() => {
    const projectDocs = linkedProject ? PR_PROJECT_BILLS[linkedProject] : undefined;
    if (!projectDocs) return [];
    if (!materialSourceType) return [];
    return materialSourceType === "Bill of Quantities" ? projectDocs.boq : projectDocs.bom;
  }, [linkedProject, materialSourceType]);

  const availableOperationalBills = useMemo(() => {
    return allOperationalBills.filter((doc) =>
      materialSourceType === "Bill of Quantities" ? doc.id.startsWith("boq") : doc.id.startsWith("bom")
    );
  }, [allOperationalBills, materialSourceType]);

  const updateBomRow = useCallback((id: string, patch: Partial<Omit<PrBomRow, "id">>) => {
    setBomRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addBomRow = useCallback(() => {
    setBomRows((prev) => [...prev, createEmptyBomRow()]);
  }, []);

  const removeBomRow = useCallback((id: string) => {
    setBomRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }, []);

  const applyBillToRows = useCallback((billId: string, source: ProjectBillDocument[]) => {
    const selected = source.find((b) => b.id === billId);
    if (!selected) {
      setBomRows([createEmptyBomRow()]);
      return;
    }
    setBomRows(
      selected.lines.map((line) => ({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        itemName: line.itemName,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure,
        specification: line.specification ?? "",
        requiredDate: line.requiredDate,
        estimatedCost: line.estimatedCost,
      }))
    );
  }, []);

  const handleUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((r) => r.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        throw new Error("The uploaded BOM file has no item rows.");
      }

      const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
      const indexOf = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
      const nameIdx = indexOf("item / service name", "item name", "item", "name");
      const qtyIdx = indexOf("quantity", "qty");
      const unitIdx = indexOf("unit of measurement", "unit of measure", "uom", "unit");
      const specIdx = indexOf("specifications", "specification", "spec");
      const dateIdx = indexOf("required date", "delivery date", "date");
      const costIdx = indexOf("estimated cost", "cost", "price", "amount");
      const hasHeaderMapping = [nameIdx, qtyIdx, unitIdx, specIdx, dateIdx, costIdx].some((i) => i >= 0);

      const rows = lines.slice(1).map((line) => {
        const cols = line.split(",").map((cell) => cell.trim());
        const fallback = (idx: number, backup: number) => (idx >= 0 ? cols[idx] ?? "" : cols[backup] ?? "");
        return {
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          itemName: hasHeaderMapping ? fallback(nameIdx, 0) : (cols[0] ?? ""),
          quantity: hasHeaderMapping ? fallback(qtyIdx, 1) : (cols[1] ?? ""),
          unitOfMeasure: hasHeaderMapping ? fallback(unitIdx, 2) : (cols[2] ?? ""),
          specification: hasHeaderMapping ? fallback(specIdx, 3) : (cols[3] ?? ""),
          requiredDate: hasHeaderMapping ? fallback(dateIdx, 4) : (cols[4] ?? ""),
          estimatedCost: hasHeaderMapping ? fallback(costIdx, 5) : (cols[5] ?? ""),
        } satisfies PrBomRow;
      }).filter((r) => r.itemName || r.quantity || r.unitOfMeasure || r.specification || r.requiredDate || r.estimatedCost);

      if (rows.length === 0) {
        throw new Error("No valid BOM items were found in the uploaded file.");
      }
      setUploadParseError(null);
      setFormError(null);
      setBomRows(rows);
    } catch {
      setUploadParseError("Failed to parse BOM file. Please upload a valid CSV with item columns.");
      setBomRows([createEmptyBomRow()]);
    }
  }, []);

  const submitPr = useCallback(() => {
    if (!kind) {
      setFormError("Request Scope is required.");
      return;
    }
    if (!prType) {
      setFormError("PR Type is required.");
      return;
    }
    if (kind === "project" && !linkedProject) {
      setFormError("Linked Project is required for Project-Based requests.");
      return;
    }
    if (kind === "operational" && !department) {
      setFormError("Department is required for Operational requests.");
      return;
    }
    if (!justification.trim()) {
      setFormError("Justification is required.");
      return;
    }
    if (bomRows.length < 1 || !bomRows.some((r) => r.itemName.trim())) {
      setFormError("At least one line item is required.");
      return;
    }
    setFormError(null);
    const createdAt = new Date().toISOString();
    const idx = Math.floor(Math.random() * 900 + 100);
    const ref = `PR-${idx}${String(Date.now()).slice(-2)}`;
    const baseline = bomRows.reduce((sum, r) => sum + (Number.parseFloat(r.estimatedCost || "0") || 0), 0);
    const record: CreatedPrRecord = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      ref,
      typeLabel: `${prType} PR`,
      entityLabel:
        kind === "project"
          ? linkedProject === "proj-a"
            ? "Construction Project A"
            : linkedProject === "proj-b"
              ? "Road Expansion Project"
              : "Warehouse Setup"
          : department === "ops"
            ? "Operations"
            : department === "it"
              ? "IT Department"
              : department === "hr"
                ? "HR Department"
                : "Department",
      requester: "Alex Johnson",
      owner: "Sarah Smith",
      status: "Pending Approval",
      sla: "48h",
      sourceKind: kind === "project" ? "project" : "department",
      projectKey: kind === "project" ? linkedProject : null,
      departmentKey: kind === "project" ? null : department,
      createdAt,
      lineItems: bomRows.map((r) => ({
        name: r.itemName || "Item",
        quantity: r.quantity || "1",
        unit: r.unitOfMeasure || "pcs",
        specification: r.specification || "-",
      })),
      baselineTotal: baseline,
      terms: justification.trim(),
    };
    onSubmit(record);
    onClose();
  }, [kind, prType, linkedProject, department, justification, bomRows, onSubmit, onClose]);

  return (
    <>
      <div className="no-scrollbar max-h-[min(70vh,520px)] space-y-5 overflow-y-auto pr-1">
        <div className="space-y-3">
          <div className="space-y-4">
            <label className="text-xs font-medium">Request Scope</label>
            <div className="flex flex-wrap gap-2 text-xs">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  className="peer sr-only"
                  checked={kind === "project"}
                  onChange={() => { setKind("project"); setDepartment(""); setSelectedBillId(""); }}
                />
                <span className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 transition-colors peer-checked:border-primary peer-checked:text-primary peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring/25">
                  Project-Based
                </span>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  className="peer sr-only"
                  checked={kind === "operational"}
                  onChange={() => { setKind("operational"); setLinkedProject(""); setSelectedBillId(""); }}
                />
                <span className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 transition-colors peer-checked:border-primary peer-checked:text-primary peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring/25">
                  Operational
                </span>
              </label>
            </div>
          </div>
        </div>

        {kind === "project" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Linked Project</label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs" value={linkedProject} onChange={(e) => { setLinkedProject(e.target.value); setSelectedBillId(""); }}>
                  <option value="">Select project</option><option value="proj-a">Construction Project A</option><option value="proj-b">Road Expansion Project</option><option value="proj-c">Warehouse Setup</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">PR Type</label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs" value={prType} onChange={(e) => setPrType(e.target.value as "Product" | "Service" | "Training")}>
                  <option>Product</option><option>Service</option><option>Training</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Material Source Type</label>
            <div className="flex flex-wrap gap-2 text-xs">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    checked={materialSourceType === "Bill of Quantities"}
                    onChange={() => { setMaterialSourceType("Bill of Quantities"); setSelectedBillId(""); }}
                  />
                  <span className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 transition-colors peer-checked:border-primary peer-checked:text-primary peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring/25">
                    Bill of Quantities (BOQ)
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    checked={materialSourceType === "Bill of Materials"}
                    onChange={() => { setMaterialSourceType("Bill of Materials"); setSelectedBillId(""); }}
                  />
                  <span className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 transition-colors peer-checked:border-primary peer-checked:text-primary peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring/25">
                    Bill of Materials (BOM)
                  </span>
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Select BOQ / BOM</label>
              <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs" value={selectedBillId} onChange={(e) => { setSelectedBillId(e.target.value); applyBillToRows(e.target.value, availableProjectBills); }} disabled={!linkedProject}>
                <option value="">{linkedProject ? "Select source document" : "Select linked project first"}</option>
                {availableProjectBills.map((doc) => <option key={doc.id} value={doc.id}>{doc.label}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Department</label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">Select department</option><option value="ops">Operations</option><option value="log">Logistics</option><option value="mro">MRO</option><option value="it">IT Department</option><option value="finance">Finance</option><option value="hr">HR Department</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">PR Type</label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs" value={prType} onChange={(e) => setPrType(e.target.value as "Product" | "Service" | "Training")}>
                  <option>Product</option><option>Service</option><option>Training</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Material Input Method</label>
              <div className="flex flex-wrap gap-2 text-xs">
                <label className="cursor-pointer">
                  <input type="radio" className="peer sr-only" checked={operationalInputMethod === "upload"} onChange={() => setOperationalInputMethod("upload")} />
                  <span className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-center transition-colors peer-checked:border-primary peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/25">
                    Upload File
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input type="radio" className="peer sr-only" checked={operationalInputMethod === "manual"} onChange={() => setOperationalInputMethod("manual")} />
                  <span className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-center transition-colors peer-checked:border-primary peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/25">
                    Enter Manually
                  </span>
                </label>
              </div>
            </div>
            {operationalInputMethod === "upload" ? (
              <div className="space-y-1">
                <label className="text-xs font-medium">Upload BOQ / BOM File (CSV)</label>
                <Input className="h-9 cursor-pointer text-xs file:mr-2 file:text-xs" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)} />
                {uploadParseError ? (
                  <p className="text-xs text-destructive">{uploadParseError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <div className="space-y-3">
          {kind === "operational" ? (
            <p className="text-sm font-semibold text-foreground">Bill of Material (BOM)</p>
          ) : null}
          <p className="text-xs font-medium text-foreground">Items</p>
            {bomRows.map((row, index) => (
              <div key={row.id} className="relative flex flex-col gap-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">Item {index + 1}</p>
                  {bomRows.length > 1 ? (
                    <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => removeBomRow(row.id)} aria-label="Remove item">
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><label className="text-xs font-medium text-foreground">Item / Service Name</label><Input className="h-9 text-xs" value={row.itemName} onChange={(e) => updateBomRow(row.id, { itemName: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs font-medium text-foreground">Quantity</label><Input className="h-9 text-xs" value={row.quantity} onChange={(e) => updateBomRow(row.id, { quantity: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs font-medium text-foreground">Unit of Measurement</label><Input className="h-9 text-xs" value={row.unitOfMeasure} onChange={(e) => updateBomRow(row.id, { unitOfMeasure: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs font-medium text-foreground">Specifications</label><Input className="h-9 text-xs" value={row.specification} onChange={(e) => updateBomRow(row.id, { specification: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs font-medium text-foreground">Required Date</label><Input className="h-9 text-xs" type="date" value={row.requiredDate} onChange={(e) => updateBomRow(row.id, { requiredDate: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs font-medium text-foreground">Estimated Cost (optional)</label><Input className="h-9 text-xs" value={row.estimatedCost} onChange={(e) => updateBomRow(row.id, { estimatedCost: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><label className="text-xs font-medium text-foreground">Line Documents</label><Input className="h-9 cursor-pointer text-xs file:mr-2 file:text-xs" type="file" /></div>
                </div>
              </div>
            ))}
          <div className="flex justify-center"><Button type="button" variant="outline" size="sm" className="h-8 min-w-24 gap-1 border-primary !bg-transparent text-primary hover:border-primary hover:!bg-transparent hover:text-primary" onClick={addBomRow}><Plus className="h-3.5 w-3.5 text-primary" />Add Item</Button></div>
          </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium">Justification</label>
          <textarea className="min-h-[88px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" value={justification} onChange={(e) => setJustification(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2 pt-4">
        <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="h-8 min-w-24 border-[#5EEAD4] text-[#5EEAD4] !bg-transparent hover:border-[#5EEAD4] hover:!bg-transparent hover:text-[#5EEAD4]" variant="outline" onClick={onClose}>Save draft</Button>
        <Button className="h-8 min-w-24" onClick={submitPr}>Save</Button>
      </div>
      {formError ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{formError}</p> : null}
    </>
  );
}

type RfqStep = 1 | 2 | 3;
type RfqLifecycleStatus = "Draft" | "Sent" | "Quotations Received" | "Awarded";
type RfqQuotation = {
  supplier: string;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  deliveryDate: string;
  deliveryTime: string;
  /** Combined label for display (e.g. compare table) */
  deliveryTimeline: string;
  notes: string;
};
type CreatedRfqRecord = {
  id: string;
  rfq: string;
  title: string;
  prRef: string;
  suppliers: string;
  deadline: string;
  sourceKind: "project" | "department";
  projectKey: string | null;
  departmentKey: string | null;
  status: RfqLifecycleStatus;
  createdAt: string;
  deliveryTimeline: string;
  terms: string;
  baselineTotal: number;
  lineItems: Array<{ name: string; quantity: string; unit: string; specification: string }>;
  selectedSuppliers: string[];
  quotations: RfqQuotation[];
  awardedSupplier: string | null;
  notificationTriggered: boolean;
};
type RfqItemRow = {
  id: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  specification: string;
};

function createEmptyRfqItem(): RfqItemRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name: "",
    description: "",
    quantity: "",
    unit: "",
    specification: "",
  };
}

function RequestForQuotationForm({
  onClose,
  onSubmit,
  initialData,
  editingRfqId,
}: {
  onClose: () => void;
  onSubmit: (record: CreatedRfqRecord) => void;
  initialData?: Partial<
    Pick<
      CreatedRfqRecord,
      | "id"
      | "title"
      | "prRef"
      | "baselineTotal"
      | "deadline"
      | "deliveryTimeline"
      | "terms"
      | "lineItems"
      | "selectedSuppliers"
      | "sourceKind"
      | "projectKey"
      | "departmentKey"
      | "createdAt"
    >
  >;
  editingRfqId?: string | null;
}) {
  const [step, setStep] = useState<RfqStep>(1);
  const [rfqTitle, setRfqTitle] = useState(() => initialData?.title ?? "");
  const [prReference, setPrReference] = useState(() => initialData?.prRef ?? "");
  const [baselineTotal, setBaselineTotal] = useState(() => String(initialData?.baselineTotal ?? ""));
  const [submissionDeadline, setSubmissionDeadline] = useState(() => initialData?.deadline ?? "");
  const [deliveryTimeline, setDeliveryTimeline] = useState(() => initialData?.deliveryTimeline ?? "");
  const [terms, setTerms] = useState(() => initialData?.terms ?? "");
  const [attachments, setAttachments] = useState<number[]>([0]);
  const [itemRows, setItemRows] = useState<RfqItemRow[]>(() =>
    initialData?.lineItems?.length
      ? initialData.lineItems.map((r) => ({
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          name: r.name,
          description: "",
          quantity: r.quantity,
          unit: r.unit,
          specification: r.specification,
        }))
      : [createEmptyRfqItem()]
  );
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>(() => initialData?.selectedSuppliers ?? []);
  const [stepError, setStepError] = useState<string | null>(null);

  const updateItemRow = useCallback((id: string, patch: Partial<Omit<RfqItemRow, "id">>) => {
    setItemRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const addItemRow = useCallback(() => {
    setItemRows((prev) => [...prev, createEmptyRfqItem()]);
  }, []);

  const removeItemRow = useCallback((id: string) => {
    setItemRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }, []);

  const toggleSupplier = useCallback((supplier: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(supplier) ? prev.filter((s) => s !== supplier) : [...prev, supplier]
    );
  }, []);

  const stepLabelClass = (value: RfqStep) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
      step === value
        ? "bg-primary/10 text-primary font-medium"
        : step > value
          ? "text-primary font-medium"
          : "text-muted-foreground"
    );

  const stepNumberClass = (value: RfqStep) =>
    cn(
      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
      step === value
        ? "bg-primary text-primary-foreground"
        : step > value
          ? "bg-transparent text-primary ring-1 ring-primary/30"
          : "bg-current/15"
    );

  const goNext = useCallback(() => {
    if (step === 1) {
      if (!rfqTitle.trim() || !submissionDeadline) {
        setStepError("Step 1 requires RFQ Title and Submission Deadline.");
        return;
      }
    }
    if (step === 2) {
      if (itemRows.length < 1) {
        setStepError("Step 2 requires at least one item.");
        return;
      }
    }
    setStepError(null);
    setStep((prev) => (Math.min(3, prev + 1) as RfqStep));
  }, [step, rfqTitle, submissionDeadline, itemRows.length]);

  const createRfq = useCallback(() => {
    if (selectedSuppliers.length < 1) {
      setStepError("Step 3 requires at least one supplier selected.");
      return;
    }
    const now = new Date().toISOString();
    const newId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    const record: CreatedRfqRecord = {
      id: initialData?.id ?? newId,
      rfq: editingRfqId?.trim() || `RFQ-${String(Date.now()).slice(-6)}`,
      title: rfqTitle.trim(),
      prRef: prReference.trim() || "-",
      suppliers: `${selectedSuppliers.length} Suppliers`,
      deadline: submissionDeadline,
      sourceKind: initialData?.sourceKind ?? "project",
      projectKey: initialData?.projectKey ?? "proj-a",
      departmentKey: initialData?.departmentKey ?? null,
      status: "Draft",
      createdAt: initialData?.createdAt ?? now,
      deliveryTimeline: deliveryTimeline.trim(),
      terms: terms.trim(),
      baselineTotal: Number.parseFloat(baselineTotal || "0") || 0,
      lineItems: itemRows.map((r) => ({
        name: r.name || "Item",
        quantity: r.quantity || "1",
        unit: r.unit || "pcs",
        specification: r.specification || "",
      })),
      selectedSuppliers: [...selectedSuppliers],
      quotations: [],
      awardedSupplier: null,
      notificationTriggered: false,
    };
    onSubmit(record);
    setStepError(null);
    onClose();
  }, [selectedSuppliers, rfqTitle, prReference, submissionDeadline, deliveryTimeline, terms, baselineTotal, itemRows, onSubmit, onClose, initialData?.sourceKind, initialData?.projectKey, initialData?.departmentKey, initialData?.id, editingRfqId]);

  return (
    <>
      <div className="no-scrollbar max-h-[min(72vh,560px)] space-y-6 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" className={stepLabelClass(1)} onClick={() => setStep(1)}>
            <span className={stepNumberClass(1)}>1</span>
            RFQ Details
          </button>
          <button type="button" className={stepLabelClass(2)} onClick={() => setStep(2)}>
            <span className={stepNumberClass(2)}>2</span>
            Items / Services
          </button>
          <button type="button" className={stepLabelClass(3)} onClick={() => setStep(3)}>
            <span className={stepNumberClass(3)}>3</span>
            Invite Suppliers
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">RFQ Title</label>
                <Input className="h-9" placeholder="" value={rfqTitle} onChange={(e) => setRfqTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="rfq-pr-ref" className="text-xs font-medium text-foreground">
                  Purchase Requisition Reference (optional)
                </label>
                <select
                  id="rfq-pr-ref"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  value={prReference}
                  onChange={(e) => setPrReference(e.target.value)}
                >
                  <option value="">Select PR</option>
                  <option>PR-1023</option>
                  <option>PR-1024</option>
                  <option>PR-1025</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">BOQ Price Total (Baseline)</label>
                <Input className="h-9" type="number" placeholder="" value={baselineTotal} onChange={(e) => setBaselineTotal(e.target.value)} />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">Submission Deadline</label>
                <Input className="h-9" type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} />
              </div>
              <div className="flex flex-col gap-3 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Delivery Timeline</label>
                <Input className="h-9" placeholder="" value={deliveryTimeline} onChange={(e) => setDeliveryTimeline(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-foreground">Terms and Conditions</label>
              <textarea
                className="min-h-[90px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder=""
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <p className="text-xs font-medium">Attachments</p>
              {attachments.map((fileInput) => (
                <Input key={fileInput} className="h-9 cursor-pointer text-xs file:mr-2 file:text-xs" type="file" />
              ))}
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-24 gap-1"
                  onClick={() => setAttachments((prev) => [...prev, prev.length])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Attachment
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-5">
              {itemRows.map((row, index) => {
                const multiple = itemRows.length > 1;
                const canRemove = itemRows.length > 1;
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "relative w-full min-w-0 flex flex-col gap-3",
                      multiple && "rounded-md border border-border bg-muted/60/40 p-3"
                    )}
                  >
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => removeItemRow(row.id)}
                      aria-label="Remove item"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {multiple ? (
                    <p className="mb-2 pr-8 text-xs font-medium text-muted-foreground">Item {index + 1}</p>
                  ) : (
                    <p className="text-xs font-medium text-muted-foreground">Item {index + 1}</p>
                  )}
                  <div className="grid w-full gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      <label htmlFor={`rfq-item-${row.id}-name`} className="text-xs font-medium text-foreground">
                        Name
                      </label>
                      <Input
                        id={`rfq-item-${row.id}-name`}
                        className="h-9 text-xs"
                        value={row.name}
                        onChange={(e) => updateItemRow(row.id, { name: e.target.value })}
                        placeholder=""
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <label htmlFor={`rfq-item-${row.id}-description`} className="text-xs font-medium text-foreground">
                        Notes
                      </label>
                      <Input
                        id={`rfq-item-${row.id}-description`}
                        className="h-9 text-xs"
                        value={row.description}
                        onChange={(e) => updateItemRow(row.id, { description: e.target.value })}
                        placeholder=""
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <label htmlFor={`rfq-item-${row.id}-quantity`} className="text-xs font-medium text-foreground">
                        Quantity
                      </label>
                      <Input
                        id={`rfq-item-${row.id}-quantity`}
                        className="h-9 text-xs"
                        value={row.quantity}
                        onChange={(e) => updateItemRow(row.id, { quantity: e.target.value })}
                        placeholder=""
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <label htmlFor={`rfq-item-${row.id}-unit`} className="text-xs font-medium text-foreground">
                        Unit of Measure
                      </label>
                      <select
                        id={`rfq-item-${row.id}-unit`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                        value={row.unit}
                        onChange={(e) => updateItemRow(row.id, { unit: e.target.value })}
                      >
                        <option value="">Select unit</option>
                        <option value="pcs">pcs</option>
                        <option value="kg">kg</option>
                        <option value="l">L</option>
                        <option value="service">service</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-3 sm:col-span-2">
                      <label htmlFor={`rfq-item-${row.id}-spec`} className="text-xs font-medium text-foreground">
                        Specification
                      </label>
                      <Input
                        id={`rfq-item-${row.id}-spec`}
                        className="h-9 text-xs"
                        value={row.specification}
                        onChange={(e) => updateItemRow(row.id, { specification: e.target.value })}
                        placeholder=""
                      />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="h-8 min-w-24 gap-1" onClick={addItemRow}>
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h4 className="text-sm font-semibold">Invite Suppliers</h4>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Input
                className="h-9 min-w-[12rem] flex-1 sm:max-w-xs"
                placeholder="Search suppliers..."
                aria-label="Search suppliers"
              />
              <select
                id="rfq-filter-location"
                className="h-9 min-w-[9rem] shrink-0 rounded-md border border-input bg-background px-3 text-xs"
                defaultValue=""
                aria-label="Location"
              >
                <option value="">Location</option>
                <option>Addis Ababa</option>
                <option>Dubai</option>
                <option>Seoul</option>
              </select>
              <select
                id="rfq-filter-category"
                className="h-9 min-w-[9rem] shrink-0 rounded-md border border-input bg-background px-3 text-xs"
                defaultValue=""
                aria-label="Category"
              >
                <option value="">Category</option>
                <option>Office Supplies</option>
                <option>IT Equipment</option>
                <option>Construction Materials</option>
              </select>
              <select
                id="rfq-filter-rating"
                className="h-9 min-w-[9rem] shrink-0 rounded-md border border-input bg-background px-3 text-xs"
                defaultValue=""
                aria-label="Rating"
              >
                <option value="">Rating</option>
                <option>5 stars</option>
                <option>4+ stars</option>
                <option>3+ stars</option>
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Swift Supplies", "Addis Ababa", "Office Supplies", "4.7"],
                ["Hansei Global", "Seoul", "Construction Materials", "4.8"],
                ["Apollo Components", "Dubai", "IT Equipment", "4.5"],
                ["Zenith Industrial", "Addis Ababa", "Warehouse Tools", "4.6"],
              ].map((supplier) => {
                const checked = selectedSuppliers.includes(supplier[0]);
                return (
                  <label
                    key={supplier[0]}
                    className="flex min-h-20 items-start gap-3 rounded-md bg-muted/60 px-3 py-3 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={checked}
                      onChange={() => toggleSupplier(supplier[0])}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{supplier[0]}</span>
                      <span className="text-muted-foreground">{supplier[1]}</span>
                      <span className="text-muted-foreground">{supplier[2]}</span>
                    </div>
                    <span className="text-muted-foreground">{supplier[3]}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Selected Suppliers: {selectedSuppliers.length}</p>
          </div>
        )}
      </div>

      {stepError ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{stepError}</p>
      ) : null}
      <div className="mt-4 flex items-center justify-end gap-1 pt-4">
        {step < 3 ? (
          <>
            <Button className="h-8 min-w-24" variant="outline" disabled={step === 1} onClick={() => setStep((prev) => (Math.max(1, prev - 1) as RfqStep))}>
              Back
            </Button>
            <Button className="h-8 min-w-24" onClick={goNext}>Next</Button>
          </>
        ) : (
          <>
            <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>Save as Draft</Button>
            <Button className="h-8 min-w-24" onClick={createRfq}>Create RFQ</Button>
          </>
        )}
      </div>
    </>
  );
}

type PoStep = 1 | 2 | 3;
type CreatedPoRecord = {
  id: string;
  po: string;
  supplier: string;
  approval: string;
  orderSource: string;
  requestType: string;
  sourceKind: "project" | "department";
  projectKey: string | null;
  departmentKey: string | null;
  lineItems: Array<{ name: string; quantity: string; price: number; deliveryDate: string }>;
  totalAmount: number;
  deliveryTerms: string;
  paymentTerms: string;
  createdAt: string;
};

type PoFormInitialData = {
  sourceKind: "project" | "department";
  projectKey: string | null;
  departmentKey: string | null;
  prRef: string;
  rfqRef?: string | null;
  supplier?: string | null;
  approval?: string;
  deliveryTerms?: string;
  paymentTerms?: string;
  orderTitle?: string;
  lineItems?: Array<{ name: string; quantity: string; unit: string }>;
};

type PoLineRow = {
  id: string;
  itemOrService: string;
  quantity: string;
  price: string;
  deliveryDate: string;
  lineGroup: string;
};

const DEFAULT_PO_DELIVERY_TERMS = "Delivery within agreed timeline to designated receiving site.";
const DEFAULT_PO_PAYMENT_TERMS = "Payment within 30 days after verified delivery and invoice acceptance.";

function buildInitialPoLines(items?: Array<{ name: string; quantity: string; unit: string }>): PoLineRow[] {
  if (items && items.length > 0) {
    return items.map((li, i) => ({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `l-seed-${i}-${String(Math.random()).slice(2, 9)}`,
      itemOrService: li.name,
      quantity: li.quantity,
      price: "",
      deliveryDate: "",
      lineGroup: li.unit || "",
    }));
  }
  return [{ id: "l-1", itemOrService: "", quantity: "", price: "", deliveryDate: "", lineGroup: "" }];
}

function PurchaseOrderForm({
  onClose,
  onSubmit,
  initialData,
  editingPoNumber,
}: {
  onClose: () => void;
  onSubmit: (record: CreatedPoRecord) => void;
  initialData?: PoFormInitialData | null;
  editingPoNumber?: string | null;
}) {
  const [step, setStep] = useState<PoStep>(1);
  const [orderCategory, setOrderCategory] = useState<"Product" | "Service" | "Training">("Product");
  const [taxes, setTaxes] = useState("");
  const [poAttachments, setPoAttachments] = useState<number[]>([0]);
  const [lines, setLines] = useState<PoLineRow[]>(() => buildInitialPoLines(initialData?.lineItems));
  const [requestSource, setRequestSource] = useState<"project" | "operations">(() =>
    initialData?.sourceKind === "department" ? "operations" : "project",
  );
  const [prRefValue, setPrRefValue] = useState(() => initialData?.prRef ?? "");
  const [rfqRefValue, setRfqRefValue] = useState(() => initialData?.rfqRef ?? "");
  const [supplierValue, setSupplierValue] = useState(() => initialData?.supplier ?? "");
  const [orderTitle, setOrderTitle] = useState(() => initialData?.orderTitle ?? "");
  const [deliveryTerms] = useState(() => initialData?.deliveryTerms ?? DEFAULT_PO_DELIVERY_TERMS);
  const [paymentTerms] = useState(() => initialData?.paymentTerms ?? DEFAULT_PO_PAYMENT_TERMS);

  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";

  const updateLine = useCallback((id: string, patch: Partial<Omit<PoLineRow, "id">>) => {
    setLines((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `l-${String(prev.length)}-${String(Math.random()).slice(2, 9)}`,
        itemOrService: "",
        quantity: "",
        price: "",
        deliveryDate: "",
        lineGroup: "",
      },
    ]);
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }, []);

  const createPo = useCallback(() => {
    const hasValidLines = lines.length > 0 && lines.every((l) => l.itemOrService.trim() && l.quantity.trim());
    if (!hasValidLines) return;
    const sourceKind: "project" | "department" =
      initialData?.sourceKind ?? (requestSource === "project" ? "project" : "department");
    const projectKey = initialData ? initialData.projectKey : requestSource === "project" ? "proj-a" : null;
    const departmentKey = initialData ? initialData.departmentKey : null;
    const record: CreatedPoRecord = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      po: editingPoNumber ?? `PO-${String(Date.now()).slice(-6)}`,
      supplier: supplierValue.trim() || "TBD Supplier",
      approval: initialData?.approval ?? "Pending Approval",
      orderSource: requestSource === "project" ? "Project" : "Department",
      requestType: orderCategory,
      sourceKind,
      projectKey,
      departmentKey,
      lineItems: lines.map((l) => ({
        name: l.itemOrService.trim() || "Item",
        quantity: l.quantity.trim() || "1",
        price: Number.parseFloat(l.price || "0") || 0,
        deliveryDate: l.deliveryDate || "",
      })),
      totalAmount: lines.reduce((sum, l) => {
        const q = Number.parseFloat(l.quantity || "0") || 0;
        const p = Number.parseFloat(l.price || "0") || 0;
        return sum + q * p;
      }, 0),
      deliveryTerms,
      paymentTerms,
      createdAt: new Date().toISOString(),
    };
    onSubmit(record);
    onClose();
  }, [lines, orderCategory, onSubmit, onClose, supplierValue, requestSource, initialData, editingPoNumber, deliveryTerms, paymentTerms]);

  const stepLabelClass = (value: PoStep) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
      step === value
        ? "bg-primary/10 text-primary font-medium"
        : step > value
          ? "text-primary font-medium"
          : "text-muted-foreground"
    );

  const stepNumberClass = (value: PoStep) =>
    cn(
      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
      step === value
        ? "bg-primary text-primary-foreground"
        : step > value
          ? "bg-transparent text-primary ring-1 ring-primary/30"
          : "bg-current/15"
    );

  return (
    <>
      <div className="no-scrollbar max-h-[min(72vh,560px)] space-y-6 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" className={stepLabelClass(1)} onClick={() => setStep(1)}>
            <span className={stepNumberClass(1)}>1</span>
            Order Details
          </button>
          <button type="button" className={stepLabelClass(2)} onClick={() => setStep(2)}>
            <span className={stepNumberClass(2)}>2</span>
            Line Items
          </button>
          <button type="button" className={stepLabelClass(3)} onClick={() => setStep(3)}>
            <span className={stepNumberClass(3)}>3</span>
            Payment & Delivery
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-5 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label htmlFor="po-request-source" className="text-xs font-medium text-foreground">
                  Request source
                </label>
                <select
                  id="po-request-source"
                  className={selectClass}
                  value={requestSource}
                  onChange={(e) => setRequestSource(e.target.value as "project" | "operations")}
                >
                  <option value="project">Project</option>
                  <option value="operations">Operations</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-approved-pr" className="text-xs font-medium text-foreground">
                  Approved Purchase Requisition
                </label>
                <select id="po-approved-pr" className={selectClass} value={prRefValue} onChange={(e) => setPrRefValue(e.target.value)}>
                  <option value="">Select PR</option>
                  {["PR-1023", "PR-1024", "PR-1025", "PR-1026", "PR-1027"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {prRefValue && !["PR-1023", "PR-1024", "PR-1025", "PR-1026", "PR-1027"].includes(prRefValue) ? (
                    <option value={prRefValue}>{prRefValue}</option>
                  ) : null}
                </select>
              </div>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-xs font-medium text-foreground">Order Category</legend>
              <div className="flex flex-wrap gap-4">
                {(["Product", "Service", "Training"] as const).map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="po-order-category"
                      className="accent-primary"
                      checked={orderCategory === opt}
                      onChange={() => setOrderCategory(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label htmlFor="po-procurement-type" className="text-xs font-medium text-foreground">
                  Procurement Type
                </label>
                <select id="po-procurement-type" className={selectClass} defaultValue="">
                  <option value="">Select type</option>
                  <option>Local</option>
                  <option>Offshore</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-planned-release-ref" className="text-xs font-medium text-foreground">
                  Planned Release Reference
                </label>
                <Input id="po-planned-release-ref" className="h-9" placeholder="" />
              </div>
              <div className="flex flex-col gap-3 sm:col-span-2">
                <label htmlFor="po-order-title" className="text-xs font-medium text-foreground">
                  Title
                </label>
                <Input id="po-order-title" className="h-9" placeholder="" value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-supplier" className="text-xs font-medium text-foreground">
                  Supplier
                </label>
                <select id="po-supplier" className={selectClass} value={supplierValue} onChange={(e) => setSupplierValue(e.target.value)}>
                  <option value="">Select supplier</option>
                  {["ABC Supplier", "XYZ Services", "Swift Supplies"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {supplierValue && !["ABC Supplier", "XYZ Services", "Swift Supplies"].includes(supplierValue) ? (
                    <option value={supplierValue}>{supplierValue}</option>
                  ) : null}
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-manufacturer" className="text-xs font-medium text-foreground">
                  Manufacturer
                </label>
                <select id="po-manufacturer" className={selectClass} defaultValue="">
                  <option value="">Select manufacturer</option>
                  <option>Atlas Manufacturing</option>
                  <option>OEM Partner Ltd.</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-warehouse-site" className="text-xs font-medium text-foreground">
                  Warehouse / Site
                </label>
                <select id="po-warehouse-site" className={selectClass} defaultValue="">
                  <option value="">Select warehouse</option>
                  <option>WH-A — Main</option>
                  <option>WH-C — Regional</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-business-unit" className="text-xs font-medium text-foreground">
                  Business Unit
                </label>
                <select id="po-business-unit" className={selectClass} defaultValue="">
                  <option value="">Select unit</option>
                  <option>BU — Operations</option>
                  <option>BU — Projects</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-currency" className="text-xs font-medium text-foreground">
                  Currency
                </label>
                <select id="po-currency" className={selectClass} defaultValue="">
                  <option value="">Select currency</option>
                  <option>ETB</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-payment-terms" className="text-xs font-medium text-foreground">
                  Payment Terms
                </label>
                <select id="po-payment-terms" className={selectClass} defaultValue="">
                  <option value="">Select terms</option>
                  <option>Net 30</option>
                  <option>Net 60</option>
                  <option>Advance</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-pr-ref" className="text-xs font-medium text-foreground">
                  Purchase Requisition Reference
                </label>
                <select id="po-pr-ref" className={selectClass} value={prRefValue} onChange={(e) => setPrRefValue(e.target.value)}>
                  <option value="">Select PR</option>
                  {["PR-1023", "PR-1024", "PR-1025", "PR-1026", "PR-1027"].map((r) => (
                    <option key={`dup-${r}`} value={r}>
                      {r}
                    </option>
                  ))}
                  {prRefValue && !["PR-1023", "PR-1024", "PR-1025", "PR-1026", "PR-1027"].includes(prRefValue) ? (
                    <option value={prRefValue}>{prRefValue}</option>
                  ) : null}
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-rfq-ref" className="text-xs font-medium text-foreground">
                  Request for Quotation Reference
                </label>
                <select id="po-rfq-ref" className={selectClass} value={rfqRefValue} onChange={(e) => setRfqRefValue(e.target.value)}>
                  <option value="">Select RFQ</option>
                  {["RFQ-1001", "RFQ-1002", "RFQ-1003", "RFQ-1004", "RFQ-1005"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {rfqRefValue && !["RFQ-1001", "RFQ-1002", "RFQ-1003", "RFQ-1004", "RFQ-1005"].includes(rfqRefValue) ? (
                    <option value={rfqRefValue}>{rfqRefValue}</option>
                  ) : null}
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-sourcing-officer" className="text-xs font-medium text-foreground">
                  Sourcing Officer
                </label>
                <select id="po-sourcing-officer" className={selectClass} defaultValue="">
                  <option value="">Select officer</option>
                  <option>A. Tadesse</option>
                  <option>M. Silva</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-logistics-officer" className="text-xs font-medium text-foreground">
                  Logistics Officer
                </label>
                <select id="po-logistics-officer" className={selectClass} defaultValue="">
                  <option value="">Select officer</option>
                  <option>L. Kim</option>
                  <option>F. Gomez</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 text-xs">
            <div className="flex w-full flex-col gap-5">
              {lines.map((row, index) => {
                const multiple = lines.length > 1;
                const canRemove = lines.length > 1;
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "relative w-full min-w-0",
                      multiple && "rounded-md border border-border p-3"
                    )}
                  >
                    {canRemove ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => removeLine(row.id)}
                        aria-label="Remove line"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {multiple ? (
                      <p className="mb-2 pr-8 text-xs font-medium text-muted-foreground">Line {index + 1}</p>
                    ) : null}
                    <div className="grid w-full grid-cols-2 gap-3">
                      <div className="col-span-2 flex flex-col gap-3">
                        <label htmlFor={`po-line-${row.id}-item`} className="text-xs font-medium text-foreground">
                          Item or Service
                        </label>
                        <Input
                          id={`po-line-${row.id}-item`}
                          className="h-9 w-full text-xs"
                          value={row.itemOrService}
                          onChange={(e) => updateLine(row.id, { itemOrService: e.target.value })}
                          placeholder=""
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <label htmlFor={`po-line-${row.id}-qty`} className="text-xs font-medium text-foreground">
                          Quantity
                        </label>
                        <Input
                          id={`po-line-${row.id}-qty`}
                          className="h-9 w-full text-xs"
                          value={row.quantity}
                          onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                          placeholder=""
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <label htmlFor={`po-line-${row.id}-price`} className="text-xs font-medium text-foreground">
                          Price
                        </label>
                        <Input
                          id={`po-line-${row.id}-price`}
                          className="h-9 w-full text-xs"
                          value={row.price}
                          onChange={(e) => updateLine(row.id, { price: e.target.value })}
                          placeholder=""
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <label htmlFor={`po-line-${row.id}-delivery`} className="text-xs font-medium text-foreground">
                          Delivery date
                        </label>
                        <Input
                          id={`po-line-${row.id}-delivery`}
                          className="h-9 w-full text-xs"
                          type="date"
                          value={row.deliveryDate}
                          onChange={(e) => updateLine(row.id, { deliveryDate: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <label htmlFor={`po-line-${row.id}-group`} className="text-xs font-medium text-foreground">
                          Line Group
                        </label>
                        <Input
                          id={`po-line-${row.id}-group`}
                          className="h-9 w-full text-xs"
                          value={row.lineGroup}
                          onChange={(e) => updateLine(row.id, { lineGroup: e.target.value })}
                          placeholder=""
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="h-8 min-w-24 gap-1" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" />
                Add Line
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              <label htmlFor="po-line-taxes" className="text-xs font-medium text-foreground">
                Tax amount or rate
              </label>
              <Input
                id="po-line-taxes"
                className="h-9"
                placeholder=""
                value={taxes}
                onChange={(e) => setTaxes(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label htmlFor="po-payment-mode" className="text-xs font-medium text-foreground">
                  Payment Mode
                </label>
                <select id="po-payment-mode" className={selectClass} defaultValue="">
                  <option value="">Select mode</option>
                  <option>Bank transfer</option>
                  <option>LC</option>
                  <option>Advance</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-incoterms" className="text-xs font-medium text-foreground">
                  Incoterms
                </label>
                <select id="po-incoterms" className={selectClass} defaultValue="">
                  <option value="">Select incoterms</option>
                  <option>FOB</option>
                  <option>CIF</option>
                  <option>EXW</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-shipment-details" className="text-xs font-medium text-foreground">
                  Shipment details
                </label>
                <Input id="po-shipment-details" className="h-9" placeholder="" />
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-eta" className="text-xs font-medium text-foreground">
                  Estimated time of arrival
                </label>
                <Input id="po-eta" className="h-9" type="date" />
              </div>
            </div>
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">Attachments</p>
              <div className="space-y-3">
                {poAttachments.map((key, index) => (
                  <div key={key} className="flex flex-col gap-3">
                    <label htmlFor={`po-attachment-${key}`} className="text-xs font-medium text-foreground">
                      File attachment {index + 1}
                    </label>
                    <Input
                      id={`po-attachment-${key}`}
                      className="h-9 cursor-pointer text-xs file:mr-2 file:text-xs"
                      type="file"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-24 gap-1"
                  onClick={() => setPoAttachments((prev) => [...prev, prev.length])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Attachment
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-1 pt-4">
        <Button className="h-8 min-w-24" variant="outline" onClick={step === 1 ? onClose : () => setStep((prev) => (prev - 1) as PoStep)}>
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        {step < 3 ? (
          <Button className="h-8 min-w-24" onClick={() => setStep((prev) => (prev + 1) as PoStep)}>Next</Button>
        ) : (
          <Button className="h-8 min-w-24" onClick={createPo}>Save</Button>
        )}
      </div>
    </>
  );
}

function ItemMasterDataForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (rows: ItemMasterRow[]) => void }) {
  const [rows, setRows] = useState<ItemMasterRow[]>(() => [createEmptyItemRow()]);

  const updateRow = useCallback((id: string, patch: Partial<Omit<ItemMasterRow, "id">>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyItemRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const addSubSolution = useCallback((id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, subSolutions: [...r.subSolutions, ""] } : r)));
  }, []);

  const updateSubSolution = useCallback((id: string, idx: number, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, subSolutions: r.subSolutions.map((s, i) => (i === idx ? value : s)) }
          : r
      )
    );
  }, []);

  const removeSubSolution = useCallback((id: string, idx: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (r.subSolutions.length <= 1) return r;
        return { ...r, subSolutions: r.subSolutions.filter((_, i) => i !== idx) };
      })
    );
  }, []);

  return (
    <>
      <div className="no-scrollbar max-h-[min(60vh,420px)] space-y-5 overflow-y-auto pr-1">
        {rows.map((row) => {
          const canRemove = rows.length > 1;
          return (
          <div
            key={row.id}
            className={cn(
              "relative flex w-full min-w-0 flex-col gap-3 rounded-md border border-border bg-muted/60/40 p-3",
              canRemove && "pr-9 pt-2"
            )}
          >
            {canRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => removeRow(row.id)}
                aria-label="Remove item row"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">Name</label>
                <Input
                  className="h-9"
                  placeholder=""
                  value={row.itemName}
                  onChange={(e) => updateRow(row.id, { itemName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">PRM</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  value={row.prm}
                  onChange={(e) => updateRow(row.id, { prm: e.target.value })}
                >
                  <option value="">Select PRM</option>
                  <option value="Alex Johnson">Alex Johnson</option>
                  <option value="Sarah Smith">Sarah Smith</option>
                  <option value="Liam Gomez">Liam Gomez</option>
                  <option value="Maya Ibrahim">Maya Ibrahim</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">Sub-solutions</label>
                </div>
                <div className="space-y-2">
                  {row.subSolutions.map((sub, idx) => (
                    <div key={`${row.id}-sub-${idx}`} className="flex items-center gap-2">
                      <Input
                        className="h-9"
                        placeholder={`Sub-solution ${idx + 1}`}
                        value={sub}
                        onChange={(e) => updateSubSolution(row.id, idx, e.target.value)}
                      />
                      {idx === 0 ? (
                        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={() => addSubSolution(row.id)}>
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </Button>
                      ) : null}
                      {row.subSolutions.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-8 w-8 shrink-0"
                          onClick={() => removeSubSolution(row.id, idx)}
                          aria-label="Remove sub-solution"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-center">
        <Button type="button" size="icon" className="h-8 w-8 shrink-0" onClick={addRow} aria-label="Add another item">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="h-8 min-w-24"
          onClick={() => {
            const validRows = rows.filter((r) => r.itemName.trim() && r.prm && r.subSolutions.some((s) => s.trim()));
            if (validRows.length === 0) return;
            onSubmit(validRows.map((r) => ({
              ...r,
              subSolutions: r.subSolutions.map((s) => s.trim()).filter(Boolean),
              id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())
            })));
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </>
  );
}

function CreateDrawer({
  drawerKey,
  onClose,
  workflowRules,
  onSaveWorkflowRule,
  onCreatePr,
  onCreateRfq,
  onCreatePo,
  onCreateMasterData,
}: {
  drawerKey: DrawerKey | null;
  onClose: () => void;
  workflowRules: WorkflowRule[];
  onSaveWorkflowRule: (rule: WorkflowRule) => void;
  onCreatePr: (record: CreatedPrRecord) => void;
  onCreateRfq: (record: CreatedRfqRecord) => void;
  onCreatePo: (record: CreatedPoRecord) => void;
  onCreateMasterData: (rows: ItemMasterRow[]) => void;
}) {
  if (!drawerKey) return null;

  const contentMap: Record<Exclude<DrawerKey, "master-data" | "pr" | "rfq" | "po" | "approval-rule">, { title: string; hint: string; fields: string[] }> = {
    supplier: {
      title: "Create Supplier Profile",
      hint: "Register supplier details for sourcing workflows.",
      fields: ["Supplier name", "Country", "Currency", "Type (local/offshore)", "Contact person"],
    },
    inventory: {
      title: "Create Goods Receipt Update",
      hint: "Record inbound stock and update bin locations.",
      fields: ["Reference PO", "Item", "Received quantity", "Warehouse/bin", "Receipt date"],
    },
    report: {
      title: "Create Report View",
      hint: "Build a filtered analytics report for SCM monitoring.",
      fields: ["Report name", "Date range", "Module filter", "Supplier/item filter", "Output format"],
    },
  };

  if (drawerKey === "master-data") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Create Item Master Data</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close modal">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ItemMasterDataForm onClose={onClose} onSubmit={onCreateMasterData} />
        </div>
      </div>
    );
  }

  if (drawerKey === "pr") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-2xl rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Create Purchase Requisition</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close modal">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <PurchaseRequisitionForm onClose={onClose} onSubmit={onCreatePr} />
        </div>
      </div>
    );
  }

  if (drawerKey === "rfq") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-3xl rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Create Request for Quotation</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close modal">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <RequestForQuotationForm onClose={onClose} onSubmit={onCreateRfq} />
        </div>
      </div>
    );
  }

  if (drawerKey === "po") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-3xl rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Create Purchase Order</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close modal">
              <X className="h-4 w-4" />
            </Button>
          </div>
            <PurchaseOrderForm onClose={onClose} onSubmit={onCreatePo} />
        </div>
      </div>
    );
  }

  if (drawerKey === "approval-rule") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="no-scrollbar max-h-[min(90vh,720px)] w-full max-w-xl overflow-y-auto rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Create workflow rule</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="border-0 bg-transparent shadow-none hover:bg-muted/70 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <WorkflowRuleEditorForm
            initialRule={null}
            existingRules={workflowRules}
            onClose={onClose}
            onSave={onSaveWorkflowRule}
          />
        </div>
      </div>
    );
  }

  const content = contentMap[drawerKey];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-lg border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{content.title}</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close modal">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {content.fields.map((field) => (
            <Input key={field} placeholder={field} />
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-8 min-w-24" onClick={onClose}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function DashboardModule() {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Total PRs", value: "126", icon: FileText },
          { title: "Total POs", value: "88", icon: ShoppingCart },
          { title: "Total Spend", value: "$4.26M", icon: Wallet },
          { title: "Stock Overview", value: "1,842 SKUs", icon: Package },
        ].map(({ title, value, icon: Icon }) => (
          <Card key={title} className={KPI_STAT_CARD_CN}>
            <CardContent className={KPI_STAT_CONTENT_CN}>
              <div className="flex items-start justify-between gap-2">
                <p className={KPI_STAT_VALUE_CN}>{value}</p>
                <Icon className={cn(KPI_STAT_ICON_CN)} aria-hidden />
              </div>
              <p className={KPI_STAT_LABEL_CN}>{title}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md">
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead className="bg-muted/60 text-slate-600">
                  <tr>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Reference</th>
                    <th className="px-3 py-3 font-medium">Requester</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["PR", "PR-2459", "A. Tadesse", "Pending"],
                    ["RFQ", "RFQ-884", "M. Silva", "Open"],
                    ["PO", "PO-991", "L. Kim", "Pending"],
                  ].map((row) => (
                    <tr key={row[1]} className="border-t">
                      <td className="px-3 py-2">{row[0]}</td>
                      <td className="px-3 py-2">{row[1]}</td>
                      <td className="px-3 py-2">{row[2]}</td>
                      <td className="px-3 py-2"><StatusBadge value={row[3]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts & Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <p className="rounded-md bg-red-50 p-2 text-destructive">Low stock: Stainless Bolts M16 is below minimum threshold.</p>
            <p className="rounded-md bg-orange-50 p-2 text-orange-700">Delayed order: PO-773 offshore shipment delayed by 6 days.</p>
            <p className="rounded-md bg-amber-50 p-2 text-amber-700">Budget warning: Logistics budget has reached 92% usage.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type RequestSourceFilter = "all" | "project" | "department";

type ModuleSourceRow = {
  sourceKind: "project" | "department";
  projectKey: string | null;
  departmentKey: string | null;
};

const MODULE_FILTER_PROJECT_OPTIONS = [
  { value: "proj-a", label: "Construction Project A" },
  { value: "proj-b", label: "Road Expansion Project" },
  { value: "proj-c", label: "Warehouse Setup" },
] as const;

const MODULE_FILTER_DEPARTMENT_OPTIONS = [
  { value: "ops", label: "Operations" },
  { value: "log", label: "Logistics" },
  { value: "mro", label: "MRO" },
  { value: "it", label: "IT Department" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "HR Department" },
] as const;

const MODULE_SOURCE_FILTER_SELECT =
  "h-9 w-[8rem] shrink-0 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground";

function matchesModuleSourceFilter(
  row: ModuleSourceRow,
  requestSource: RequestSourceFilter,
  projectId: string,
  departmentId: string,
): boolean {
  if (requestSource === "project" && row.sourceKind !== "project") return false;
  if (requestSource === "department" && row.sourceKind !== "department") return false;
  if (projectId && row.projectKey !== projectId) return false;
  if (departmentId && row.departmentKey !== departmentId) return false;
  return true;
}

function useModuleSourceFilters() {
  const [requestSource, setRequestSource] = useState<RequestSourceFilter>("all");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  return { requestSource, setRequestSource, projectId, setProjectId, departmentId, setDepartmentId };
}

/** Placeholder-only selects; always enabled. Use inside the same flex row as other filters. */
function ModuleSourceFilterSelects({
  requestSource,
  onRequestSourceChange,
  projectId,
  onProjectIdChange,
  departmentId,
  onDepartmentIdChange,
}: {
  requestSource: RequestSourceFilter;
  onRequestSourceChange: (v: RequestSourceFilter) => void;
  projectId: string;
  onProjectIdChange: (v: string) => void;
  departmentId: string;
  onDepartmentIdChange: (v: string) => void;
}) {
  return (
    <>
      <select
        className={cn(MODULE_SOURCE_FILTER_SELECT, requestSource !== "all" && "text-foreground")}
        value={requestSource}
        onChange={(e) => onRequestSourceChange(e.target.value as RequestSourceFilter)}
        aria-label="Request source"
      >
        <option value="all">All</option>
        <option value="project">Project</option>
        <option value="department">Operation</option>
      </select>
      <select
        className={cn(MODULE_SOURCE_FILTER_SELECT, projectId && "text-foreground")}
        value={projectId}
        onChange={(e) => onProjectIdChange(e.target.value)}
        aria-label="Project"
      >
        <option value="">Project</option>
        {MODULE_FILTER_PROJECT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className={cn(MODULE_SOURCE_FILTER_SELECT, departmentId && "text-foreground")}
        value={departmentId}
        onChange={(e) => onDepartmentIdChange(e.target.value)}
        aria-label="Department"
      >
        <option value="">Department</option>
        {MODULE_FILTER_DEPARTMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

const PR_MODULE_TABLE_ROWS = [
  {
    ref: "PR-1023",
    typeLabel: "Project PR",
    entityLabel: "Construction Project A",
    requester: "John Doe",
    owner: "Sarah Smith",
    status: "Pending",
    sla: "24h",
    sourceKind: "project" as const,
    projectKey: "proj-a" as const,
    departmentKey: null,
  },
  {
    ref: "PR-1024",
    typeLabel: "Support PR",
    entityLabel: "IT Department",
    requester: "Michael Lee",
    owner: "David Kim",
    status: "Approved",
    sla: "12h",
    sourceKind: "department" as const,
    projectKey: null,
    departmentKey: "it" as const,
  },
  {
    ref: "PR-1025",
    typeLabel: "Project PR",
    entityLabel: "Road Expansion Project",
    requester: "Anna Brown",
    owner: "Sarah Smith",
    status: "Draft",
    sla: "-",
    sourceKind: "project" as const,
    projectKey: "proj-b" as const,
    departmentKey: null,
    showSubmitApproval: true as const,
  },
  {
    ref: "PR-1026",
    typeLabel: "Support PR",
    entityLabel: "HR Department",
    requester: "James Wilson",
    owner: "Emily Davis",
    status: "Rejected",
    sla: "-",
    sourceKind: "department" as const,
    projectKey: null,
    departmentKey: "hr" as const,
  },
  {
    ref: "PR-1027",
    typeLabel: "Project PR",
    entityLabel: "Warehouse Setup",
    requester: "Daniel Garcia",
    owner: "David Kim",
    status: "Pending",
    sla: "48h",
    sourceKind: "project" as const,
    projectKey: "proj-c" as const,
    departmentKey: null,
  },
] as const;

const RFQ_MODULE_TABLE_ROWS = [
  {
    rfq: "RFQ-1001",
    title: "Office Supplies Procurement",
    prRef: "PR-1023",
    suppliers: "3 Suppliers",
    deadline: "2026-04-20",
    status: "Sent",
    sourceKind: "project" as const,
    projectKey: "proj-a" as const,
    departmentKey: null,
  },
  {
    rfq: "RFQ-1002",
    title: "IT Equipment Purchase",
    prRef: "PR-1024",
    suppliers: "5 Suppliers",
    deadline: "2026-04-18",
    status: "Draft",
    sourceKind: "department" as const,
    projectKey: null,
    departmentKey: "it" as const,
    showSubmitApproval: true as const,
  },
  {
    rfq: "RFQ-1003",
    title: "Construction Materials",
    prRef: "PR-1025",
    suppliers: "4 Suppliers",
    deadline: "2026-04-25",
    status: "Quotations Received",
    sourceKind: "project" as const,
    projectKey: "proj-b" as const,
    departmentKey: null,
  },
  {
    rfq: "RFQ-1004",
    title: "Furniture Procurement",
    prRef: "PR-1026",
    suppliers: "2 Suppliers",
    deadline: "2026-04-22",
    status: "Awarded",
    sourceKind: "department" as const,
    projectKey: null,
    departmentKey: "hr" as const,
  },
  {
    rfq: "RFQ-1005",
    title: "Warehouse Tools",
    prRef: "PR-1027",
    suppliers: "3 Suppliers",
    deadline: "2026-04-19",
    status: "Sent",
    sourceKind: "project" as const,
    projectKey: "proj-c" as const,
    departmentKey: null,
  },
] as const;

const PO_MODULE_TABLE_ROWS = [
  {
    po: "PO-1001",
    supplier: "ABC Supplier",
    approval: "Approved",
    orderSource: "Project",
    requestType: "Product",
    sourceKind: "project" as const,
    projectKey: "proj-a" as const,
    departmentKey: null,
  },
  {
    po: "PO-1002",
    supplier: "XYZ Services",
    approval: "Rejected",
    orderSource: "Department",
    requestType: "Service",
    sourceKind: "department" as const,
    projectKey: null,
    departmentKey: "finance" as const,
  },
  {
    po: "PO-1003",
    supplier: "Global Training Co.",
    approval: "Approved",
    orderSource: "Project",
    requestType: "Training",
    sourceKind: "project" as const,
    projectKey: "proj-c" as const,
    departmentKey: null,
  },
  {
    po: "PO-1006",
    supplier: "Contoso Logistics",
    approval: "Pending Approval",
    orderSource: "Department",
    requestType: "Service",
    sourceKind: "department" as const,
    projectKey: null,
    departmentKey: "ops" as const,
    showSubmitApproval: true as const,
  },
] as const;

function ProcurementModule({
  onOpenDrawer,
  onSubmitForApproval,
  onCreatePo,
  createdPrs,
  createdRfqs,
  setCreatedRfqs,
  createdPos,
  createdMasterDataRows,
}: {
  onOpenDrawer: (key: DrawerKey) => void;
  onSubmitForApproval: (payload: SubmitApprovalDocumentInput) => string | null;
  onCreatePo: (record: CreatedPoRecord) => void;
  createdPrs: CreatedPrRecord[];
  createdRfqs: CreatedRfqRecord[];
  setCreatedRfqs: Dispatch<SetStateAction<CreatedRfqRecord[]>>;
  createdPos: CreatedPoRecord[];
  createdMasterDataRows: ItemMasterRow[];
}) {
  type UserRole = "All" | "Field Engineer" | "Team Lead" | "Sourcing Officer" | "Approver";
  type PrRow = {
    id?: string;
    ref: string;
    typeLabel: string;
    entityLabel: string;
    requester: string;
    owner: string;
    status: string;
    sla: string;
    sourceKind: "project" | "department";
    projectKey: string | null;
    departmentKey: string | null;
    showSubmitApproval?: true;
    createdAt?: string;
    lineItems: Array<{ name: string; quantity: string; unit: string; specification: string }>;
    baselineTotal: number;
    terms: string;
  };
  type PrSourcingStatus = "Pending Sourcing" | "In Sourcing Process";
  type SourceKind = "project" | "department";
  type RfqRow = {
    rfq: string;
    title: string;
    prRef: string;
    suppliers: string;
    deadline: string;
    sourceKind: SourceKind;
    projectKey: string | null;
    departmentKey: string | null;
    status: RfqLifecycleStatus;
    deliveryTimeline: string;
    terms: string;
    baselineTotal: number;
    lineItems: Array<{ name: string; quantity: string; unit: string; specification: string }>;
    selectedSuppliers: string[];
    quotations: RfqQuotation[];
    awardedSupplier: string | null;
    notificationTriggered: boolean;
    createdAt?: string;
  };
  type PoRow = {
    po: string;
    supplier: string;
    approval: string;
    orderSource: string;
    requestType: string;
    sourceKind: SourceKind;
    projectKey: string | null;
    departmentKey: string | null;
    lineItems?: Array<{ name: string; quantity: string; price: number; deliveryDate: string }>;
    totalAmount?: number;
    deliveryTerms?: string;
    paymentTerms?: string;
    showSubmitApproval?: true;
    createdAt?: string;
  };

  const [tab, setTab] = useState<ProcurementTab>("Overview");
  const tabs: ProcurementTab[] = [
    "Overview",
    "Master Data",
    "Purchase Requisition",
    "RFQ",
    "Purchase Order",
    "Settings",
  ];
  const [settingsSegment, setSettingsSegment] = useState<ProcurementSettingsSegment>("uom");
  const [uomRows, setUomRows] = useState<ProcurementUomRow[]>([
    { id: "uom-1", unitName: "Each", abbreviation: "ea", description: "Count of discrete items" },
    { id: "uom-2", unitName: "Kilogram", abbreviation: "kg", description: "Standard mass for materials" },
  ]);
  const [itemCategoryRows, setItemCategoryRows] = useState<ProcurementItemCategoryRow[]>([
    {
      id: "ic-1",
      categoryName: "Construction materials",
      description: "Cement, aggregates, and structural inputs",
      createdAt: "2026-03-18",
    },
    { id: "ic-2", categoryName: "MRO", description: "Maintenance, repair, and operations supplies", createdAt: "2026-04-02" },
  ]);
  const [createUomOpen, setCreateUomOpen] = useState(false);
  const [createItemCategoryOpen, setCreateItemCategoryOpen] = useState(false);
  const [newUomUnitName, setNewUomUnitName] = useState("");
  const [newUomAbbrev, setNewUomAbbrev] = useState("");
  const [newUomDescription, setNewUomDescription] = useState("");
  const [uomEditId, setUomEditId] = useState<string | null>(null);
  const [newItemCategoryName, setNewItemCategoryName] = useState("");
  const [newItemCategoryDescription, setNewItemCategoryDescription] = useState("");
  const [itemCategoryEditId, setItemCategoryEditId] = useState<string | null>(null);
  const [uomSettingsSearch, setUomSettingsSearch] = useState("");
  const [itemCategorySettingsSearch, setItemCategorySettingsSearch] = useState("");

  const filteredUomSettingsRows = useMemo(() => {
    const q = uomSettingsSearch.trim().toLowerCase();
    if (!q) return uomRows;
    return uomRows.filter(
      (r) =>
        r.unitName.toLowerCase().includes(q) ||
        r.abbreviation.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [uomRows, uomSettingsSearch]);

  const filteredItemCategorySettingsRows = useMemo(() => {
    const q = itemCategorySettingsSearch.trim().toLowerCase();
    if (!q) return itemCategoryRows;
    return itemCategoryRows.filter(
      (r) =>
        r.categoryName.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        r.createdAt.toLowerCase().includes(q)
    );
  }, [itemCategoryRows, itemCategorySettingsSearch]);

  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>("All");
  const [submitDoc, setSubmitDoc] = useState<null | {
    documentRef: string;
    docType: DocType;
    title: string;
    amountStr: string;
    dept: string;
  }>(null);

  const prFilters = useModuleSourceFilters();
  const rfqFilters = useModuleSourceFilters();
  const poFilters = useModuleSourceFilters();

  const [prRows, setPrRows] = useState<PrRow[]>(() =>
    PR_MODULE_TABLE_ROWS.map((row) => ({
      ...row,
      status:
        row.ref === "PR-1023"
          ? ("Pending Approval" as const)
          : row.ref === "PR-1024"
            ? ("Pending Sourcing" as const)
            : row.ref === "PR-1025"
              ? ("Pending Sourcing" as const)
              : row.ref === "PR-1027"
                ? ("In Sourcing Process" as const)
                : row.status,
      lineItems:
        row.ref === "PR-1023"
          ? [{ name: "Office chairs", quantity: "20", unit: "pcs", specification: "Ergonomic, mesh back" }]
          : row.ref === "PR-1024"
            ? [{ name: "Laptops", quantity: "10", unit: "pcs", specification: "16GB RAM, i7 CPU" }]
            : row.ref === "PR-1025"
              ? [{ name: "Cement", quantity: "500", unit: "bag", specification: "42.5R grade" }]
              : [{ name: "General item", quantity: "1", unit: "pcs", specification: "As requested" }],
      baselineTotal: row.ref === "PR-1024" ? 12000 : row.ref === "PR-1025" ? 4200 : 8000,
      terms: "Payment within 30 days after verified delivery.",
    }))
  );
  const [rfqRows, setRfqRows] = useState<RfqRow[]>(() => {
    const pool = ["Swift Supplies", "Hansei Global", "Apollo Components", "Zenith Industrial"];
    const pickSuppliers = (label: string) => {
      const m = /^(\d+)/.exec(label);
      const n = m ? Math.min(Number(m[1]), pool.length) : 1;
      return pool.slice(0, Math.max(n, 1));
    };
    return RFQ_MODULE_TABLE_ROWS.map((row) => {
      const selectedSuppliers = pickSuppliers(row.suppliers);
      const status: RfqLifecycleStatus =
        row.status === "Draft"
          ? "Draft"
          : row.status === "Awarded"
            ? "Awarded"
            : row.status === "Quotations Received"
              ? "Quotations Received"
              : "Sent";
      const quotations: RfqQuotation[] =
        row.rfq === "RFQ-1003"
          ? [
              {
                supplier: "Swift Supplies",
                unitPrice: 100,
                totalPrice: 8000,
                currency: "USD",
                deliveryDate: "2026-05-01",
                deliveryTime: "2 weeks",
                deliveryTimeline: "2026-05-01 — 2 weeks",
                notes: "Stock available",
              },
              {
                supplier: "Hansei Global",
                unitPrice: 92,
                totalPrice: 7360,
                currency: "USD",
                deliveryDate: "2026-05-10",
                deliveryTime: "3 weeks",
                deliveryTimeline: "2026-05-10 — 3 weeks",
                notes: "",
              },
              {
                supplier: "Apollo Components",
                unitPrice: 105,
                totalPrice: 8400,
                currency: "USD",
                deliveryDate: "2026-04-28",
                deliveryTime: "10 days",
                deliveryTimeline: "2026-04-28 — 10 days",
                notes: "Express line",
              },
              {
                supplier: "Zenith Industrial",
                unitPrice: 98,
                totalPrice: 7840,
                currency: "USD",
                deliveryDate: "2026-05-05",
                deliveryTime: "2.5 weeks",
                deliveryTimeline: "2026-05-05 — 2.5 weeks",
                notes: "",
              },
            ]
          : [];
      return {
        ...row,
        status,
        deliveryTimeline: "30 days after PO release",
        terms: "Supplier must comply with agreed quality and delivery terms.",
        baselineTotal: row.prRef === "PR-1024" ? 12000 : row.prRef === "PR-1025" ? 4200 : 8000,
        lineItems: [{ name: row.title, quantity: "1", unit: "lot", specification: "As per PR scope" }],
        selectedSuppliers,
        quotations,
        awardedSupplier: row.status === "Awarded" ? "Swift Supplies" : null,
        notificationTriggered: ["Sent", "Quotations Received", "Awarded"].includes(status),
        createdAt: "2026-04-21",
      };
    });
  });
  const [poRows, setPoRows] = useState<PoRow[]>([...PO_MODULE_TABLE_ROWS]);
  const [poStatusFilter, setPoStatusFilter] = useState<"All" | "Pending Approval" | "Approved" | "Rejected">("All");
  const [poApproveTarget, setPoApproveTarget] = useState<PoRow | null>(null);
  const [poRejectTarget, setPoRejectTarget] = useState<PoRow | null>(null);
  const [poRejectReason, setPoRejectReason] = useState("");
  const [poEditRow, setPoEditRow] = useState<PoRow | null>(null);
  const [poGenerateRow, setPoGenerateRow] = useState<PoRow | null>(null);
  const [masterDataRows, setMasterDataRows] = useState<ItemMasterRow[]>([
    { id: "md-1", itemName: "Cast Iron Valve", prm: "Sarah Smith", subSolutions: ["Valve Assembly", "Pressure Control"] },
    { id: "md-2", itemName: "Packing Tape", prm: "Alex Johnson", subSolutions: ["Warehouse Packaging"] },
  ]);
  const [activeRfqId, setActiveRfqId] = useState<string | null>(null);
  const [rfqViewTab, setRfqViewTab] = useState<"details" | "items" | "suppliers">("details");
  const [rfqFlowNotice, setRfqFlowNotice] = useState<string | null>(null);
  const [rfqCreateFromPr, setRfqCreateFromPr] = useState<PrRow | null>(null);
  const [rfqEditRow, setRfqEditRow] = useState<RfqRow | null>(null);
  const [sendRfqConfirm, setSendRfqConfirm] = useState<RfqRow | null>(null);
  const [recordQuotationsRfqId, setRecordQuotationsRfqId] = useState<string | null>(null);
  const [recordQuotationForm, setRecordQuotationForm] = useState<
    Record<string, { unitPrice: string; totalPrice: string; currency: string; deliveryDate: string; deliveryTime: string; notes: string }>
  >({});
  const [recordQuotationError, setRecordQuotationError] = useState<string | null>(null);
  const [compareModalRfqId, setCompareModalRfqId] = useState<string | null>(null);
  const [poCreateSeed, setPoCreateSeed] = useState<
    null | { source: "pr"; pr: PrRow } | { source: "rfq"; rfq: RfqRow }
  >(null);
  const [prCommentRow, setPrCommentRow] = useState<PrRow | null>(null);
  const [prCommentText, setPrCommentText] = useState("");
  const [prDetailRow, setPrDetailRow] = useState<PrRow | null>(null);
  const [prDetailTab, setPrDetailTab] = useState<"overview" | "bom" | "timeline" | "conversation" | "activity">("overview");
  const [prDecisionModal, setPrDecisionModal] = useState<{ row: PrRow; action: "approve" | "reject" } | null>(null);
  const [prRejectReason, setPrRejectReason] = useState("");

  const prDetailActivityLog = useMemo(() => {
    if (!prDetailRow) return [];
    const row = prDetailRow;
    const t0 = Date.parse(row.createdAt ?? new Date().toISOString());
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();

    type PrActivityEntry = { id: string; at: string; title: string; detail?: string; dot: "default" | "success" | "danger" | "muted" };
    const chron: PrActivityEntry[] = [];

    chron.push({
      id: "created",
      at: at(0),
      title: "Purchase requisition created",
      detail: `${row.requester} created ${row.ref} — ${row.typeLabel}.`,
      dot: "default",
    });

    if (row.status === "Draft") {
      return [...chron].reverse();
    }

    chron.push({
      id: "submitted",
      at: at(18),
      title: "Submitted for team lead approval",
      detail: "Entered the approval queue with line items and justification.",
      dot: "default",
    });

    if (row.status === "Pending Approval") {
      chron.push({
        id: "await-tl",
        at: at(40),
        title: "Awaiting team lead decision",
        detail: `Assigned owner: ${row.owner}.`,
        dot: "muted",
      });
      return [...chron].reverse();
    }

    if (row.status === "Rejected") {
      chron.push({
        id: "rejected",
        at: at(44),
        title: "Rejected by team lead",
        detail: "Workflow ended for this submission. The requester may revise and resubmit if applicable.",
        dot: "danger",
      });
      return [...chron].reverse();
    }

    chron.push({
      id: "tl-approved",
      at: at(42),
      title: "Approved by team lead",
      detail: "Team Lead approved the request. Responsibility transfers to the Sourcing Officer.",
      dot: "success",
    });

    chron.push({
      id: "routed-sourcing",
      at: at(43),
      title: "Routed to sourcing",
      detail: "Status set to Pending Sourcing. Next action sits with the Sourcing Officer queue.",
      dot: "default",
    });

    if (row.status === "Pending Sourcing Assignment") {
      chron.push({
        id: "await-assignment",
        at: at(58),
        title: "Awaiting sourcing officer assignment",
        detail: "Sourcing management will assign this PR to an officer.",
        dot: "muted",
      });
      return [...chron].reverse();
    }

    if (row.status === "Pending Sourcing") {
      chron.push({
        id: "sourcing-queue",
        at: at(62),
        title: "Queued for sourcing officer",
        detail: "Visible in the sourcing inbox until an officer accepts it.",
        dot: "muted",
      });
      return [...chron].reverse();
    }

    chron.push({
      id: "so-accepted",
      at: at(68),
      title: "Accepted by sourcing officer",
      detail: "A sourcing officer accepted the PR from the sourcing queue.",
      dot: "success",
    });

    if (row.status === "In Sourcing") {
      return [...chron].reverse();
    }

    if (row.status === "In Sourcing Process") {
      chron.push({
        id: "sourcing-active",
        at: at(82),
        title: "Sourcing in progress",
        detail: "RFQs or supplier engagement may be created from this requisition.",
        dot: "default",
      });
      return [...chron].reverse();
    }

    if (row.status === "In Procurement") {
      chron.push({
        id: "procurement",
        at: at(96),
        title: "Moved to procurement",
        detail: "Awarding and PO creation continue in the procurement workflow.",
        dot: "default",
      });
      return [...chron].reverse();
    }

    return [...chron].reverse();
  }, [prDetailRow]);

  useEffect(() => {
    if (createdPrs.length === 0) return;
    setPrRows((prev) => {
      const next = [...createdPrs, ...prev.filter((p) => !createdPrs.some((c) => c.ref === p.ref))];
      return next.sort((a, b) => Date.parse((b as { createdAt?: string }).createdAt ?? "0") - Date.parse((a as { createdAt?: string }).createdAt ?? "0"));
    });
  }, [createdPrs]);

  useEffect(() => {
    if (createdRfqs.length === 0) return;
    setRfqRows((prev) => {
      const next = [...createdRfqs, ...prev.filter((r) => !createdRfqs.some((c) => c.rfq === r.rfq))];
      return next.sort((a, b) => Date.parse((b as { createdAt?: string }).createdAt ?? "0") - Date.parse((a as { createdAt?: string }).createdAt ?? "0"));
    });
  }, [createdRfqs]);

  useEffect(() => {
    if (createdPos.length === 0) return;
    setPoRows((prev) => {
      const next = [...createdPos, ...prev.filter((p) => !createdPos.some((c) => c.po === p.po))];
      return next.sort((a, b) => Date.parse((b as { createdAt?: string }).createdAt ?? "0") - Date.parse((a as { createdAt?: string }).createdAt ?? "0"));
    });
  }, [createdPos]);

  useEffect(() => {
    if (createdMasterDataRows.length === 0) return;
    setMasterDataRows((prev) => [...createdMasterDataRows, ...prev.filter((p) => !createdMasterDataRows.some((c) => c.id === p.id))]);
  }, [createdMasterDataRows]);

  const filteredPrRows = useMemo(
    () =>
      prRows.filter((r) =>
        matchesModuleSourceFilter(r, prFilters.requestSource, prFilters.projectId, prFilters.departmentId),
      ),
    [prRows, prFilters.requestSource, prFilters.projectId, prFilters.departmentId],
  );
  const roleAwarePrRows = useMemo(() => {
    const inferredOwnerRole = (owner: string): UserRole => {
      if (owner === "Sarah Smith") return "Team Lead";
      if (owner === "David Kim") return "Sourcing Officer";
      return "Field Engineer";
    };
    if (activeRole === "All") return filteredPrRows;
    if (activeRole === "Field Engineer") {
      // Field Engineer tracks PRs they created, even when ownership shifts for approval/sourcing.
      return filteredPrRows.filter((r) => r.requester === "Alex Johnson");
    }
    return filteredPrRows.filter((r) => inferredOwnerRole(r.owner) === activeRole);
  }, [filteredPrRows, activeRole]);

  const getOwnerRole = useCallback((owner: string): Exclude<UserRole, "All"> => {
    if (owner === "Sarah Smith") return "Team Lead";
    if (owner === "David Kim") return "Sourcing Officer";
    return "Field Engineer";
  }, []);

  const filteredRfqRows = useMemo(
    () =>
      rfqRows.filter((r) =>
        matchesModuleSourceFilter(r, rfqFilters.requestSource, rfqFilters.projectId, rfqFilters.departmentId),
      ),
    [rfqRows, rfqFilters.requestSource, rfqFilters.projectId, rfqFilters.departmentId],
  );

  const filteredPoRows = useMemo(
    () =>
      poRows.filter((r) => {
        const sourceMatch = matchesModuleSourceFilter(r, poFilters.requestSource, poFilters.projectId, poFilters.departmentId);
        const statusMatch = poStatusFilter === "All" || r.approval === poStatusFilter;
        return sourceMatch && statusMatch;
      }),
    [poRows, poFilters.requestSource, poFilters.projectId, poFilters.departmentId, poStatusFilter],
  );
  const roleAwarePoRows = useMemo(() => {
    // PO records are shared between Sourcing Officer and Approver.
    // "All" should always show the combined shared list.
    if (activeRole === "All") return filteredPoRows;
    if (activeRole === "Sourcing Officer" || activeRole === "Approver") return filteredPoRows;
    return [];
  }, [filteredPoRows, activeRole]);

  const activeRfq = useMemo(() => rfqRows.find((r) => r.rfq === activeRfqId) ?? null, [rfqRows, activeRfqId]);

  const compareModalRfq = useMemo(
    () => (compareModalRfqId ? (rfqRows.find((r) => r.rfq === compareModalRfqId) ?? null) : null),
    [rfqRows, compareModalRfqId],
  );
  const compareSortedQuotes = useMemo(() => {
    if (!compareModalRfq) return [] as RfqQuotation[];
    return [...compareModalRfq.quotations].sort((a, b) => a.totalPrice - b.totalPrice || a.supplier.localeCompare(b.supplier));
  }, [compareModalRfq]);
  const compareBestSupplier = compareSortedQuotes[0]?.supplier ?? null;

  useEffect(() => {
    setRfqViewTab("details");
  }, [activeRfqId]);

  const sourcingPrStatuses: PrSourcingStatus[] = ["Pending Sourcing", "In Sourcing Process"];

  const updateRfq = useCallback(
    (rfqId: string, patch: Partial<RfqRow>) => {
      setRfqRows((prev) => prev.map((row) => (row.rfq === rfqId ? { ...row, ...patch } : row)));
      setCreatedRfqs((prev) => {
        const has = prev.some((c) => c.rfq === rfqId);
        if (!has) return prev;
        return prev.map((c) => (c.rfq === rfqId ? { ...c, ...patch } : c));
      });
    },
    [setCreatedRfqs],
  );

  const createRfqFromPr = useCallback((prRef: string) => {
    const pr = prRows.find((p) => p.ref === prRef);
    if (!pr) return;
    setRfqCreateFromPr(pr);
  }, [prRows]);

  const updatePrStatus = useCallback((prRef: string, status: string) => {
    setPrRows((prev) => prev.map((row) => (row.ref === prRef ? { ...row, status } : row)));
  }, []);

  const updatePoApproval = useCallback((poId: string, approval: "Pending Approval" | "Approved" | "Rejected") => {
    setPoRows((prev) => prev.map((row) => (row.po === poId ? { ...row, approval } : row)));
  }, []);

  const handleSendRfq = useCallback(
    (row: RfqRow) => {
      const itemsComplete = row.lineItems.every((i) => i.name && i.quantity && i.specification);
      if (!row.title.trim() || !row.deadline || !itemsComplete || row.selectedSuppliers.length === 0) {
        setRfqFlowNotice(
          `Validation failed for ${row.rfq}: title, deadline, complete line items, and at least one selected supplier are required before sending.`,
        );
        return false;
      }
      updateRfq(row.rfq, { status: "Sent", notificationTriggered: true });
      setRfqFlowNotice(`${row.rfq} sent to suppliers.`);
      return true;
    },
    [updateRfq],
  );

  useEffect(() => {
    if (!recordQuotationsRfqId) {
      setRecordQuotationError(null);
      return;
    }
    const row = rfqRows.find((r) => r.rfq === recordQuotationsRfqId);
    if (!row) return;
    const pool = ["Swift Supplies", "Hansei Global", "Apollo Components", "Zenith Industrial"];
    const list =
      row.selectedSuppliers.length > 0
        ? row.selectedSuppliers
        : (() => {
            const m = /^(\d+)/.exec(row.suppliers);
            const n = m ? Math.min(Number(m[1]), pool.length) : 0;
            return pool.slice(0, Math.max(n, 0));
          })();
    const next: Record<string, { unitPrice: string; totalPrice: string; currency: string; deliveryDate: string; deliveryTime: string; notes: string }> = {};
    for (const s of list) {
      const existing = row.quotations.find((q) => q.supplier === s);
      next[s] = existing
        ? {
            unitPrice: String(existing.unitPrice),
            totalPrice: String(existing.totalPrice),
            currency: existing.currency,
            deliveryDate: existing.deliveryDate ?? "",
            deliveryTime: existing.deliveryTime ?? "",
            notes: existing.notes,
          }
        : { unitPrice: "", totalPrice: "", currency: "USD", deliveryDate: "", deliveryTime: "", notes: "" };
    }
    setRecordQuotationForm(next);
    setRecordQuotationError(null);
    // Only re-seed when opening this modal for an RFQ (not when rfqRows changes while typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [recordQuotationsRfqId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-6">
        {tabs.map((item) => (
          <Button
            key={item}
            variant="ghost"
            onClick={() => setTab(item)}
            className={cn(
              "h-9 rounded-none border-0 bg-transparent px-0 text-sm font-normal shadow-none hover:bg-transparent",
              tab === item
                ? "text-primary hover:text-primary"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <span
              className={cn(
                "inline-block border-b border-transparent pb-1",
                tab === item && "border-primary text-primary font-bold"
              )}
            >
              {item}
            </span>
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Role</span>
          <select
            className="h-8 min-w-40 rounded-md border border-input bg-background px-2 text-xs"
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as UserRole)}
          >
            <option>All</option>
            <option>Field Engineer</option>
            <option>Team Lead</option>
            <option>Sourcing Officer</option>
            <option>Approver</option>
          </select>
        </div>
      </div>

      {tab === "Overview" && (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Requisitions", value: "126", icon: FileText },
              { label: "Pending Approvals", value: "18", icon: Clock },
              { label: "Active RFQs", value: "11", icon: FileSearch },
              { label: "Open Purchase Orders", value: "24", icon: ShoppingCart },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className={KPI_STAT_CARD_CN}>
                <CardContent className={KPI_STAT_CONTENT_CN}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={KPI_STAT_VALUE_CN}>{value}</p>
                    <Icon className={cn(KPI_STAT_ICON_CN)} aria-hidden />
                  </div>
                  <p className={KPI_STAT_LABEL_CN}>{label}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section>
            <Card className="shadow-none ring-0">
              <CardHeader>
                <CardTitle>Pending Actions</CardTitle>
                <CardAction>
                  <Button variant="link" className="h-auto px-0 text-xs">
                    View all
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ["PR-1023", "Requested by M. Ibrahim • 15 Apr", "Pending"],
                  ["PR-1021", "Requested by L. Kim • 15 Apr", "Pending"],
                  ["RFQ-304", "Awaiting supplier response • due today", "Open"],
                  ["RFQ-298", "Awaiting supplier response • 14 Apr", "Open"],
                  ["PO-881", "Pending supplier confirmation • 13 Apr", "Pending"],
                ].map((item) => (
                  <div key={item[0]} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-xs">
                    <div>
                      <p className="font-medium">{item[0]}</p>
                      <p className="text-muted-foreground">{item[1]}</p>
                    </div>
                    <StatusBadge value={item[2]} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="shadow-none ring-0">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {[
                  ["PR-1024 created by A. Tadesse", "2 mins ago"],
                  ["PR-1018 approved by F. Gomez", "18 mins ago"],
                  ["PR-1017 rejected - missing justification", "35 mins ago"],
                  ["PO-882 created from RFQ-304", "1 hour ago"],
                  ["RFQ-301 updated with revised quote", "2 hours ago"],
                  ["PO-876 confirmation received from supplier", "3 hours ago"],
                ].map((entry) => (
                  <div key={entry[0]} className="flex items-start justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
                    <p>{entry[0]}</p>
                    <span className="shrink-0 text-muted-foreground">{entry[1]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="shadow-none ring-0">
              <CardHeader>
                <CardTitle>Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-700">PO-773 is delayed by 6 days (offshore shipment).</p>
                <p className="rounded-md bg-slate-100 px-3 py-2">3 requisitions are still waiting final approval.</p>
                <p className="rounded-md bg-red-50 px-3 py-2 text-destructive">RFQ-290 expired without supplier response.</p>
              </CardContent>
            </Card>
          </section>
        </div>
      )}

      {tab === "Master Data" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input className="h-9 w-72" placeholder="Search name, PRM, sub-solution..." />
                <Button size="sm" className="h-8 min-w-24" onClick={() => onOpenDrawer("master-data")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </Button>
              </div>
              <div className="overflow-hidden rounded-md">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-3 font-medium">Name</th>
                      <th className="px-3 py-3 font-medium">PRM</th>
                      <th className="px-3 py-3 font-medium">Sub-solutions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterDataRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-muted-foreground" colSpan={4}>
                          No master data records yet. Create one to get started.
                        </td>
                      </tr>
                    ) : (
                      masterDataRows.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2">{row.itemName}</td>
                          <td className="px-3 py-2">{row.prm || "-"}</td>
                          <td className="px-3 py-2">{row.subSolutions.length ? row.subSolutions.join(", ") : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "Settings" && (
        <div className="space-y-4">
          <div
            className="inline-flex rounded-lg bg-muted/50 p-0.5 text-xs"
            role="tablist"
            aria-label="Procurement settings sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={settingsSegment === "uom"}
              onClick={() => setSettingsSegment("uom")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                settingsSegment === "uom"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Unit of Measurement
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSegment === "item"}
              onClick={() => setSettingsSegment("item")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                settingsSegment === "item"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Item Categories
            </button>
          </div>

          {settingsSegment === "uom" && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    className="h-9 min-w-0 flex-1"
                    placeholder="Search unit name, abbreviation, or description…"
                    value={uomSettingsSearch}
                    onChange={(e) => setUomSettingsSearch(e.target.value)}
                    aria-label="Search units of measurement"
                  />
                  <Button
                    size="sm"
                    className="h-8 min-w-24 shrink-0 self-center"
                    onClick={() => {
                      setUomEditId(null);
                      setNewUomUnitName("");
                      setNewUomAbbrev("");
                      setNewUomDescription("");
                      setCreateUomOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Unit
                  </Button>
                </div>
                <div className="overflow-hidden rounded-md">
                  <table className="w-full border-separate border-spacing-y-0 text-left text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Unit Name</th>
                        <th className="px-3 py-2.5 font-medium">Abbreviation</th>
                        <th className="px-3 py-2.5 font-medium">Description</th>
                        <th className="px-3 py-2.5 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uomRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                            No units of measurement yet. Add a unit to get started.
                          </td>
                        </tr>
                      ) : filteredUomSettingsRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                            No units match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredUomSettingsRows.map((row) => (
                          <tr key={row.id} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.unitName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.abbreviation || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.description || "—"}</td>
                            <td className="px-3 py-2">
                              <TableEditIconButton
                                onClick={() => {
                                  setUomEditId(row.id);
                                  setNewUomUnitName(row.unitName);
                                  setNewUomAbbrev(row.abbreviation);
                                  setNewUomDescription(row.description);
                                  setCreateUomOpen(true);
                                }}
                                aria-label="Edit unit of measurement"
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {settingsSegment === "item" && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    className="h-9 min-w-0 flex-1"
                    placeholder="Search category name, description, or date…"
                    value={itemCategorySettingsSearch}
                    onChange={(e) => setItemCategorySettingsSearch(e.target.value)}
                    aria-label="Search item categories"
                  />
                  <Button
                    size="sm"
                    className="h-8 min-w-24 shrink-0 self-center"
                    onClick={() => {
                      setItemCategoryEditId(null);
                      setNewItemCategoryName("");
                      setNewItemCategoryDescription("");
                      setCreateItemCategoryOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Category
                  </Button>
                </div>
                <div className="overflow-hidden rounded-md">
                  <table className="w-full border-separate border-spacing-y-0 text-left text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Category Name</th>
                        <th className="px-3 py-2.5 font-medium">Description</th>
                        <th className="px-3 py-2.5 font-medium">Created Date</th>
                        <th className="px-3 py-2.5 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemCategoryRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                            No item categories yet. Add a category to get started.
                          </td>
                        </tr>
                      ) : filteredItemCategorySettingsRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                            No categories match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredItemCategorySettingsRows.map((row) => (
                          <tr key={row.id} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.categoryName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.description || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.createdAt}</td>
                            <td className="px-3 py-2">
                              <TableEditIconButton
                                onClick={() => {
                                  setItemCategoryEditId(row.id);
                                  setNewItemCategoryName(row.categoryName);
                                  setNewItemCategoryDescription(row.description);
                                  setCreateItemCategoryOpen(true);
                                }}
                                aria-label="Edit item category"
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {createUomOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pc-uom-title">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => {
                  setUomEditId(null);
                  setCreateUomOpen(false);
                }}
              />
              <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
                <h3 id="pc-uom-title" className="text-sm font-semibold">
                  {uomEditId ? "Edit unit" : "Add unit"}
                </h3>
                <div className="mt-3 space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="pc-uom-name">
                      Unit Name
                    </label>
                    <Input
                      id="pc-uom-name"
                      className="h-9"
                      value={newUomUnitName}
                      onChange={(e) => setNewUomUnitName(e.target.value)}
                      placeholder="e.g. Meter"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="pc-uom-abbr">
                      Abbreviation
                    </label>
                    <Input
                      id="pc-uom-abbr"
                      className="h-9"
                      value={newUomAbbrev}
                      onChange={(e) => setNewUomAbbrev(e.target.value)}
                      placeholder="e.g. m"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="pc-uom-desc">
                      Description
                    </label>
                    <Input
                      id="pc-uom-desc"
                      className="h-9"
                      value={newUomDescription}
                      onChange={(e) => setNewUomDescription(e.target.value)}
                      placeholder="How this unit is used"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUomEditId(null);
                      setCreateUomOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const unitName = newUomUnitName.trim();
                      if (!unitName) return;
                      setUomRows((prev) => {
                        if (uomEditId) {
                          return prev.map((r) =>
                            r.id === uomEditId
                              ? {
                                  ...r,
                                  unitName,
                                  abbreviation: newUomAbbrev.trim(),
                                  description: newUomDescription.trim(),
                                }
                              : r
                          );
                        }
                        return [
                          {
                            id: `uom-${prev.length + 1}`,
                            unitName,
                            abbreviation: newUomAbbrev.trim(),
                            description: newUomDescription.trim(),
                          },
                          ...prev,
                        ];
                      });
                      setUomEditId(null);
                      setCreateUomOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {createItemCategoryOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pc-icat-title">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => {
                  setItemCategoryEditId(null);
                  setCreateItemCategoryOpen(false);
                }}
              />
              <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
                <h3 id="pc-icat-title" className="text-sm font-semibold">
                  {itemCategoryEditId ? "Edit category" : "Add category"}
                </h3>
                <div className="mt-3 space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="pc-icat-name">
                      Category Name
                    </label>
                    <Input
                      id="pc-icat-name"
                      className="h-9"
                      value={newItemCategoryName}
                      onChange={(e) => setNewItemCategoryName(e.target.value)}
                      placeholder="e.g. Spare parts"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="pc-icat-desc">
                      Description
                    </label>
                    <Input
                      id="pc-icat-desc"
                      className="h-9"
                      value={newItemCategoryDescription}
                      onChange={(e) => setNewItemCategoryDescription(e.target.value)}
                      placeholder="What belongs in this category"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setItemCategoryEditId(null);
                      setCreateItemCategoryOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const categoryName = newItemCategoryName.trim();
                      if (!categoryName) return;
                      const today = new Date().toISOString().slice(0, 10);
                      setItemCategoryRows((prev) => {
                        if (itemCategoryEditId) {
                          return prev.map((r) =>
                            r.id === itemCategoryEditId
                              ? {
                                  ...r,
                                  categoryName,
                                  description: newItemCategoryDescription.trim(),
                                }
                              : r
                          );
                        }
                        return [
                          {
                            id: `ic-${prev.length + 1}`,
                            categoryName,
                            description: newItemCategoryDescription.trim(),
                            createdAt: today,
                          },
                          ...prev,
                        ];
                      });
                      setItemCategoryEditId(null);
                      setCreateItemCategoryOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "Purchase Requisition" && (
        <div className="space-y-4">
          {approvalNotice ? (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                approvalNotice.startsWith("Error") || approvalNotice.startsWith("No workflow")
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              )}
            >
              {approvalNotice}
            </p>
          ) : null}
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Input className="h-9 w-72 shrink-0" placeholder="Search PR #, project, requester, items..." />
                  <ModuleSourceFilterSelects
                    requestSource={prFilters.requestSource}
                    onRequestSourceChange={prFilters.setRequestSource}
                    projectId={prFilters.projectId}
                    onProjectIdChange={prFilters.setProjectId}
                    departmentId={prFilters.departmentId}
                    onDepartmentIdChange={prFilters.setDepartmentId}
                  />
                  <select className="h-9 w-28 shrink-0 rounded-md border border-input bg-background px-3 text-xs">
                    <option>All</option>
                    <option>Draft</option>
                    <option>Pending</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                  </select>
                  <select className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-3 text-xs">
                    <option>All PRs</option>
                    <option>Project PRs</option>
                    <option>Support PRs</option>
                  </select>
                </div>
                {activeRole === "Field Engineer" ? (
                  <Button size="sm" className="h-9 min-w-24 shrink-0 self-center" onClick={() => onOpenDrawer("pr")}>
                    <Plus className="h-3.5 w-3.5" />
                    Create
                  </Button>
                ) : null}
              </div>

              <div className="overflow-hidden rounded-md">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-3 font-medium">PR #</th>
                      <th className="px-3 py-3 font-medium">Type</th>
                      <th className="px-3 py-3 font-medium">Project / Department</th>
                      <th className="px-3 py-3 font-medium">Requester</th>
                      <th className="px-3 py-3 font-medium">Owner</th>
                      <th className="px-3 py-3 font-medium">Owner Role</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">SLA</th>
                      <th className="px-3 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleAwarePrRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-muted-foreground" colSpan={9}>
                          No purchase requisitions yet. Create one to get started.
                        </td>
                      </tr>
                    ) : roleAwarePrRows.map((row) => (
                      <tr key={row.ref} className="border-t border-border/60">
                        <td className="px-3 py-2">{row.ref}</td>
                        <td className="px-3 py-2">{row.typeLabel}</td>
                        <td className="px-3 py-2">{row.entityLabel}</td>
                        <td className="px-3 py-2">{row.requester}</td>
                        <td className="px-3 py-2">{row.owner}</td>
                        <td className="px-3 py-2">{getOwnerRole(row.owner)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={row.status} />
                        </td>
                        <td className="px-3 py-2">{row.sla}</td>
                        <td className="px-3 py-2">
                          {(activeRole === "All" ? getOwnerRole(row.owner) : activeRole) === "Sourcing Officer" ? (
                            row.status === "Pending Sourcing" || row.status === "In Sourcing" || row.status === "In Sourcing Process" ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon-sm" variant="ghost" aria-label="Open actions">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem onClick={() => setPrDetailRow(row)}>Open</DropdownMenuItem>
                                  {row.status === "Pending Sourcing" ? (
                                    <DropdownMenuItem onClick={() => updatePrStatus(row.ref, "In Sourcing")}>Accept PR</DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem onClick={() => createRfqFromPr(row.ref)}>Create RFQ</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setPoCreateSeed({ source: "pr", pr: row })}>Proceed to Purchase Order</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <Button size="icon-sm" variant="ghost" aria-label="Open" onClick={() => setPrDetailRow(row)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )
                          ) : (activeRole === "All" ? getOwnerRole(row.owner) : activeRole) === "Team Lead" ? (
                            row.status === "Pending Approval" ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon-sm" variant="ghost" aria-label="Open actions">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={() => setPrDetailRow(row)}>View</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setPrDecisionModal({ row, action: "approve" }); setPrRejectReason(""); }}>Approve</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setPrDecisionModal({ row, action: "reject" }); setPrRejectReason(""); }}>Reject</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <Button size="icon-sm" variant="ghost" aria-label="Open" onClick={() => setPrDetailRow(row)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )
                          ) : (
                            <Button size="icon-sm" variant="ghost" aria-label="Open" onClick={() => setPrDetailRow(row)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing {roleAwarePrRows.length} of {prRows.length} records
              </p>
            </CardContent>
          </Card>

        </div>
      )}

      {tab === "RFQ" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Input className="h-9 w-72 shrink-0" placeholder="Search RFQs..." />
                  <ModuleSourceFilterSelects
                    requestSource={rfqFilters.requestSource}
                    onRequestSourceChange={rfqFilters.setRequestSource}
                    projectId={rfqFilters.projectId}
                    onProjectIdChange={rfqFilters.setProjectId}
                    departmentId={rfqFilters.departmentId}
                    onDepartmentIdChange={rfqFilters.setDepartmentId}
                  />
                  <select className="h-9 w-40 shrink-0 rounded-md border border-input bg-background px-3 text-xs">
                    <option>All Statuses</option>
                    <option>Draft</option>
                    <option>Sent</option>
                    <option>Quotations Received</option>
                    <option>Awarded</option>
                  </select>
                </div>
                <Button size="sm" className="h-9 min-w-24 shrink-0 self-center" onClick={() => onOpenDrawer("rfq")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </Button>
              </div>

              <div className="overflow-hidden rounded-md px-4 pb-4">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-3 font-medium">RFQ Number</th>
                      <th className="px-3 py-3 font-medium">Title</th>
                      <th className="px-3 py-3 font-medium">PR Ref</th>
                      <th className="px-3 py-3 font-medium">Suppliers</th>
                      <th className="px-3 py-3 font-medium">Deadline</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRfqRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-muted-foreground" colSpan={7}>
                          No RFQs yet. Create one to get started.
                        </td>
                      </tr>
                    ) : filteredRfqRows.map((row) => (
                      <tr key={row.rfq} className="border-t border-border/60">
                        <td className="px-3 py-2">{row.rfq}</td>
                        <td className="px-3 py-2">{row.title}</td>
                        <td className="px-3 py-2">{row.prRef}</td>
                        <td className="px-3 py-2">{row.suppliers}</td>
                        <td className="px-3 py-2">{row.deadline}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={row.status} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon-sm" variant="ghost" aria-label="Open actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setActiveRfqId(row.rfq)}>View</DropdownMenuItem>
                              {row.status === "Draft" ? (
                                <>
                                  <DropdownMenuItem onClick={() => setRfqEditRow(row)}>Edit</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSendRfqConfirm(row)}>Send to Suppliers</DropdownMenuItem>
                                </>
                              ) : null}
                              {row.status === "Sent" ? (
                                <DropdownMenuItem onClick={() => setRecordQuotationsRfqId(row.rfq)}>Record Quotations</DropdownMenuItem>
                              ) : null}
                              {row.status === "Quotations Received" ? (
                                <DropdownMenuItem onClick={() => setCompareModalRfqId(row.rfq)}>Compare & Select</DropdownMenuItem>
                              ) : null}
                              {row.status === "Awarded" ? (
                                <DropdownMenuItem onClick={() => setPoCreateSeed({ source: "rfq", rfq: row })}>
                                  Proceed to Purchase Order
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 pb-4 text-xs text-muted-foreground">
                Showing {filteredRfqRows.length} of {rfqRows.length} records
              </div>
            </CardContent>
          </Card>
          {rfqFlowNotice ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {rfqFlowNotice}
            </p>
          ) : null}
          {activeRfq
            ? (() => {
                const prMeta = prRows.find((p) => p.ref === activeRfq.prRef);
                const projectCode =
                  activeRfq.projectKey === "proj-a"
                    ? "PRJ-ALPHA"
                    : activeRfq.projectKey === "proj-b"
                      ? "PRJ-BETA"
                      : activeRfq.projectKey === "proj-c"
                        ? "PRJ-C"
                        : activeRfq.projectKey ?? "—";
                const subtitle = prMeta
                  ? `${prMeta.entityLabel} · ${activeRfq.prRef}`
                  : `${activeRfq.title} · ${activeRfq.prRef}`;
                const nItems = activeRfq.lineItems.length;
                const supplierList =
                  activeRfq.selectedSuppliers.length > 0
                    ? activeRfq.selectedSuppliers
                    : (() => {
                        const m = /^(\d+)/.exec(activeRfq.suppliers);
                        const n = m ? Math.min(Number(m[1]), 4) : 0;
                        const pool = ["Swift Supplies", "Hansei Global", "Apollo Components", "Zenith Industrial"];
                        return pool.slice(0, Math.max(n, 0));
                      })();
                const nSuppliers = supplierList.length;
                const createdStr = activeRfq.createdAt ?? "—";
                let deadlineUrgent = false;
                try {
                  const d = new Date(activeRfq.deadline);
                  if (!Number.isNaN(d.getTime())) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    deadlineUrgent = d < today;
                  }
                } catch {
                  deadlineUrgent = false;
                }
                const canCompare = activeRfq.status === "Quotations Received";
                const canRecordQuotes = activeRfq.status === "Sent";
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div
                      className="flex max-h-[min(92vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border/80 bg-card font-['Public_Sans'] text-sm shadow-lg"
                      role="dialog"
                      aria-labelledby="rfq-detail-title"
                    >
                      <div className="shrink-0 border-b border-border/70 px-5 pb-0 pt-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 id="rfq-detail-title" className="text-lg font-semibold leading-tight text-foreground">
                                RFQ Details
                              </h2>
                              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                                {activeRfq.rfq}
                              </span>
                              {activeRfq.status === "Quotations Received" ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                                  Quotations received
                                </span>
                              ) : (
                                <StatusBadge value={activeRfq.status} />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{subtitle}</p>
                          </div>
                          <Button variant="ghost" size="icon-sm" className="h-8 w-8 shrink-0 rounded-full" onClick={() => setActiveRfqId(null)} aria-label="Close">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1 border-b border-transparent">
                          {(
                            [
                              { id: "details" as const, label: "Details" },
                              { id: "items" as const, label: "Items", count: nItems },
                              { id: "suppliers" as const, label: "Suppliers", count: nSuppliers },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setRfqViewTab(t.id)}
                              className={cn(
                                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                                rfqViewTab === t.id
                                  ? "border-primary font-medium text-primary"
                                  : "border-transparent text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {t.label}
                              {"count" in t && t.count !== undefined ? (
                                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1 text-[11px] text-muted-foreground">
                                  {t.count}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-xs">
                        {rfqViewTab === "details" ? (
                          <div>
                            <div className="grid gap-y-3 gap-x-10 text-sm sm:grid-cols-2">
                              <div className="space-y-1">
                                <p className="text-muted-foreground">RFQ number</p>
                                <p className="font-medium">
                                  <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                                    {activeRfq.rfq}
                                  </span>
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">Title</p>
                                <p className="font-medium text-foreground">
                                  {activeRfq.status === "Draft" || !prMeta
                                    ? activeRfq.title
                                    : `RFQ — ${activeRfq.prRef} (${prMeta.entityLabel})`}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">PR reference</p>
                                <p className="font-medium">
                                  <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                                    {activeRfq.prRef}
                                  </span>
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">Deadline</p>
                                <p className="font-medium">
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                                      deadlineUrgent
                                        ? "bg-red-100 text-red-800"
                                        : "bg-slate-100 text-slate-800",
                                    )}
                                  >
                                    {activeRfq.deadline}
                                  </span>
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">Delivery timeline</p>
                                <p
                                  className={cn(
                                    "font-medium",
                                    !activeRfq.deliveryTimeline?.trim() && "text-muted-foreground/90",
                                  )}
                                >
                                  {activeRfq.deliveryTimeline?.trim() ? activeRfq.deliveryTimeline : "Not specified"}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">Created</p>
                                <p className="font-medium text-foreground">{createdStr}</p>
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <p className="text-muted-foreground">Terms</p>
                                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-foreground">
                                  <p>
                                    Sourced from {activeRfq.prRef} · {projectCode}
                                    {prMeta ? ` · ${prMeta.entityLabel}` : ""}
                                  </p>
                                  {prMeta ? (
                                    <p className="text-muted-foreground">Requester: {prMeta.requester}</p>
                                  ) : null}
                                  {activeRfq.terms ? <p className="pt-1 text-muted-foreground">{activeRfq.terms}</p> : null}
                                </div>
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <p className="text-muted-foreground">Attachments</p>
                                <p className="font-medium">
                                  <button
                                    type="button"
                                    className="inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-left text-xs font-medium text-sky-900 hover:bg-sky-100/80"
                                  >
                                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="truncate">PRD-0001 SMS PRD (1).docx</span>
                                  </button>
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {rfqViewTab === "items" ? (
                          <div className="overflow-hidden rounded-lg border border-border/70">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="px-3 py-2.5 font-medium">Item</th>
                                  <th className="px-3 py-2.5 font-medium">Qty</th>
                                  <th className="px-3 py-2.5 font-medium">UOM</th>
                                  <th className="px-3 py-2.5 font-medium">Specification</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeRfq.lineItems.map((line, idx) => (
                                  <tr key={`${activeRfq.rfq}-line-${idx}`} className="border-t border-border/60">
                                    <td className="px-3 py-2.5 font-medium text-foreground">{line.name}</td>
                                    <td className="px-3 py-2.5">{line.quantity}</td>
                                    <td className="px-3 py-2.5">{line.unit}</td>
                                    <td className="px-3 py-2.5 text-muted-foreground">{line.specification || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        {rfqViewTab === "suppliers" ? (
                          <ul className="space-y-2">
                            {supplierList.map((s) => (
                              <li
                                key={s}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
                              >
                                <span className="font-medium text-foreground">{s}</span>
                                <span className="text-[11px] text-muted-foreground">Invited</span>
                              </li>
                            ))}
                            {supplierList.length === 0 ? (
                              <p className="text-muted-foreground">No suppliers on file for this RFQ.</p>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-muted/20 px-5 py-4">
                        <Button type="button" variant="outline" className="h-9 min-w-24" onClick={() => setActiveRfqId(null)}>
                          Close
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 min-w-[8.5rem] gap-1.5"
                          disabled={!canCompare}
                          onClick={() => {
                            if (!canCompare) return;
                            setActiveRfqId(null);
                            setCompareModalRfqId(activeRfq.rfq);
                          }}
                        >
                          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                          Compare &amp; select
                        </Button>
                        <Button
                          type="button"
                          className="h-9 min-w-[9.5rem] gap-1.5"
                          disabled={!canRecordQuotes}
                          onClick={() => {
                            if (!canRecordQuotes) return;
                            setRecordQuotationsRfqId(activeRfq.rfq);
                          }}
                        >
                          <CheckSquare className="h-3.5 w-3.5" aria-hidden />
                          Record quotations
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()
            : null}
        </div>
      )}

      {tab === "Purchase Order" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Input className="h-9 w-72 shrink-0" placeholder="Search purchase order, supplier..." />
                  <ModuleSourceFilterSelects
                    requestSource={poFilters.requestSource}
                    onRequestSourceChange={poFilters.setRequestSource}
                    projectId={poFilters.projectId}
                    onProjectIdChange={poFilters.setProjectId}
                    departmentId={poFilters.departmentId}
                    onDepartmentIdChange={poFilters.setDepartmentId}
                  />
                  <select
                    className="h-9 w-40 shrink-0 rounded-md border border-input bg-background px-3 text-xs"
                    value={poStatusFilter}
                    onChange={(e) => setPoStatusFilter(e.target.value as "All" | "Pending Approval" | "Approved" | "Rejected")}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending Approval">Pending Approval</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                {activeRole === "Sourcing Officer" ? (
                  <Button size="sm" className="h-9 min-w-24 shrink-0 self-center" onClick={() => onOpenDrawer("po")}>
                    <Plus className="h-3.5 w-3.5" />
                    Create
                  </Button>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-md">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-3 font-medium">Purchase Order Number</th>
                      <th className="px-3 py-3 font-medium">Supplier</th>
                      <th className="px-3 py-3 font-medium">Approval Status</th>
                      <th className="px-3 py-3 font-medium">Order Source</th>
                      <th className="px-3 py-3 font-medium">Request Type</th>
                      <th className="px-3 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleAwarePoRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-muted-foreground" colSpan={6}>
                          No purchase orders yet. Create one to get started.
                        </td>
                      </tr>
                    ) : roleAwarePoRows.map((row) => (
                      <tr key={row.po} className="border-t border-border/60">
                        <td className="px-3 py-2">{row.po}</td>
                        <td className="px-3 py-2">{row.supplier}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={row.approval} />
                        </td>
                        <td className="px-3 py-2">{row.orderSource}</td>
                        <td className="px-3 py-2">{row.requestType}</td>
                        <td className="px-3 py-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon-sm" variant="ghost" aria-label="Open actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setApprovalNotice(`Viewing ${row.po} (${row.approval}).`)}>
                                View
                              </DropdownMenuItem>

                              {row.approval === "Pending Approval" && activeRole === "Sourcing Officer" ? (
                                <DropdownMenuItem onClick={() => setPoEditRow(row)}>Edit</DropdownMenuItem>
                              ) : null}

                              {row.approval === "Pending Approval" && activeRole === "Approver" ? (
                                <>
                                  <DropdownMenuItem onClick={() => setPoApproveTarget(row)}>Approve</DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setPoRejectTarget(row);
                                      setPoRejectReason("");
                                    }}
                                  >
                                    Reject
                                  </DropdownMenuItem>
                                </>
                              ) : null}

                              {row.approval === "Rejected" && activeRole === "Sourcing Officer" ? (
                                <DropdownMenuItem onClick={() => setPoEditRow(row)}>Edit / Revise</DropdownMenuItem>
                              ) : null}
                              {row.approval === "Approved" && activeRole === "Sourcing Officer" ? (
                                <DropdownMenuItem onClick={() => setPoGenerateRow(row)}>
                                  Generate
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-muted-foreground">
                Showing {roleAwarePoRows.length} of {poRows.length} records
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {rfqCreateFromPr ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-lg border bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Create RFQ from {rfqCreateFromPr.ref}</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setRfqCreateFromPr(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <RequestForQuotationForm
              onClose={() => setRfqCreateFromPr(null)}
              onSubmit={(record) => {
                setRfqRows((prev) => [record, ...prev]);
                updatePrStatus(rfqCreateFromPr.ref, "In Sourcing Process");
                setTab("RFQ");
                setRfqFlowNotice(`Draft ${record.rfq} created from ${rfqCreateFromPr.ref}.`);
                setRfqCreateFromPr(null);
              }}
              initialData={{
                title: `${rfqCreateFromPr.entityLabel} sourcing`,
                prRef: rfqCreateFromPr.ref,
                baselineTotal: rfqCreateFromPr.baselineTotal,
                deliveryTimeline: "30 days after award",
                terms: rfqCreateFromPr.terms,
                lineItems: rfqCreateFromPr.lineItems,
                sourceKind: rfqCreateFromPr.sourceKind,
                projectKey: rfqCreateFromPr.projectKey,
                departmentKey: rfqCreateFromPr.departmentKey,
              }}
            />
          </div>
        </div>
      ) : null}

      {sendRfqConfirm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 text-sm shadow-lg">
            <h3 className="font-semibold">Send to suppliers</h3>
            <p className="text-xs text-muted-foreground">
              Send {sendRfqConfirm.rfq} to the selected suppliers? The status will change to <span className="font-medium text-foreground">Sent</span>.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-8" onClick={() => setSendRfqConfirm(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-8"
                onClick={() => {
                  if (handleSendRfq(sendRfqConfirm)) {
                    setSendRfqConfirm(null);
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {rfqEditRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-lg border bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Edit {rfqEditRow.rfq}</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setRfqEditRow(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <RequestForQuotationForm
              editingRfqId={rfqEditRow.rfq}
              onClose={() => setRfqEditRow(null)}
              onSubmit={(record) => {
                setRfqRows((prev) =>
                  prev.map((r) =>
                    r.rfq === record.rfq
                      ? {
                          ...r,
                          title: record.title,
                          prRef: record.prRef,
                          suppliers: record.suppliers,
                          deadline: record.deadline,
                          sourceKind: record.sourceKind,
                          projectKey: record.projectKey,
                          departmentKey: record.departmentKey,
                          deliveryTimeline: record.deliveryTimeline,
                          terms: record.terms,
                          baselineTotal: record.baselineTotal,
                          lineItems: record.lineItems,
                          selectedSuppliers: record.selectedSuppliers,
                        }
                      : r,
                  ),
                );
                setCreatedRfqs((prev) => {
                  const i = prev.findIndex((c) => c.rfq === record.rfq);
                  if (i < 0) return prev;
                  const n = [...prev];
                  n[i] = { ...n[i], ...record };
                  return n;
                });
                setRfqEditRow(null);
                setRfqFlowNotice(`Updated ${record.rfq}.`);
              }}
              initialData={{
                id: createdRfqs.find((c) => c.rfq === rfqEditRow.rfq)?.id ?? `seed-${rfqEditRow.rfq}`,
                title: rfqEditRow.title,
                prRef: rfqEditRow.prRef,
                baselineTotal: rfqEditRow.baselineTotal,
                deadline: rfqEditRow.deadline,
                deliveryTimeline: rfqEditRow.deliveryTimeline,
                terms: rfqEditRow.terms,
                lineItems: rfqEditRow.lineItems,
                selectedSuppliers: rfqEditRow.selectedSuppliers,
                sourceKind: rfqEditRow.sourceKind,
                projectKey: rfqEditRow.projectKey,
                departmentKey: rfqEditRow.departmentKey,
                createdAt: rfqEditRow.createdAt,
              }}
            />
          </div>
        </div>
      ) : null}

      {recordQuotationsRfqId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,720px)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border bg-card p-5 text-xs shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Record Supplier Quotations</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setRecordQuotationsRfqId(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {(() => {
              const row = rfqRows.find((r) => r.rfq === recordQuotationsRfqId);
              if (!row) return <p className="text-muted-foreground">RFQ not found.</p>;
              const pool = ["Swift Supplies", "Hansei Global", "Apollo Components", "Zenith Industrial"];
              const supplierKeys =
                row.selectedSuppliers.length > 0
                  ? row.selectedSuppliers
                  : (() => {
                      const m = /^(\d+)/.exec(row.suppliers);
                      const n = m ? Math.min(Number(m[1]), pool.length) : 0;
                      return pool.slice(0, Math.max(n, 0));
                    })();
              if (supplierKeys.length === 0) {
                return <p className="text-destructive">Add at least one supplier before recording quotations.</p>;
              }
              return (
                <div className="space-y-4">
                  {supplierKeys.map((supplier) => {
                    const f = recordQuotationForm[supplier] ?? {
                      unitPrice: "",
                      totalPrice: "",
                      currency: "USD",
                      deliveryDate: "",
                      deliveryTime: "",
                      notes: "",
                    };
                    return (
                      <div key={supplier} className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4">
                        <p className="text-sm font-semibold text-primary">{supplier}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`ur-${recordQuotationsRfqId}-${supplier}-up`}>
                              Unit price
                            </label>
                            <Input
                              id={`ur-${recordQuotationsRfqId}-${supplier}-up`}
                              className="h-8"
                              inputMode="decimal"
                              value={f.unitPrice}
                              onChange={(e) =>
                                setRecordQuotationForm((prev) => ({ ...prev, [supplier]: { ...f, unitPrice: e.target.value } }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`ur-${recordQuotationsRfqId}-${supplier}-tp`}>
                              Total price
                            </label>
                            <Input
                              id={`ur-${recordQuotationsRfqId}-${supplier}-tp`}
                              className="h-8"
                              inputMode="decimal"
                              value={f.totalPrice}
                              onChange={(e) =>
                                setRecordQuotationForm((prev) => ({ ...prev, [supplier]: { ...f, totalPrice: e.target.value } }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`ur-${recordQuotationsRfqId}-${supplier}-cur`}>
                              Currency
                            </label>
                            <select
                              id={`ur-${recordQuotationsRfqId}-${supplier}-cur`}
                              className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                              value={f.currency}
                              onChange={(e) =>
                                setRecordQuotationForm((prev) => ({ ...prev, [supplier]: { ...f, currency: e.target.value } }))
                              }
                            >
                              <option value="USD">USD - US Dollar</option>
                              <option value="EUR">EUR - Euro</option>
                              <option value="GBP">GBP - British Pound</option>
                              <option value="JPY">JPY - Japanese Yen</option>
                              <option value="CNY">CNY - Chinese Yuan</option>
                              <option value="INR">INR - Indian Rupee</option>
                              <option value="CAD">CAD - Canadian Dollar</option>
                              <option value="AUD">AUD - Australian Dollar</option>
                              <option value="CHF">CHF - Swiss Franc</option>
                              <option value="ETB">ETB - Ethiopian Birr</option>
                              <option value="SAR">SAR - Saudi Riyal</option>
                              <option value="AED">AED - UAE Dirham</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`ur-${recordQuotationsRfqId}-${supplier}-dd`}>
                              Delivery date
                            </label>
                            <Input
                              id={`ur-${recordQuotationsRfqId}-${supplier}-dd`}
                              className="h-8"
                              type="date"
                              value={f.deliveryDate}
                              onChange={(e) =>
                                setRecordQuotationForm((prev) => ({ ...prev, [supplier]: { ...f, deliveryDate: e.target.value } }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`ur-${recordQuotationsRfqId}-${supplier}-dt`}>
                              Delivery time
                            </label>
                            <Input
                              id={`ur-${recordQuotationsRfqId}-${supplier}-dt`}
                              className="h-8"
                              placeholder="e.g. 2 weeks"
                              value={f.deliveryTime}
                              onChange={(e) =>
                                setRecordQuotationForm((prev) => ({ ...prev, [supplier]: { ...f, deliveryTime: e.target.value } }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`ur-${recordQuotationsRfqId}-${supplier}-n`}>
                              Notes
                            </label>
                            <Input
                              id={`ur-${recordQuotationsRfqId}-${supplier}-n`}
                              className="h-8"
                              value={f.notes}
                              onChange={(e) => setRecordQuotationForm((prev) => ({ ...prev, [supplier]: { ...f, notes: e.target.value } }))}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {recordQuotationError ? <p className="text-xs text-destructive">{recordQuotationError}</p> : null}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" className="h-8 min-w-24" onClick={() => setRecordQuotationsRfqId(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="h-8 min-w-24"
                      onClick={() => {
                        const out: RfqQuotation[] = [];
                        for (const supplier of supplierKeys) {
                          const d = recordQuotationForm[supplier] ?? {
                            unitPrice: "",
                            totalPrice: "",
                            currency: "",
                            deliveryDate: "",
                            deliveryTime: "",
                            notes: "",
                          };
                          const up = Number.parseFloat(d.unitPrice);
                          const tp = Number.parseFloat(d.totalPrice);
                          if (!d.currency?.trim() || !d.deliveryDate?.trim() || !d.deliveryTime?.trim() || Number.isNaN(up) || up <= 0 || Number.isNaN(tp) || tp <= 0) {
                            setRecordQuotationError("Enter unit price, total price, currency, delivery date, and delivery time for every supplier.");
                            return;
                          }
                          out.push({
                            supplier,
                            unitPrice: up,
                            totalPrice: tp,
                            currency: d.currency.trim(),
                            deliveryDate: d.deliveryDate.trim(),
                            deliveryTime: d.deliveryTime.trim(),
                            deliveryTimeline: `${d.deliveryDate.trim()} — ${d.deliveryTime.trim()}`,
                            notes: d.notes,
                          });
                        }
                        setRecordQuotationError(null);
                        updateRfq(recordQuotationsRfqId, { quotations: out, status: "Quotations Received" });
                        setRfqFlowNotice(`Quotations recorded for ${row.rfq}. Status is now Quotations Received.`);
                        setRecordQuotationsRfqId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {compareModalRfqId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,760px)] w-full max-w-5xl space-y-3 overflow-y-auto rounded-2xl border bg-card p-5 text-xs shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Supplier Comparison{" "}
                  <span className="ml-1 text-xs font-medium text-sky-700">{compareModalRfqId}</span>
                </h3>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setCompareModalRfqId(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {compareSortedQuotes.length === 0 ? (
              <p className="text-muted-foreground">Record supplier quotations first to compare offers.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Supplier quotes below are ranked by quoted total and compared against the RFQ baseline.
                </p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {compareSortedQuotes.map((q) => {
                    const isBest = compareBestSupplier && q.supplier === compareBestSupplier;
                    const baseline = compareModalRfq?.baselineTotal ?? 0;
                    const savings = Math.max(0, baseline - q.totalPrice);
                    const marginPct = baseline > 0 ? (savings / baseline) * 100 : 0;
                    const supplierType = /(global|tech|international|offshore)/i.test(q.supplier) ? "Offshore" : "Local";
                    return (
                      <div
                        key={`${compareModalRfqId}-${q.supplier}`}
                        className={cn(
                          "rounded-xl border bg-card p-3 shadow-sm",
                          isBest ? "border-emerald-300 bg-emerald-50/60" : "border-border/80",
                        )}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{q.supplier}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  supplierType === "Local"
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-amber-100 text-amber-800",
                                )}
                              >
                                {supplierType}
                              </span>
                              {isBest ? (
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  Lowest cost
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full border text-[9px]",
                              isBest ? "border-emerald-300 text-emerald-800" : "border-slate-300 text-slate-700",
                            )}
                          >
                            <span>Profit</span>
                            <span className="text-[10px] font-semibold">{savings.toLocaleString()}</span>
                          </div>
                        </div>

                        <dl className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">Unit price</dt>
                            <dd className="font-semibold text-foreground">{q.unitPrice.toLocaleString()} {q.currency}</dd>
                          </div>
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">Quoted total</dt>
                            <dd className="font-semibold text-foreground">{q.totalPrice.toLocaleString()} {q.currency}</dd>
                          </div>
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">BOQ baseline</dt>
                            <dd className="font-semibold text-foreground">{baseline.toLocaleString()} USD</dd>
                          </div>
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">Currency</dt>
                            <dd className="font-semibold text-foreground">{q.currency}</dd>
                          </div>
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">Margin %</dt>
                            <dd className="font-semibold text-emerald-800">{marginPct.toFixed(2)}%</dd>
                          </div>
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">Delivery time</dt>
                            <dd className="font-semibold text-foreground">{q.deliveryTime || "—"}</dd>
                          </div>
                          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                            <dt className="text-muted-foreground">Notes</dt>
                            <dd className="max-w-[58%] truncate text-right text-muted-foreground">{q.notes || "—"}</dd>
                          </div>
                        </dl>

                        <Button
                          size="sm"
                          className={cn(
                            "mt-3 h-8 w-full text-[11px]",
                            isBest ? "bg-emerald-700 hover:bg-emerald-800" : "",
                          )}
                          onClick={() => {
                            if (!compareModalRfqId) return;
                            updateRfq(compareModalRfqId, { awardedSupplier: q.supplier, status: "Awarded" });
                            setRfqFlowNotice(`${compareModalRfqId} awarded to ${q.supplier}.`);
                            setCompareModalRfqId(null);
                          }}
                        >
                          Award
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex justify-end border-t border-border/70 pt-3">
              <Button type="button" variant="outline" className="h-8 min-w-24" onClick={() => setCompareModalRfqId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {poCreateSeed ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,720px)] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Create Purchase Order
                {poCreateSeed.source === "pr" ? ` · from ${poCreateSeed.pr.ref}` : ` · from ${poCreateSeed.rfq.rfq}`}
              </h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setPoCreateSeed(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <PurchaseOrderForm
              key={poCreateSeed.source === "pr" ? poCreateSeed.pr.ref : poCreateSeed.rfq.rfq}
              initialData={
                poCreateSeed.source === "pr"
                  ? {
                      sourceKind: poCreateSeed.pr.sourceKind,
                      projectKey: poCreateSeed.pr.projectKey,
                      departmentKey: poCreateSeed.pr.departmentKey,
                      prRef: poCreateSeed.pr.ref,
                      rfqRef: null,
                      supplier: null,
                      orderTitle: `${poCreateSeed.pr.entityLabel} — ${poCreateSeed.pr.ref}`,
                      lineItems: poCreateSeed.pr.lineItems,
                    }
                  : {
                      sourceKind: poCreateSeed.rfq.sourceKind,
                      projectKey: poCreateSeed.rfq.projectKey,
                      departmentKey: poCreateSeed.rfq.departmentKey,
                      prRef: poCreateSeed.rfq.prRef,
                      rfqRef: poCreateSeed.rfq.rfq,
                      supplier: poCreateSeed.rfq.awardedSupplier ?? null,
                      orderTitle: `${poCreateSeed.rfq.title} — ${poCreateSeed.rfq.rfq}`,
                      lineItems: poCreateSeed.rfq.lineItems,
                    }
              }
              onClose={() => setPoCreateSeed(null)}
              onSubmit={(record) => {
                onCreatePo(record);
                setPoCreateSeed(null);
                setRfqFlowNotice(`Draft ${record.po} created from ${poCreateSeed.source === "pr" ? poCreateSeed.pr.ref : poCreateSeed.rfq.rfq}.`);
              }}
            />
          </div>
        </div>
      ) : null}

      {poEditRow ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,720px)] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Edit Purchase Order · {poEditRow.po}</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setPoEditRow(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <PurchaseOrderForm
              editingPoNumber={poEditRow.po}
              initialData={{
                sourceKind: poEditRow.sourceKind,
                projectKey: poEditRow.projectKey,
                departmentKey: poEditRow.departmentKey,
                prRef: "-",
                rfqRef: null,
                supplier: poEditRow.supplier,
                approval: poEditRow.approval,
                orderTitle: `${poEditRow.requestType} order`,
              }}
              onClose={() => setPoEditRow(null)}
              onSubmit={(record) => {
                setPoRows((prev) =>
                  prev.map((row) =>
                    row.po === poEditRow.po
                      ? {
                          ...row,
                          supplier: record.supplier,
                          requestType: record.requestType,
                          orderSource: record.orderSource,
                          sourceKind: record.sourceKind,
                          projectKey: record.projectKey,
                          departmentKey: record.departmentKey,
                          lineItems: record.lineItems,
                          totalAmount: record.totalAmount,
                          deliveryTerms: record.deliveryTerms,
                          paymentTerms: record.paymentTerms,
                        }
                      : row,
                  ),
                );
                setApprovalNotice(`${poEditRow.po} updated.`);
                setPoEditRow(null);
              }}
            />
          </div>
        </div>
      ) : null}

      {poApproveTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 text-sm shadow-lg">
            <h3 className="font-semibold">Approve Purchase Order</h3>
            <p className="text-xs text-muted-foreground">
              Approve {poApproveTarget.po}? This will set the status to <span className="font-medium text-foreground">Approved</span>.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-8" onClick={() => setPoApproveTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-8"
                onClick={() => {
                  updatePoApproval(poApproveTarget.po, "Approved");
                  setApprovalNotice(`${poApproveTarget.po} approved.`);
                  setPoApproveTarget(null);
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {poRejectTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-card p-5 text-sm shadow-lg">
            <h3 className="font-semibold">Reject Purchase Order</h3>
            <p className="text-xs text-muted-foreground">Provide a rejection reason for {poRejectTarget.po}.</p>
            <textarea
              className="min-h-[90px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={poRejectReason}
              onChange={(e) => setPoRejectReason(e.target.value)}
              placeholder="Required reason..."
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-8" onClick={() => setPoRejectTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-8 bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  if (!poRejectReason.trim()) {
                    setApprovalNotice("Error: rejection reason is required.");
                    return;
                  }
                  updatePoApproval(poRejectTarget.po, "Rejected");
                  setApprovalNotice(`${poRejectTarget.po} rejected. Reason: ${poRejectReason.trim()}`);
                  setPoRejectTarget(null);
                  setPoRejectReason("");
                }}
              >
                Submit rejection
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {poGenerateRow ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(92vh,760px)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border bg-card p-5 text-xs shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Generated Purchase Order · {poGenerateRow.po}</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setPoGenerateRow(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">PO Number</p>
                  <p className="font-semibold text-foreground">{poGenerateRow.po}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Supplier Information</p>
                  <p className="font-semibold text-foreground">{poGenerateRow.supplier}</p>
                </div>
              </div>
              <div className="overflow-hidden rounded-md border border-border/70 bg-card">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2">Line Item</th>
                      <th className="px-3 py-2">Quantity</th>
                      <th className="px-3 py-2">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(poGenerateRow.lineItems?.length ? poGenerateRow.lineItems : [{ name: poGenerateRow.requestType, quantity: "1", price: 0, deliveryDate: "" }]).map((li, idx) => (
                      <tr key={`${poGenerateRow.po}-gen-line-${idx}`} className="border-t border-border/60">
                        <td className="px-3 py-2">{li.name}</td>
                        <td className="px-3 py-2">{li.quantity}</td>
                        <td className="px-3 py-2">{li.price.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">Delivery Terms</p>
                  <p className="font-medium text-foreground">{poGenerateRow.deliveryTerms ?? DEFAULT_PO_DELIVERY_TERMS}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Payment Terms</p>
                  <p className="font-medium text-foreground">{poGenerateRow.paymentTerms ?? DEFAULT_PO_PAYMENT_TERMS}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] text-muted-foreground">Total Amount</p>
                  <p className="text-sm font-semibold text-foreground">{(poGenerateRow.totalAmount ?? 0).toLocaleString()} USD</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" className="h-8" onClick={() => setPoGenerateRow(null)}>
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8"
                onClick={() => {
                  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
                  if (!w) {
                    setApprovalNotice("Error: popup blocked. Please allow popups to preview the document.");
                    return;
                  }
                  const lines = (poGenerateRow.lineItems?.length ? poGenerateRow.lineItems : [{ name: poGenerateRow.requestType, quantity: "1", price: 0, deliveryDate: "" }])
                    .map((li) => `<tr><td style="padding:6px;border:1px solid #ddd;">${li.name}</td><td style="padding:6px;border:1px solid #ddd;">${li.quantity}</td><td style="padding:6px;border:1px solid #ddd;">${li.price.toLocaleString()}</td></tr>`)
                    .join("");
                  w.document.write(
                    `<html><head><title>${poGenerateRow.po}</title></head><body style="font-family:Arial;padding:16px;">
                      <h2>Purchase Order ${poGenerateRow.po}</h2>
                      <p><strong>Supplier:</strong> ${poGenerateRow.supplier}</p>
                      <table style="width:100%;border-collapse:collapse;"><thead><tr><th style="padding:6px;border:1px solid #ddd;text-align:left;">Line Item</th><th style="padding:6px;border:1px solid #ddd;text-align:left;">Quantity</th><th style="padding:6px;border:1px solid #ddd;text-align:left;">Price</th></tr></thead><tbody>${lines}</tbody></table>
                      <p><strong>Total:</strong> ${(poGenerateRow.totalAmount ?? 0).toLocaleString()} USD</p>
                      <p><strong>Delivery Terms:</strong> ${poGenerateRow.deliveryTerms ?? DEFAULT_PO_DELIVERY_TERMS}</p>
                      <p><strong>Payment Terms:</strong> ${poGenerateRow.paymentTerms ?? DEFAULT_PO_PAYMENT_TERMS}</p>
                    </body></html>`,
                  );
                  w.document.close();
                  w.focus();
                  w.print();
                }}
              >
                Preview / Print
              </Button>
              <Button
                type="button"
                className="h-8"
                onClick={() => {
                  const lines = (poGenerateRow.lineItems?.length ? poGenerateRow.lineItems : [{ name: poGenerateRow.requestType, quantity: "1", price: 0, deliveryDate: "" }])
                    .map((li) => `${li.name} | Qty: ${li.quantity} | Price: ${li.price.toLocaleString()}`)
                    .join("\n");
                  const content =
                    `Purchase Order ${poGenerateRow.po}\nSupplier: ${poGenerateRow.supplier}\n\nLine Items:\n${lines}\n\nTotal Amount: ${(poGenerateRow.totalAmount ?? 0).toLocaleString()} USD\nDelivery Terms: ${poGenerateRow.deliveryTerms ?? DEFAULT_PO_DELIVERY_TERMS}\nPayment Terms: ${poGenerateRow.paymentTerms ?? DEFAULT_PO_PAYMENT_TERMS}\n`;
                  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                  const href = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = href;
                  a.download = `${poGenerateRow.po}.txt`;
                  a.click();
                  URL.revokeObjectURL(href);
                }}
              >
                Download
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {prDetailRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[min(96vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card p-5 text-xs shadow-lg font-['Public_Sans']">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-semibold leading-none">{prDetailRow.ref} - Workspace</h3>
                  <StatusBadge value={prDetailRow.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="text-sm text-muted-foreground">
                    {prDetailRow.entityLabel} · {prDetailRow.typeLabel.replace(" PR", "")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="icon-sm" onClick={() => setPrDetailRow(null)} aria-label="Close modal">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-nowrap items-end justify-between gap-3 border-b border-border/70 text-sm">
              <div className="no-scrollbar flex min-h-10 min-w-0 flex-1 items-end gap-1 overflow-x-auto sm:gap-2">
                <button
                  type="button"
                  className={cn(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-0.5 transition-colors",
                    prDetailTab === "overview" ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setPrDetailTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className={cn(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-0.5 transition-colors",
                    prDetailTab === "bom" ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setPrDetailTab("bom")}
                >
                  BOM
                </button>
                <button
                  type="button"
                  className={cn(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-0.5 transition-colors",
                    prDetailTab === "timeline" ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setPrDetailTab("timeline")}
                >
                  Timeline
                </button>
                <button
                  type="button"
                  className={cn(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-0.5 transition-colors",
                    prDetailTab === "conversation" ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setPrDetailTab("conversation")}
                >
                  Conversation
                </button>
                <button
                  type="button"
                  className={cn(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-0.5 transition-colors",
                    prDetailTab === "activity" ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setPrDetailTab("activity")}
                >
                  Activity log
                </button>
              </div>
              {activeRole === "Team Lead" && prDetailRow.status === "Pending Approval" ? (
                <div
                  className="flex shrink-0 items-center gap-2 pl-3 pb-px"
                  role="region"
                  aria-label="Team Lead approval actions"
                >
                  <Button
                    type="button"
                    className="h-8 min-w-[5.5rem]"
                    onClick={() => {
                      setPrRejectReason("");
                      setPrDecisionModal({ row: prDetailRow, action: "approve" });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    className="h-8 min-w-[5.5rem] bg-red-600 text-white hover:bg-red-700"
                    onClick={() => {
                      setPrRejectReason("");
                      setPrDecisionModal({ row: prDetailRow, action: "reject" });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
            {prDetailTab === "overview" ? (
              <>
                <div className="mt-4 pt-4">
                  <div className="grid gap-y-3 gap-x-10 text-sm sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium">{prDetailRow.sourceKind === "project" ? "Project-based" : "Operational"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">PR type</p>
                      <p className="font-medium">{prDetailRow.typeLabel.replace(" PR", "")}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Project / Department</p>
                      <p className="font-medium">{prDetailRow.entityLabel}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Requester</p>
                      <p className="font-medium">{prDetailRow.requester}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Team Lead</p>
                      <p className="font-medium">Sara TeamLead</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Sourcing Engineer</p>
                      <p className="font-medium">{prDetailRow.owner}</p>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-muted-foreground">Justification</p>
                      <p className="font-medium">{prDetailRow.terms || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-border/70 pt-4">
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Attachments</p>
                  <div className="space-y-2">
                    {prDetailRow.lineItems.length > 0 ? (
                      prDetailRow.lineItems.map((i, idx) => (
                        <div key={`${prDetailRow.ref}-attachment-${idx}`} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{`${i.name || "Attachment"} - Spec Sheet`}</p>
                            <p className="text-xs text-muted-foreground">{`${i.quantity} ${i.unit} • ${i.specification || "No specification"}`}</p>
                          </div>
                          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label="Download attachment">
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground">No attachments.</p>
                    )}
                  </div>
                  {activeRole === "Team Lead" && prDetailRow.status === "Pending Approval" ? (
                    <div className="mt-1.5 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (prCommentRow?.ref === prDetailRow.ref) {
                            setPrCommentRow(null);
                            return;
                          }
                          setPrCommentRow(prDetailRow);
                          setPrCommentText("");
                        }}
                      >
                        Add comment
                      </Button>
                    </div>
                  ) : null}
                  {activeRole === "Team Lead" && prDetailRow.status === "Pending Approval" && prCommentRow?.ref === prDetailRow.ref ? (
                    <div className="mt-1 space-y-2 p-3">
                      <textarea
                        className="min-h-[88px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                        value={prCommentText}
                        onChange={(e) => setPrCommentText(e.target.value)}
                        placeholder="Add comment for requester"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setPrCommentRow(null)}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7"
                          onClick={() => {
                            setApprovalNotice(`Comment added on ${prDetailRow.ref}: ${prCommentText || "No comment text."}`);
                            setPrCommentRow(null);
                          }}
                        >
                          Save comment
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {prDetailTab === "bom" ? (
              <div className="mt-4 space-y-3">
                <div className="overflow-hidden rounded-md border border-border/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 font-medium">No</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Quantity</th>
                        <th className="px-3 py-2 font-medium">UOM</th>
                        <th className="px-3 py-2 font-medium">Required</th>
                        <th className="px-3 py-2 font-medium">Specification</th>
                        <th className="px-3 py-2 font-medium">Estimated cost</th>
                        <th className="px-3 py-2 font-medium">Line document</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prDetailRow.lineItems.map((i, idx) => (
                        <tr key={`${prDetailRow.ref}-bom-${idx}`} className="border-t border-border/60">
                          <td className="px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2">{i.name}</td>
                          <td className="px-3 py-2">{i.quantity}</td>
                          <td className="px-3 py-2">{i.unit}</td>
                          <td className="px-3 py-2">-</td>
                          <td className="px-3 py-2">{i.specification || "-"}</td>
                          <td className="px-3 py-2">-</td>
                          <td className="px-3 py-2">
                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label="Download line document">
                              <Download className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Team lead comment</p>
                  <div className="rounded-md border border-border/70 px-3 py-2 text-sm">
                    Routed to sourcing stage after approval.
                  </div>
                </div>
              </div>
            ) : null}

            {prDetailTab === "timeline" ? (
              <div className="mt-4 rounded-lg border border-border/70 p-4">
                {(() => {
                  const stages = ["Draft", "TL Approval", "Sourcing Assigned", "Pending Sourcing", "In Process"] as const;
                  const stageIndexByStatus: Record<string, number> = {
                    Draft: 0,
                    "Pending Approval": 1,
                    "Pending Sourcing Assignment": 2,
                    "Pending Sourcing": 3,
                    "In Sourcing": 4,
                    "In Sourcing Process": 4,
                    "In Procurement": 4,
                  };
                  const currentIdx = stageIndexByStatus[prDetailRow.status] ?? 0;
                  return (
                    <div className="flex flex-wrap items-start gap-2">
                      {stages.map((stage, idx) => {
                        const completed = idx < currentIdx;
                        const current = idx === currentIdx;
                        const upcoming = idx > currentIdx;
                        return (
                          <div key={`${prDetailRow.ref}-timeline-${stage}`} className="flex items-center gap-2">
                            <div className="flex items-center">
                              <span
                                className={cn(
                                  "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-medium",
                                  completed && "border-primary bg-primary text-primary-foreground",
                                  current && "border-primary text-primary ring-2 ring-primary/20",
                                  upcoming && "border-muted-foreground/30 text-muted-foreground"
                                )}
                              >
                                {completed ? "✓" : idx + 1}
                              </span>
                              {idx < stages.length - 1 ? <span className={cn("mx-2 inline-block h-px w-6", completed ? "bg-primary/60" : "bg-border")} /> : null}
                            </div>
                            <p
                              className={cn(
                                "text-xs",
                                completed && "font-medium text-foreground",
                                current && "font-semibold text-primary",
                                upcoming && "text-muted-foreground"
                              )}
                            >
                              {stage}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : null}
            {prDetailTab === "conversation" ? <div className="mt-4 rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground">Conversation content coming soon.</div> : null}
            {prDetailTab === "activity" ? (
              <div className="mt-4 rounded-lg border border-border/70 p-4">
                <div className="mb-3 flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/40">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Activity log</p>
                    <p className="text-xs text-muted-foreground">Newest first · demo timestamps are derived from the PR created time.</p>
                  </div>
                </div>
                <ul className="relative ms-1.5 border-l border-border/80 pl-5">
                  {prDetailActivityLog.map((e) => (
                    <li key={e.id} className="relative pb-5 last:pb-0">
                      <span
                        className={cn(
                          "absolute -left-[calc(0.375rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                          e.dot === "default" && "bg-primary ring-2 ring-primary/25",
                          e.dot === "success" && "bg-emerald-600 ring-2 ring-emerald-600/25",
                          e.dot === "danger" && "bg-destructive ring-2 ring-destructive/25",
                          e.dot === "muted" && "bg-muted-foreground/50 ring-2 ring-muted-foreground/15",
                        )}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-medium leading-snug text-foreground">{e.title}</p>
                        <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dateTime={e.at}>
                          {new Date(e.at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      {e.detail ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.detail}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {prDecisionModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-card p-5 text-xs shadow-lg">
            <h3 className="text-sm font-semibold">
              {prDecisionModal.action === "approve" ? "Approve Request" : "Reject Request"}
            </h3>
            {prDecisionModal.action === "reject" ? (
              <div className="space-y-1">
                <label className="font-medium">Reason (required)</label>
                <textarea
                  className="min-h-[86px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  value={prRejectReason}
                  onChange={(e) => setPrRejectReason(e.target.value)}
                  placeholder="Explain why this request is being rejected"
                />
              </div>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Are you sure you want to approve this request?</p>
                <p>
                  The PR will move to <span className="font-medium text-foreground">Pending Sourcing</span>. Ownership of the next action transfers to the{" "}
                  <span className="font-medium text-foreground">Sourcing Officer</span>.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-8 min-w-24 !bg-transparent hover:!bg-transparent" onClick={() => setPrDecisionModal(null)}>
                Cancel
              </Button>
              {prDecisionModal.action === "approve" ? (
                <Button
                  type="button"
                  className="h-8 min-w-24"
                  onClick={() => {
                    const ref = prDecisionModal.row.ref;
                    updatePrStatus(ref, "Pending Sourcing");
                    setApprovalNotice(`${ref} approved. Next action: Sourcing Officer.`);
                    setPrDecisionModal(null);
                    setPrDetailRow((r) => (r?.ref === ref ? { ...r, status: "Pending Sourcing" } : r));
                  }}
                >
                  Confirm
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-8 min-w-24"
                  disabled={!prRejectReason.trim()}
                  onClick={() => {
                    if (!prRejectReason.trim()) return;
                    const ref = prDecisionModal.row.ref;
                    updatePrStatus(ref, "Rejected");
                    setApprovalNotice(`${ref} rejected. Workflow ended. Reason: ${prRejectReason}`);
                    setPrDecisionModal(null);
                    setPrRejectReason("");
                    setPrDetailRow((r) => (r?.ref === ref ? { ...r, status: "Rejected" } : r));
                  }}
                >
                  Submit
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {submitDoc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-card p-5 text-xs shadow-lg">
            <h3 className="text-sm font-semibold">Submit {submitDoc.documentRef} for approval</h3>
            <p className="text-muted-foreground">
              {submitDoc.docType} · {submitDoc.title}. Rules are resolved from the configured workflow library (priority order).
            </p>
            <div className="space-y-1">
              <label className="font-medium">Amount (USD)</label>
              <Input
                className="h-9"
                value={submitDoc.amountStr}
                onChange={(e) => setSubmitDoc({ ...submitDoc, amountStr: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Department context</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                value={submitDoc.dept}
                onChange={(e) => setSubmitDoc({ ...submitDoc, dept: e.target.value })}
              >
                <option value="ops">Operations</option>
                <option value="it">IT Department</option>
                <option value="finance">Finance</option>
                <option value="hr">HR</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="h-8 min-w-24" onClick={() => setSubmitDoc(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-8 min-w-24"
                onClick={() => {
                  const amount = Number(String(submitDoc.amountStr).replace(/[^0-9.-]/g, ""));
                  const msg = onSubmitForApproval({
                    documentRef: submitDoc.documentRef,
                    docType: submitDoc.docType,
                    title: submitDoc.title,
                    amount: Number.isFinite(amount) ? amount : 0,
                    departmentKey: submitDoc.dept || undefined,
                    originatorRoleKey: submitDoc.docType === "PO" ? "buyer" : "requestor",
                  });
                  setApprovalNotice(
                    msg ??
                      `${submitDoc.documentRef} submitted for approval. Track it under Approvals → All workflows.`
                  );
                  setSubmitDoc(null);
                }}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourcingModule() {
  type SourcingModuleTab = "Source" | "Settings";
  type SourcingSettingsCategorySegment = "supplier" | "manufacturer";
  type SourcingSettingsCategoryRow = { id: string; name: string; description: string; updatedAt: string };
  type PartnerType = "Supplier" | "Manufacturer" | "Freight Forwarder";
  type SourcingStepId = "basic" | "address" | "contact" | "bank";
  type PartnerRecord = {
    id: string;
    name: string;
    contactPerson: string;
    email: string;
    phoneCountry: string;
    phoneNumber: string;
    address: string;
    partnerType: PartnerType;
    categoryType: string;
  };

  const departmentOptions = ["Operations", "Logistics", "MRO", "IT Department", "Finance", "HR Department"];
  const supplierCategoryOptions = ["Raw Materials", "Services", "Consumables", "Equipment"];
  const supplierTypeOptions = ["Local", "Global", "Distributor", "Strategic"];
  const supplierManufacturerOptions = ["Atlas Manufacturing", "Hansei Global Manufacturing", "OEM Partner Ltd.", "Zenith Industrial"];
  const manufacturerCategoryOptions = ["OEM", "Contract", "Industrial", "Specialized"];
  const manufacturerTypeOptions = ["Primary", "Secondary", "Backup"];
  const solutionOptions = ["Construction Materials", "IT Equipment", "Maintenance Supplies", "Logistics Services", "Training Services"];
  const timeZoneOptions = ["UTC+0", "UTC+1", "UTC+3", "UTC+4", "UTC+5:30", "UTC+8"];
  const countryCodeOptions = ["+251", "+1", "+44", "+82", "+971", "+49"];
  const countyOptions = ["Addis Ababa", "Oromia", "Amhara", "SNNP", "Tigray", "Afar"];
  const bankCountryOptions = ["Ethiopia", "United Arab Emirates", "United States", "United Kingdom", "South Korea"];
  const bankCurrencyOptions = ["ETB", "USD", "EUR", "AED", "GBP"];

  type SourcingEntityForm = {
    supplierOffshore: boolean;
    supplierName: string;
    supplierDepartment: string;
    supplierCategory: string;
    supplierType: string;
    supplierManufacturer: string;
    supplierSolutions: string;
    supplierFoundAt: string;
    supplierTimeZone: string;
    supplierWorkStart: string;
    supplierWorkEnd: string;
    supplierEta: string;
    supplierCreditFacility: string;

    manufacturerSupplier: boolean;
    manufacturerOffshore: boolean;
    manufacturerName: string;
    manufacturerDepartment: string;
    manufacturerCategory: string;
    manufacturerType: string;
    manufacturerDescription: string;
    manufacturerFoundAt: string;
    manufacturerTimeZone: string;
    manufacturerWorkStart: string;
    manufacturerWorkEnd: string;
    manufacturerEta: string;
    manufacturerCreditFacility: string;

    forwarderName: string;
    forwarderCountry: string;
    forwarderCity: string;
    forwarderWebsite: string;
    forwarderAddress: string;
    forwarderPoBox: string;

    addressCountry: string;
    addressCounty: string;
    addressCity: string;
    addressWebsite: string;
    addressEmail: string;
    addressPhoneCountry: string;
    addressPhoneNumber: string;
    addressLine: string;
    addressPoBox: string;

    contactFullName: string;
    contactEmail: string;
    contactPosition: string;
    contactPhones: string[];

    bankAccountName: string;
    bankName: string;
    bankAccountNumber: string;
    bankSwiftCode: string;
    bankIban: string;
    bankCountry: string;
    bankCurrency: string;
  };

  const createEmptyEntityForm = (): SourcingEntityForm => ({
    supplierOffshore: false,
    supplierName: "",
    supplierDepartment: "",
    supplierCategory: "",
    supplierType: "",
    supplierManufacturer: "",
    supplierSolutions: "",
    supplierFoundAt: "",
    supplierTimeZone: "",
    supplierWorkStart: "",
    supplierWorkEnd: "",
    supplierEta: "",
    supplierCreditFacility: "",

    manufacturerSupplier: false,
    manufacturerOffshore: false,
    manufacturerName: "",
    manufacturerDepartment: "",
    manufacturerCategory: "",
    manufacturerType: "",
    manufacturerDescription: "",
    manufacturerFoundAt: "",
    manufacturerTimeZone: "",
    manufacturerWorkStart: "",
    manufacturerWorkEnd: "",
    manufacturerEta: "",
    manufacturerCreditFacility: "",

    forwarderName: "",
    forwarderCountry: "",
    forwarderCity: "",
    forwarderWebsite: "",
    forwarderAddress: "",
    forwarderPoBox: "",

    addressCountry: "",
    addressCounty: "",
    addressCity: "",
    addressWebsite: "",
    addressEmail: "",
    addressPhoneCountry: "+251",
    addressPhoneNumber: "",
    addressLine: "",
    addressPoBox: "",

    contactFullName: "",
    contactEmail: "",
    contactPosition: "",
    contactPhones: [""],

    bankAccountName: "",
    bankName: "",
    bankAccountNumber: "",
    bankSwiftCode: "",
    bankIban: "",
    bankCountry: "",
    bankCurrency: "",
  });

  const getStepperSteps = (entityType: PartnerType): { id: SourcingStepId; label: string }[] => {
    const base: { id: SourcingStepId; label: string }[] = [{ id: "basic", label: "Basic Information" }];
    if (entityType !== "Freight Forwarder") base.push({ id: "address", label: "Address Details" });
    base.push({ id: "contact", label: "Contact Person" }, { id: "bank", label: "Bank Details" });
    return base;
  };

  const [records, setRecords] = useState<PartnerRecord[]>([
    {
      id: "p-1",
      name: "Swift Supplies",
      contactPerson: "Lily Tesfaye",
      email: "lily@swift.com",
      phoneCountry: "+251",
      phoneNumber: "911223344",
      address: "Bole Road, Addis Ababa",
      partnerType: "Supplier",
      categoryType: "Onshore",
    },
    {
      id: "p-2",
      name: "Hansei Global",
      contactPerson: "Min Jae Kim",
      email: "minkim@hansei.com",
      phoneCountry: "+82",
      phoneNumber: "102334455",
      address: "Seoul Logistics District",
      partnerType: "Supplier",
      categoryType: "Offshore",
    },
    {
      id: "p-3",
      name: "Atlas Manufacturing",
      contactPerson: "Amanuel Bekele",
      email: "amanuel@atlasmfg.com",
      phoneCountry: "+251",
      phoneNumber: "922556677",
      address: "Industrial Zone, Adama",
      partnerType: "Manufacturer",
      categoryType: "OEM",
    },
    {
      id: "p-4",
      name: "BlueWave Logistics",
      contactPerson: "Nadia Omar",
      email: "nadia@bluewave.com",
      phoneCountry: "+971",
      phoneNumber: "555889900",
      address: "Port Rashid, Dubai",
      partnerType: "Freight Forwarder",
      categoryType: "Air & Sea Freight",
    },
  ]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | PartnerType>("All");
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<PartnerType | null>(null);
  const [entityForm, setEntityForm] = useState<SourcingEntityForm>(createEmptyEntityForm());
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PartnerRecord | null>(null);

  const [sourcingModuleTab, setSourcingModuleTab] = useState<SourcingModuleTab>("Source");
  const [sourcingSettingsSegment, setSourcingSettingsSegment] = useState<SourcingSettingsCategorySegment>("supplier");
  const [sourcingSettingsSupplierRows, setSourcingSettingsSupplierRows] = useState<SourcingSettingsCategoryRow[]>(() =>
    supplierCategoryOptions.map((name, i) => ({
      id: `s-sc-${i + 1}`,
      name,
      description: "Used in partner onboarding and filters.",
      updatedAt: "2026-04-12",
    }))
  );
  const [sourcingSettingsMfrRows, setSourcingSettingsMfrRows] = useState<SourcingSettingsCategoryRow[]>(() =>
    manufacturerCategoryOptions.map((name, i) => ({
      id: `s-mc-${i + 1}`,
      name,
      description: "Used in partner onboarding and filters.",
      updatedAt: "2026-04-12",
    }))
  );
  const [sourcingCreateSupplierCatOpen, setSourcingCreateSupplierCatOpen] = useState(false);
  const [sourcingCreateMfrCatOpen, setSourcingCreateMfrCatOpen] = useState(false);
  const [sourcingNewCatName, setSourcingNewCatName] = useState("");
  const [sourcingNewCatDesc, setSourcingNewCatDesc] = useState("");

  const filteredRecords = records.filter((record) => {
    const matchesType = typeFilter === "All" || record.partnerType === typeFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      record.name.toLowerCase().includes(q) ||
      record.contactPerson.toLowerCase().includes(q) ||
      record.email.toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  const startCreateFlow = () => {
    setEditingId(null);
    setSelectedEntityType(null);
    setEntityForm(createEmptyEntityForm());
    setActiveStepIdx(0);
    setSelectionModalOpen(true);
  };

  const startStepperForType = (entityType: PartnerType) => {
    setSelectedEntityType(entityType);
    setActiveStepIdx(0);
    setSelectionModalOpen(false);
    setStepperModalOpen(true);
  };

  const closeStepper = () => {
    setStepperModalOpen(false);
    setSelectedEntityType(null);
    setActiveStepIdx(0);
    setEntityForm(createEmptyEntityForm());
    setEditingId(null);
  };

  const openEdit = (record: PartnerRecord) => {
    const nextType = record.partnerType;
    const nextForm = createEmptyEntityForm();
    if (nextType === "Supplier") {
      nextForm.supplierName = record.name;
      nextForm.supplierCategory = record.categoryType;
    } else if (nextType === "Manufacturer") {
      nextForm.manufacturerName = record.name;
      nextForm.manufacturerCategory = record.categoryType;
    } else {
      nextForm.forwarderName = record.name;
      nextForm.forwarderAddress = record.address;
    }
    nextForm.contactFullName = record.contactPerson;
    nextForm.contactEmail = record.email;
    nextForm.contactPhones = [record.phoneNumber];
    nextForm.addressLine = record.address;
    nextForm.addressEmail = record.email;
    nextForm.addressPhoneCountry = record.phoneCountry;
    nextForm.addressPhoneNumber = record.phoneNumber;

    setEditingId(record.id);
    setSelectedEntityType(nextType);
    setEntityForm(nextForm);
    setActiveStepIdx(0);
    setSelectionModalOpen(false);
    setStepperModalOpen(true);
  };

  const addContactPhone = () => {
    setEntityForm((prev) => ({ ...prev, contactPhones: [...prev.contactPhones, ""] }));
  };

  const updateContactPhone = (index: number, value: string) => {
    setEntityForm((prev) => ({
      ...prev,
      contactPhones: prev.contactPhones.map((p, i) => (i === index ? value : p)),
    }));
  };

  const requiredFilledForStep = (entityType: PartnerType, stepId: SourcingStepId, values: SourcingEntityForm): boolean => {
    if (stepId === "basic") {
      if (entityType === "Supplier") {
        return Boolean(
          values.supplierName.trim() &&
            values.supplierDepartment &&
            values.supplierCategory
        );
      }
      if (entityType === "Manufacturer") {
        return Boolean(
          values.manufacturerName.trim() &&
            values.manufacturerDepartment &&
            values.manufacturerCategory
        );
      }
      return Boolean(values.forwarderName.trim() && values.forwarderCountry.trim() && values.forwarderCity.trim() && values.forwarderAddress.trim());
    }

    if (stepId === "address") {
      return Boolean(
        values.addressCity.trim() &&
          values.addressEmail.trim() &&
          values.addressPhoneNumber.trim() &&
          values.addressLine.trim()
      );
    }

    if (stepId === "contact") {
      return Boolean(
        values.contactFullName.trim() &&
          values.contactEmail.trim() &&
          values.contactPosition.trim() &&
          values.contactPhones.some((p) => p.trim().length > 0)
      );
    }

    return Boolean(
      values.bankAccountName.trim() &&
        values.bankName.trim() &&
        values.bankAccountNumber.trim() &&
        values.bankCountry &&
        values.bankCurrency
    );
  };

  const savePartner = () => {
    if (!selectedEntityType) return;
    const phone = entityForm.contactPhones.find((p) => p.trim()) ?? "";
    const record: PartnerRecord = {
      id: editingId ?? "",
      name:
        selectedEntityType === "Supplier"
          ? entityForm.supplierName.trim()
          : selectedEntityType === "Manufacturer"
            ? entityForm.manufacturerName.trim()
            : entityForm.forwarderName.trim(),
      contactPerson: entityForm.contactFullName.trim(),
      email:
        selectedEntityType === "Freight Forwarder"
          ? entityForm.contactEmail.trim()
          : entityForm.addressEmail.trim() || entityForm.contactEmail.trim(),
      phoneCountry: selectedEntityType === "Freight Forwarder" ? "+251" : entityForm.addressPhoneCountry || "+251",
      phoneNumber: phone,
      address:
        selectedEntityType === "Freight Forwarder"
          ? entityForm.forwarderAddress.trim()
          : entityForm.addressLine.trim(),
      partnerType: selectedEntityType,
      categoryType:
        selectedEntityType === "Supplier"
          ? entityForm.supplierCategory.trim()
          : selectedEntityType === "Manufacturer"
            ? entityForm.manufacturerCategory.trim()
            : "Freight Forwarder",
    };

    if (editingId) {
      setRecords((prev) => prev.map((r) => (r.id === editingId ? { ...record, id: editingId } : r)));
    } else {
      setRecords((prev) => [...prev, { ...record, id: `p-${prev.length + 1}` }]);
    }
    closeStepper();
  };

  const deletePartner = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-6">
        {(["Source", "Settings"] as const).map((item) => (
          <Button
            key={item}
            type="button"
            variant="ghost"
            onClick={() => setSourcingModuleTab(item)}
            className={cn(
              "h-9 rounded-none border-0 bg-transparent px-0 text-sm font-normal shadow-none hover:bg-transparent",
              sourcingModuleTab === item
                ? "text-primary hover:text-primary"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <span
              className={cn(
                "inline-block border-b border-transparent pb-1",
                sourcingModuleTab === item && "border-primary font-bold text-primary"
              )}
            >
              {item}
            </span>
          </Button>
        ))}
      </div>

      {sourcingModuleTab === "Source" && (
        <>
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-64"
                placeholder="Search by name, contact person, email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="h-9 w-44 rounded-md border border-input bg-background px-3 text-xs"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as "All" | PartnerType)}
              >
                <option value="All">All</option>
                <option value="Supplier">Supplier</option>
                <option value="Manufacturer">Manufacturer</option>
                <option value="Freight Forwarder">Freight Forwarder</option>
              </select>
            </div>
            <Button size="sm" className="h-8 min-w-24" onClick={startCreateFlow}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          <div className="overflow-hidden rounded-md">
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Contact Person</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Phone Number</th>
                  <th className="px-3 py-3 font-medium">Address</th>
                  <th className="px-3 py-3 font-medium">Partner Type</th>
                  <th className="px-3 py-3 font-medium">Category / Type</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-t border-border/60">
                    <td className="px-3 py-2">{record.name}</td>
                    <td className="px-3 py-2">{record.contactPerson}</td>
                    <td className="px-3 py-2">{record.email}</td>
                    <td className="px-3 py-2">{record.phoneCountry} {record.phoneNumber}</td>
                    <td className="px-3 py-2">{record.address}</td>
                    <td className="px-3 py-2">{record.partnerType}</td>
                    <td className="px-3 py-2">{record.categoryType}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <TableEditIconButton onClick={() => openEdit(record)} aria-label="Edit partner" />
                        <TableDeleteIconButton onClick={() => setDeleteTarget(record)} aria-label="Delete partner" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">What do you want to create?</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setSelectionModalOpen(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-col gap-2 text-xs [&_label]:rounded-md [&_label]:px-2 [&_label]:py-1.5 [&_label]:transition-colors [&_label]:hover:bg-muted/35 [&_input[type=radio]]:size-3.5">
              {(["Supplier", "Manufacturer", "Freight Forwarder"] as const).map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    className="accent-primary"
                    name="entity-type"
                    checked={selectedEntityType === opt}
                    onChange={() => setSelectedEntityType(opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2 [&_[data-slot=button]]:transition-[background-color,border-color,box-shadow] [&_[data-slot=button]]:duration-150 [&_[data-slot=button]]:focus-visible:!ring-2 [&_[data-slot=button]]:focus-visible:!ring-ring/25 [&_[data-slot=button]]:active:!translate-y-0 [&_[data-slot=button][data-variant=outline]]:!hover:bg-muted/45 [&_[data-slot=button][data-variant=default]]:!hover:bg-primary/88">
              <Button className="h-8 min-w-24" variant="outline" onClick={() => setSelectionModalOpen(false)}>
                Cancel
              </Button>
              <Button
                className="h-8 min-w-24"
                disabled={!selectedEntityType}
                onClick={() => {
                  if (!selectedEntityType) return;
                  startStepperForType(selectedEntityType);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {stepperModalOpen && selectedEntityType ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{editingId ? "Edit Entity" : `Create ${selectedEntityType}`}</h3>
              <Button variant="ghost" size="icon-sm" onClick={closeStepper} aria-label="Close modal">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mx-auto mb-5 flex w-full max-w-[44rem] flex-wrap items-center justify-center gap-2 text-xs">
              {getStepperSteps(selectedEntityType).map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2",
                    idx === activeStepIdx
                      ? "bg-primary/10 text-primary"
                      : idx < activeStepIdx
                        ? "text-primary"
                        : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      idx === activeStepIdx
                        ? "bg-primary text-primary-foreground"
                        : idx < activeStepIdx
                          ? "bg-transparent text-primary ring-1 ring-primary/30"
                          : "bg-slate-200 text-slate-600"
                    )}
                  >
                    {idx + 1}
                  </span>
                  {step.label}
                </div>
              ))}
            </div>

            <div
              className={cn(
                "no-scrollbar mx-auto max-h-[min(70vh,560px)] w-full max-w-[44rem] space-y-5 overflow-y-auto px-1 text-xs",
                "[&_input]:sm:max-w-[20rem] [&_select]:w-full [&_select]:sm:max-w-[20rem] [&_.field-full]:sm:max-w-none",
                "[&_input[data-slot=input]]:!h-8 [&_input[data-slot=input]]:!min-h-8 [&_input[data-slot=input]]:!px-2 [&_input[data-slot=input]]:!py-1 [&_input[data-slot=input]]:!text-xs [&_input[data-slot=input]]:shadow-none [&_input[data-slot=input]]:transition-[border-color,box-shadow] [&_input[data-slot=input]]:duration-150 [&_input[data-slot=input]]:focus-visible:!ring-2 [&_input[data-slot=input]]:focus-visible:!ring-ring/25 [&_input[data-slot=input]]:focus-visible:!border-ring/60",
                "[&_select]:!h-8 [&_select]:!min-h-8 [&_select]:!text-xs [&_select]:!px-2 [&_select]:shadow-none [&_select]:transition-[border-color,box-shadow] [&_select]:duration-150 [&_select]:focus-visible:!ring-2 [&_select]:focus-visible:!ring-ring/25 [&_select]:focus-visible:!border-ring/60",
                "[&_[data-slot=button]]:transition-[background-color,border-color,box-shadow] [&_[data-slot=button]]:duration-150 [&_[data-slot=button]]:focus-visible:!ring-2 [&_[data-slot=button]]:focus-visible:!ring-ring/25 [&_[data-slot=button]]:active:!translate-y-0 [&_[data-slot=button][data-variant=outline]]:!hover:bg-muted/45 [&_[data-slot=button][data-variant=default]]:!hover:bg-primary/88",
                "[&_button.rounded-md.bg-slate-100]:!transition-colors [&_button.rounded-md.bg-slate-100]:!duration-150 [&_button.rounded-md.bg-slate-100]:hover:!bg-slate-200/45 [&_button.rounded-md.bg-slate-100]:active:!translate-y-0 [&_button.rounded-md.bg-slate-100]:focus-visible:!outline-none [&_button.rounded-md.bg-slate-100]:focus-visible:!ring-2 [&_button.rounded-md.bg-slate-100]:focus-visible:!ring-ring/20"
              )}
            >
              {(() => {
                const steps = getStepperSteps(selectedEntityType);
                const stepId = steps[activeStepIdx]?.id;
                if (stepId === "basic" && selectedEntityType === "Supplier") {
                  return (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className={cn(
                          "sm:col-span-2 rounded-md bg-slate-100 p-3 text-left transition-colors",
                          entityForm.supplierOffshore ? "ring-2 ring-primary/35 bg-primary/10" : "hover:bg-slate-200/70"
                        )}
                        onClick={() => setEntityForm((p) => ({ ...p, supplierOffshore: !p.supplierOffshore }))}
                        aria-pressed={entityForm.supplierOffshore}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={entityForm.supplierOffshore}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierOffshore: e.target.checked }))}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <p className="text-xs font-medium text-foreground">Offshore supplier</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Enable this if the supplier operates internationally or outside your primary country.
                            </p>
                          </div>
                        </div>
                      </button>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Supplier Name *</label>
                        <Input className="h-9" placeholder="Supplier Name" value={entityForm.supplierName} onChange={(e) => setEntityForm((p) => ({ ...p, supplierName: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Department *</label>
                        <div className="relative">
                          <select
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs"
                            value={entityForm.supplierDepartment}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierDepartment: e.target.value }))}
                          >
                            <option value="">Select department</option>
                            {departmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Supplier Category *</label>
                        <div className="relative">
                          <select
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs"
                            value={entityForm.supplierCategory}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierCategory: e.target.value }))}
                          >
                            <option value="">Select category</option>
                            {supplierCategoryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Type of Supplier *</label>
                        <div className="relative">
                          <select
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs"
                            value={entityForm.supplierType}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierType: e.target.value }))}
                          >
                            <option value="">Select type</option>
                            {supplierTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Manufacturer</label>
                        <div className="relative">
                          <select
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs"
                            value={entityForm.supplierManufacturer}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierManufacturer: e.target.value }))}
                          >
                            <option value="">Select manufacturer</option>
                            {supplierManufacturerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Solutions</label>
                        <div className="relative">
                          <select
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs"
                            value={entityForm.supplierSolutions}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierSolutions: e.target.value }))}
                          >
                            <option value="">Select solution</option>
                            {solutionOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Found At</label>
                        <Input className="h-9" type="date" value={entityForm.supplierFoundAt} onChange={(e) => setEntityForm((p) => ({ ...p, supplierFoundAt: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Time Zone</label>
                        <div className="relative">
                          <select
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs"
                            value={entityForm.supplierTimeZone}
                            onChange={(e) => setEntityForm((p) => ({ ...p, supplierTimeZone: e.target.value }))}
                          >
                            <option value="">Select time zone</option>
                            {timeZoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Work start at</label>
                        <Input className="h-9" type="time" placeholder="Work start at" value={entityForm.supplierWorkStart} onChange={(e) => setEntityForm((p) => ({ ...p, supplierWorkStart: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Work end at</label>
                        <Input className="h-9" type="time" placeholder="Work end at" value={entityForm.supplierWorkEnd} onChange={(e) => setEntityForm((p) => ({ ...p, supplierWorkEnd: e.target.value }))} />
                      </div>
                    </div>
                  );
                }
                if (stepId === "basic" && selectedEntityType === "Manufacturer") {
                  return (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className={cn(
                          "rounded-md bg-slate-100 p-3 text-left transition-colors",
                          entityForm.manufacturerSupplier ? "ring-2 ring-primary/35 bg-primary/10" : "hover:bg-slate-200/70"
                        )}
                        onClick={() => setEntityForm((p) => ({ ...p, manufacturerSupplier: !p.manufacturerSupplier }))}
                        aria-pressed={entityForm.manufacturerSupplier}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={entityForm.manufacturerSupplier}
                            onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerSupplier: e.target.checked }))}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <p className="text-xs font-medium text-foreground">Supplier manufacturer</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Enable this when the manufacturer can also act as a direct supplier.
                            </p>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded-md bg-slate-100 p-3 text-left transition-colors",
                          entityForm.manufacturerOffshore ? "ring-2 ring-primary/35 bg-primary/10" : "hover:bg-slate-200/70"
                        )}
                        onClick={() => setEntityForm((p) => ({ ...p, manufacturerOffshore: !p.manufacturerOffshore }))}
                        aria-pressed={entityForm.manufacturerOffshore}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={entityForm.manufacturerOffshore}
                            onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerOffshore: e.target.checked }))}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <p className="text-xs font-medium text-foreground">Offshore manufacturer</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Enable this if the manufacturer operates internationally or outside your primary country.
                            </p>
                          </div>
                        </div>
                      </button>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Manufacturer Name *</label>
                        <Input className="h-9" placeholder="Manufacturer Name" value={entityForm.manufacturerName} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerName: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Department *</label>
                        <div className="relative w-full sm:max-w-[20rem]">
                          <select className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs" value={entityForm.manufacturerDepartment} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerDepartment: e.target.value }))}>
                            <option value="">Select department</option>
                            {departmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Manufacturer Category *</label>
                        <div className="relative w-full overflow-hidden rounded-md sm:max-w-[20rem]">
                          <select className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-xs" value={entityForm.manufacturerCategory} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerCategory: e.target.value }))}>
                            <option value="">Select category</option>
                            {manufacturerCategoryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Type of Manufacturer</label>
                        <div className="relative w-full sm:max-w-[20rem]">
                          <select className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs" value={entityForm.manufacturerType} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerType: e.target.value }))}>
                            <option value="">Select type</option>
                            {manufacturerTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-medium text-foreground">Description</label>
                        <Input className="h-9 field-full" placeholder="Description" value={entityForm.manufacturerDescription} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerDescription: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Found At</label>
                        <Input className="h-9" type="date" value={entityForm.manufacturerFoundAt} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerFoundAt: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Time Zone</label>
                        <div className="relative w-full sm:max-w-[20rem]">
                          <select className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-xs" value={entityForm.manufacturerTimeZone} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerTimeZone: e.target.value }))}>
                            <option value="">Select time zone</option>
                            {timeZoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Work start at</label>
                        <Input className="h-9" type="time" placeholder="Work start at" value={entityForm.manufacturerWorkStart} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerWorkStart: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Work end at</label>
                        <Input className="h-9" type="time" placeholder="Work end at" value={entityForm.manufacturerWorkEnd} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerWorkEnd: e.target.value }))} />
                      </div>
                    </div>
                  );
                }
                if (stepId === "basic" && selectedEntityType === "Freight Forwarder") {
                  return (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="ff-forwarder-name" className="text-xs font-medium text-foreground">Name</label>
                        <Input id="ff-forwarder-name" className="h-9" placeholder="Name" value={entityForm.forwarderName} onChange={(e) => setEntityForm((p) => ({ ...p, forwarderName: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="ff-forwarder-country" className="text-xs font-medium text-foreground">Country</label>
                        <Input id="ff-forwarder-country" className="h-9" placeholder="Country" value={entityForm.forwarderCountry} onChange={(e) => setEntityForm((p) => ({ ...p, forwarderCountry: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="ff-forwarder-city" className="text-xs font-medium text-foreground">City</label>
                        <Input id="ff-forwarder-city" className="h-9" placeholder="City" value={entityForm.forwarderCity} onChange={(e) => setEntityForm((p) => ({ ...p, forwarderCity: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="ff-forwarder-website" className="text-xs font-medium text-foreground">Website (optional)</label>
                        <Input id="ff-forwarder-website" className="h-9" placeholder="Website" value={entityForm.forwarderWebsite} onChange={(e) => setEntityForm((p) => ({ ...p, forwarderWebsite: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="ff-forwarder-address" className="block text-xs font-medium text-foreground">Address</label>
                        <Input id="ff-forwarder-address" className="h-9" placeholder="Address" value={entityForm.forwarderAddress} onChange={(e) => setEntityForm((p) => ({ ...p, forwarderAddress: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="ff-forwarder-po-box" className="block text-xs font-medium text-foreground">P.O. Box</label>
                        <Input id="ff-forwarder-po-box" className="h-9" placeholder="P.O. Box" value={entityForm.forwarderPoBox} onChange={(e) => setEntityForm((p) => ({ ...p, forwarderPoBox: e.target.value }))} />
                      </div>
                    </div>
                  );
                }
                if (stepId === "address") {
                  return (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                        Required fields: City, Email, Phone number, Address. County and Website are optional.
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="address-county" className="text-xs font-medium text-foreground">County (optional)</label>
                        <select id="address-county" className="h-9 rounded-md border border-input bg-transparent px-3 text-xs" value={entityForm.addressCounty} onChange={(e) => setEntityForm((p) => ({ ...p, addressCounty: e.target.value }))}>
                          <option value="">County</option>
                          {countyOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="address-city" className="text-xs font-medium text-foreground">City</label>
                        <Input id="address-city" className="h-9" placeholder="City" value={entityForm.addressCity} onChange={(e) => setEntityForm((p) => ({ ...p, addressCity: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="address-website" className="text-xs font-medium text-foreground">Website</label>
                        <Input id="address-website" className="h-9" placeholder="Website" value={entityForm.addressWebsite} onChange={(e) => setEntityForm((p) => ({ ...p, addressWebsite: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="address-email" className="text-xs font-medium text-foreground">Email</label>
                        <Input id="address-email" className="h-9" type="email" placeholder="Email" value={entityForm.addressEmail} onChange={(e) => setEntityForm((p) => ({ ...p, addressEmail: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Phone Number</label>
                        <div className="flex min-w-0">
                          <select className="h-9 !w-[72px] min-w-[72px] max-w-[72px] shrink-0 rounded-r-none border border-input border-r-0 bg-background px-2 text-xs" value={entityForm.addressPhoneCountry} onChange={(e) => setEntityForm((p) => ({ ...p, addressPhoneCountry: e.target.value }))}>
                            {countryCodeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <Input className="h-9 min-w-0 flex-1 rounded-l-none" placeholder="Phone Number" value={entityForm.addressPhoneNumber} onChange={(e) => setEntityForm((p) => ({ ...p, addressPhoneNumber: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="address-line" className="block text-xs font-medium text-foreground">Address</label>
                        <Input id="address-line" className="h-9" placeholder="Address" value={entityForm.addressLine} onChange={(e) => setEntityForm((p) => ({ ...p, addressLine: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="address-po-box" className="block text-xs font-medium text-foreground">P.O. Box</label>
                        <Input id="address-po-box" className="h-9" placeholder="P.O. Box" value={entityForm.addressPoBox} onChange={(e) => setEntityForm((p) => ({ ...p, addressPoBox: e.target.value }))} />
                      </div>
                    </div>
                  );
                }
                if (stepId === "contact") {
                  const phone0Id = `contact-phone-${selectedEntityType}-0`;
                  const phone0 = entityForm.contactPhones[0] ?? "";
                  const extraPhones = entityForm.contactPhones.slice(1);
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor="contact-full-name" className="text-xs font-medium text-foreground">Full Name</label>
                        <Input id="contact-full-name" className="h-9" placeholder="Full Name" value={entityForm.contactFullName} onChange={(e) => setEntityForm((p) => ({ ...p, contactFullName: e.target.value }))} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor="contact-email" className="text-xs font-medium text-foreground">Email</label>
                        <Input id="contact-email" className="h-9" type="email" placeholder="Email" value={entityForm.contactEmail} onChange={(e) => setEntityForm((p) => ({ ...p, contactEmail: e.target.value }))} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor="contact-position" className="text-xs font-medium text-foreground">Position</label>
                        <Input id="contact-position" className="h-9" placeholder="Position" value={entityForm.contactPosition} onChange={(e) => setEntityForm((p) => ({ ...p, contactPosition: e.target.value }))} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex w-full min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:gap-0">
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            <label htmlFor={phone0Id} className="text-xs font-medium text-foreground">
                              Phone 1
                            </label>
                            <Input
                              id={phone0Id}
                              className="field-full h-9 min-w-0 w-full"
                              placeholder="Phone 1"
                              value={phone0}
                              onChange={(e) => updateContactPhone(0, e.target.value)}
                            />
                          </div>
                          <Button type="button" variant="outline" size="sm" className="h-8 min-w-24 shrink-0 sm:ml-0.5" onClick={addContactPhone}>
                            Add
                          </Button>
                        </div>
                      </div>
                      {extraPhones.map((phone, idx) => {
                        const realIdx = idx + 1;
                        const phoneId = `contact-phone-${selectedEntityType}-${realIdx}`;
                        return (
                          <div key={`${selectedEntityType}-phone-${realIdx}`} className="col-span-2 flex flex-col gap-1">
                            <label htmlFor={phoneId} className="text-xs font-medium text-foreground">
                              Phone {realIdx + 1}
                            </label>
                            <Input
                              id={phoneId}
                              className="h-9"
                              placeholder={`Phone ${realIdx + 1}`}
                              value={phone}
                              onChange={(e) => updateContactPhone(realIdx, e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="bank-account-name" className="text-xs font-medium text-foreground">Account Name</label>
                      <Input id="bank-account-name" className="h-9" placeholder="Account Name" value={entityForm.bankAccountName} onChange={(e) => setEntityForm((p) => ({ ...p, bankAccountName: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bank-name" className="text-xs font-medium text-foreground">Bank Name</label>
                      <Input id="bank-name" className="h-9" placeholder="Bank Name" value={entityForm.bankName} onChange={(e) => setEntityForm((p) => ({ ...p, bankName: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bank-account-number" className="text-xs font-medium text-foreground">Account Number</label>
                      <Input id="bank-account-number" className="h-9" placeholder="Account Number" value={entityForm.bankAccountNumber} onChange={(e) => setEntityForm((p) => ({ ...p, bankAccountNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bank-swift-code" className="text-xs font-medium text-foreground">SWIFT Code</label>
                      <Input id="bank-swift-code" className="h-9" placeholder="SWIFT Code" value={entityForm.bankSwiftCode} onChange={(e) => setEntityForm((p) => ({ ...p, bankSwiftCode: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bank-iban" className="text-xs font-medium text-foreground">IBAN</label>
                      <Input id="bank-iban" className="h-9" placeholder="IBAN" value={entityForm.bankIban} onChange={(e) => setEntityForm((p) => ({ ...p, bankIban: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bank-country" className="text-xs font-medium text-foreground">Bank Country</label>
                      <select id="bank-country" className="h-9 rounded-md border border-input bg-transparent px-3 text-xs" value={entityForm.bankCountry} onChange={(e) => setEntityForm((p) => ({ ...p, bankCountry: e.target.value }))}>
                        <option value="">Bank Country</option>
                        {bankCountryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label htmlFor="bank-currency" className="block text-xs font-medium text-foreground">Bank Currency</label>
                      <select id="bank-currency" className="h-9 rounded-md border border-input bg-transparent px-3 text-xs" value={entityForm.bankCurrency} onChange={(e) => setEntityForm((p) => ({ ...p, bankCurrency: e.target.value }))}>
                        <option value="">Bank Currency</option>
                        {bankCurrencyOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mx-auto mt-4 flex w-full max-w-[44rem] justify-end gap-2 [&_[data-slot=button]]:transition-[background-color,border-color,box-shadow] [&_[data-slot=button]]:duration-150 [&_[data-slot=button]]:focus-visible:!ring-2 [&_[data-slot=button]]:focus-visible:!ring-ring/25 [&_[data-slot=button]]:active:!translate-y-0 [&_[data-slot=button][data-variant=outline]]:!hover:bg-muted/45 [&_[data-slot=button][data-variant=default]]:!hover:bg-primary/88">
              <Button
                className="h-8 min-w-24"
                variant="outline"
                onClick={() => {
                  if (activeStepIdx === 0) closeStepper();
                  else setActiveStepIdx((idx) => Math.max(0, idx - 1));
                }}
              >
                {activeStepIdx === 0 ? "Cancel" : "Back"}
              </Button>
              {(() => {
                const steps = getStepperSteps(selectedEntityType);
                const step = steps[activeStepIdx];
                const canProceed = requiredFilledForStep(selectedEntityType, step.id, entityForm);
                const last = activeStepIdx === steps.length - 1;
                if (last) {
                  return (
                    <Button className="h-8 min-w-24" disabled={!canProceed} onClick={savePartner}>
                      Submit
                    </Button>
                  );
                }
                return (
                  <Button
                    className="h-8 min-w-24"
                    disabled={!canProceed}
                    onClick={() => setActiveStepIdx((idx) => Math.min(idx + 1, steps.length - 1))}
                  >
                    Next
                  </Button>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-partner-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-partner-title" className="text-sm font-semibold text-foreground">
              Delete partner?
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              This will remove{" "}
              <span className="font-medium text-foreground">{deleteTarget.name}</span> from the list. This action cannot be
              undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="h-8" type="button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="h-8"
                type="button"
                onClick={() => {
                  deletePartner(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}

      {sourcingModuleTab === "Settings" && (
        <div className="space-y-4">
          <div
            className="inline-flex rounded-lg bg-muted/50 p-0.5 text-xs"
            role="tablist"
            aria-label="Sourcing settings sections"
          >
              <button
                type="button"
                role="tab"
                aria-selected={sourcingSettingsSegment === "supplier"}
                onClick={() => setSourcingSettingsSegment("supplier")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  sourcingSettingsSegment === "supplier"
                    ? "bg-background text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Supplier Categories
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourcingSettingsSegment === "manufacturer"}
                onClick={() => setSourcingSettingsSegment("manufacturer")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  sourcingSettingsSegment === "manufacturer"
                    ? "bg-background text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Manufacturer Categories
              </button>
          </div>

          {sourcingSettingsSegment === "supplier" && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Supplier category taxonomy for the Source list and onboarding.</p>
                  <Button
                    size="sm"
                    className="h-8 min-w-24"
                    onClick={() => {
                      setSourcingNewCatName("");
                      setSourcingNewCatDesc("");
                      setSourcingCreateSupplierCatOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create
                  </Button>
                </div>
                <div className="overflow-hidden rounded-md">
                  <table className="w-full border-separate border-spacing-y-0 text-left text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Name</th>
                        <th className="px-3 py-2.5 font-medium">Description</th>
                        <th className="px-3 py-2.5 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourcingSettingsSupplierRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={3}>
                            No supplier categories yet. Create one to get started.
                          </td>
                        </tr>
                      ) : (
                        sourcingSettingsSupplierRows.map((row) => (
                          <tr key={row.id} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.description || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.updatedAt}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {sourcingSettingsSegment === "manufacturer" && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Manufacturer groupings for RFQ and partner routing.</p>
                  <Button
                    size="sm"
                    className="h-8 min-w-24"
                    onClick={() => {
                      setSourcingNewCatName("");
                      setSourcingNewCatDesc("");
                      setSourcingCreateMfrCatOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create
                  </Button>
                </div>
                <div className="overflow-hidden rounded-md">
                  <table className="w-full border-separate border-spacing-y-0 text-left text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Name</th>
                        <th className="px-3 py-2.5 font-medium">Description</th>
                        <th className="px-3 py-2.5 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourcingSettingsMfrRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={3}>
                            No manufacturer categories yet. Create one to get started.
                          </td>
                        </tr>
                      ) : (
                        sourcingSettingsMfrRows.map((row) => (
                          <tr key={row.id} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.description || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.updatedAt}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {sourcingCreateSupplierCatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sourcing-sup-cat-title">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => setSourcingCreateSupplierCatOpen(false)}
              />
              <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
                <h3 id="sourcing-sup-cat-title" className="text-sm font-semibold">
                  New supplier category
                </h3>
                <div className="mt-3 space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="sourcing-sup-cat-name">
                      Name
                    </label>
                    <Input
                      id="sourcing-sup-cat-name"
                      className="h-9"
                      value={sourcingNewCatName}
                      onChange={(e) => setSourcingNewCatName(e.target.value)}
                      placeholder="e.g. Strategic"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="sourcing-sup-cat-desc">
                      Description
                    </label>
                    <Input
                      id="sourcing-sup-cat-desc"
                      className="h-9"
                      value={sourcingNewCatDesc}
                      onChange={(e) => setSourcingNewCatDesc(e.target.value)}
                      placeholder="Short note"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSourcingCreateSupplierCatOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const name = sourcingNewCatName.trim();
                      if (!name) return;
                      setSourcingSettingsSupplierRows((prev) => [
                        {
                          id: `s-sc-${prev.length + 1}`,
                          name,
                          description: sourcingNewCatDesc.trim(),
                          updatedAt: new Date().toISOString().slice(0, 10),
                        },
                        ...prev,
                      ]);
                      setSourcingCreateSupplierCatOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {sourcingCreateMfrCatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sourcing-mfr-cat-title">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => setSourcingCreateMfrCatOpen(false)}
              />
              <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
                <h3 id="sourcing-mfr-cat-title" className="text-sm font-semibold">
                  New manufacturer category
                </h3>
                <div className="mt-3 space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="sourcing-mfr-cat-name">
                      Name
                    </label>
                    <Input
                      id="sourcing-mfr-cat-name"
                      className="h-9"
                      value={sourcingNewCatName}
                      onChange={(e) => setSourcingNewCatName(e.target.value)}
                      placeholder="e.g. Contract"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground" htmlFor="sourcing-mfr-cat-desc">
                      Description
                    </label>
                    <Input
                      id="sourcing-mfr-cat-desc"
                      className="h-9"
                      value={sourcingNewCatDesc}
                      onChange={(e) => setSourcingNewCatDesc(e.target.value)}
                      placeholder="Short note"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSourcingCreateMfrCatOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const name = sourcingNewCatName.trim();
                      if (!name) return;
                      setSourcingSettingsMfrRows((prev) => [
                        {
                          id: `s-mc-${prev.length + 1}`,
                          name,
                          description: sourcingNewCatDesc.trim(),
                          updatedAt: new Date().toISOString().slice(0, 10),
                        },
                        ...prev,
                      ]);
                      setSourcingCreateMfrCatOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ProjectFormValues = {
  projectName: string;
  client: string;
  businessUnit: string;
  sector: string;
  role: string;
  memberName: string;
  contractValue: string;
  currency: string;
  numberOfMilestones: string;
  contractSignDate: string;
  plannedEndDate: string;
  projectStartDate: string;
  projectEndDate: string;
  lcOpeningDate: string;
  advancePaymentDate: string;
  officeProject: boolean;
  newOpportunity: boolean;
};

type ProjectRecord = ProjectFormValues & {
  id: string;
  createdAt: string;
};

const createEmptyProjectForm = (): ProjectFormValues => ({
  projectName: "",
  client: "",
  businessUnit: "",
  sector: "",
  role: "",
  memberName: "",
  contractValue: "",
  currency: "",
  numberOfMilestones: "",
  contractSignDate: "",
  plannedEndDate: "",
  projectStartDate: "",
  projectEndDate: "",
  lcOpeningDate: "",
  advancePaymentDate: "",
  officeProject: false,
  newOpportunity: false,
});

function ProjectModule() {
  type ProjectModalMode = "create" | "view" | "edit";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ProjectModalMode>("create");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectFormValues>(createEmptyProjectForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [boqNotice, setBoqNotice] = useState<string | null>(null);
  const [boqByProject, setBoqByProject] = useState<Record<string, Array<Record<string, string | number>>>>({});
  const boqUploadInputRef = useRef<HTMLInputElement | null>(null);
  const readOnly = modalMode === "view";

  const resetForm = useCallback(() => {
    setForm(createEmptyProjectForm());
    setFormError(null);
  }, []);

  const closeCreateModal = useCallback(() => {
    setIsCreateOpen(false);
    setModalMode("create");
    setActiveProjectId(null);
    resetForm();
    setBoqNotice(null);
  }, [resetForm]);

  const openCreateModal = useCallback(() => {
    setModalMode("create");
    setActiveProjectId(null);
    setForm(createEmptyProjectForm());
    setFormError(null);
    setIsCreateOpen(true);
  }, []);

  const openViewModal = useCallback((project: ProjectRecord) => {
    setModalMode("view");
    setActiveProjectId(project.id);
    setForm({
      projectName: project.projectName,
      client: project.client,
      businessUnit: project.businessUnit,
      sector: project.sector,
      role: project.role,
      memberName: project.memberName,
      contractValue: project.contractValue,
      currency: project.currency,
      numberOfMilestones: project.numberOfMilestones,
      contractSignDate: project.contractSignDate,
      plannedEndDate: project.plannedEndDate,
      projectStartDate: project.projectStartDate,
      projectEndDate: project.projectEndDate,
      lcOpeningDate: project.lcOpeningDate,
      advancePaymentDate: project.advancePaymentDate,
      officeProject: project.officeProject,
      newOpportunity: project.newOpportunity,
    });
    setFormError(null);
    setIsCreateOpen(true);
  }, []);

  const openEditModal = useCallback((project: ProjectRecord) => {
    setModalMode("edit");
    setActiveProjectId(project.id);
    setForm({
      projectName: project.projectName,
      client: project.client,
      businessUnit: project.businessUnit,
      sector: project.sector,
      role: project.role,
      memberName: project.memberName,
      contractValue: project.contractValue,
      currency: project.currency,
      numberOfMilestones: project.numberOfMilestones,
      contractSignDate: project.contractSignDate,
      plannedEndDate: project.plannedEndDate,
      projectStartDate: project.projectStartDate,
      projectEndDate: project.projectEndDate,
      lcOpeningDate: project.lcOpeningDate,
      advancePaymentDate: project.advancePaymentDate,
      officeProject: project.officeProject,
      newOpportunity: project.newOpportunity,
    });
    setFormError(null);
    setIsCreateOpen(true);
  }, []);

  const onDeleteProject = useCallback((project: ProjectRecord) => {
    if (!window.confirm(`Delete project "${project.projectName}"?`)) return;
    setProjects((prev) => prev.filter((row) => row.id !== project.id));
    setBoqByProject((prev) => {
      const next = { ...prev };
      delete next[project.id];
      return next;
    });
  }, []);

  const onDownloadBoqTemplate = useCallback(() => {
    const header = [
      "No.",
      "Item Part Number",
      "Item Description",
      "UOM",
      "Qty",
      "GPT. Unit Cost",
      "GPT. Total Cost",
      "Discount",
      "Discounted Unit Cost",
      "Discounted Total Cost",
      "Freight Insurance",
      "Bank Charges",
      "Import Tax",
      "Margin",
      "Unit Price",
      "Total Price",
    ];
    const rows = [
      [
        1,
        "J9254B#2A",
        "HPE ProLiant DL380 Gen11 8SFF CTO Configure-to-order Server",
        "set",
        1,
        11434.3,
        11434.3,
        "0%",
        11434.3,
        11434.3,
        "10%",
        "0%",
        "0%",
        "55%",
        17738.742,
        17738.742,
      ],
      [
        2,
        "R0R42A",
        "HPE 25Gb SFP28 SR 100m Transceiver",
        "set",
        24,
        260.9,
        6261.6,
        "0%",
        260.9,
        6261.6,
        "10%",
        "0%",
        "0%",
        "55%",
        398.7625,
        9570.3,
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    const safeProjectName = (form.projectName || "project").replace(/[^\w-]+/g, "_");
    XLSX.writeFile(wb, `${safeProjectName}_boq_template.xlsx`);
  }, [form.projectName]);

  const onAddBoq = useCallback(() => {
    boqUploadInputRef.current?.click();
  }, []);

  const onBoqUploadFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeProjectId) return;
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setBoqNotice("The selected Excel file has no sheets.");
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: "" });
        setBoqByProject((prev) => ({ ...prev, [activeProjectId]: rows }));
        setBoqNotice(`BoQ uploaded successfully (${rows.length} row${rows.length === 1 ? "" : "s"}).`);
      } catch {
        setBoqNotice("Could not read the selected Excel file. Please use a valid .xlsx/.xls file.");
      } finally {
        e.target.value = "";
      }
    },
    [activeProjectId],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (readOnly) {
        closeCreateModal();
        return;
      }
      if (!form.projectName.trim()) return setFormError("Project Name is required.");
      if (!form.client) return setFormError("Client is required.");
      if (!form.businessUnit) return setFormError("Business Unit is required.");
      if (!form.sector) return setFormError("Sector is required.");
      if (!form.role) return setFormError("Team role is required.");
      if (!form.memberName) return setFormError("Member Name is required.");
      if (!form.currency) return setFormError("Currency is required.");
      if (!form.numberOfMilestones) return setFormError("Number of Milestones is required.");
      if (!form.contractSignDate) return setFormError("Contract Sign Date is required.");
      if (!form.plannedEndDate) return setFormError("Planned End Date is required.");
      if (!form.projectStartDate) return setFormError("Project Start Date is required.");
      if (!form.projectEndDate) return setFormError("Project End Date is required.");
      if (!form.lcOpeningDate) return setFormError("LC Opening Date is required.");
      if (!form.advancePaymentDate) return setFormError("Advance Payment Date is required.");

      const parsedValue = Number(form.contractValue);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return setFormError("Contract Value must be a number greater than 0.");
      }
      if (new Date(form.projectEndDate) < new Date(form.projectStartDate)) {
        return setFormError("Project End Date cannot be earlier than Project Start Date.");
      }
      if (new Date(form.plannedEndDate) < new Date(form.contractSignDate)) {
        return setFormError("Planned End Date cannot be earlier than Contract Sign Date.");
      }

      if (modalMode === "edit" && activeProjectId) {
        setProjects((prev) =>
          prev.map((row) =>
            row.id === activeProjectId
              ? {
                  ...row,
                  ...form,
                  contractValue: String(parsedValue),
                }
              : row,
          ),
        );
      } else {
        setProjects((prev) => [
          {
            ...form,
            contractValue: String(parsedValue),
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      closeCreateModal();
    },
    [activeProjectId, closeCreateModal, form, modalMode, readOnly],
  );

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Project Management</CardTitle>
            <p className="text-xs text-muted-foreground">Track project setup, team assignment, and milestone readiness.</p>
          </div>
          <CardAction>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="mr-1 h-4 w-4" />
              Add Project
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Project Name</th>
                  <th className="px-3 py-2 text-left font-medium">Client</th>
                  <th className="px-3 py-2 text-left font-medium">Business Unit</th>
                  <th className="px-3 py-2 text-left font-medium">Contract Value</th>
                  <th className="px-3 py-2 text-left font-medium">Start - End</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      No projects added yet. Use Add Project to create the first entry.
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => (
                    <tr key={project.id} className="border-t">
                      <td className="px-3 py-2">{project.projectName}</td>
                      <td className="px-3 py-2">{project.client}</td>
                      <td className="px-3 py-2">{project.businessUnit}</td>
                      <td className="px-3 py-2">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: project.currency, maximumFractionDigits: 0 }).format(
                          Number(project.contractValue),
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {project.projectStartDate} to {project.projectEndDate}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openViewModal(project)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <TableEditIconButton onClick={() => openEditModal(project)} />
                          <TableDeleteIconButton onClick={() => onDeleteProject(project)} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {modalMode === "view" ? "View Project" : modalMode === "edit" ? "Edit Project" : "Add Project"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {modalMode === "view"
                    ? "Review project details."
                    : modalMode === "edit"
                      ? "Update project details and save changes."
                      : "Fill in the fields below to create a project profile."}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeCreateModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {readOnly ? (
              <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-5 py-3">
                <div className="text-xs text-muted-foreground">
                  Quick Actions
                  {activeProjectId && boqByProject[activeProjectId]
                    ? ` • ${boqByProject[activeProjectId].length} BoQ row(s) linked`
                    : " • no BoQ uploaded yet"}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={boqUploadInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={onBoqUploadFile}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={onAddBoq}>
                    Add BoQ
                  </Button>
                  <Button type="button" size="sm" onClick={onDownloadBoqTemplate}>
                    BOQ Template
                  </Button>
                </div>
              </div>
            ) : null}
            <form className="space-y-4 p-5" onSubmit={onSubmit}>
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">General Information</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Project Name</label>
                    <Input
                      value={form.projectName}
                      onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))}
                      className="h-9 text-xs"
                      placeholder="Enter project name"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Client</label>
                    <select
                      value={form.client}
                      onChange={(e) => setForm((prev) => ({ ...prev, client: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select client</option>
                      <option>EthioTel Infrastructure</option>
                      <option>Sunrise Trading PLC</option>
                      <option>Atlas Development Group</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Business Unit</label>
                    <select
                      value={form.businessUnit}
                      onChange={(e) => setForm((prev) => ({ ...prev, businessUnit: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select business unit</option>
                      <option>Construction</option>
                      <option>Logistics</option>
                      <option>Operations</option>
                      <option>Technology</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Sector</label>
                    <select
                      value={form.sector}
                      onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select sector</option>
                      <option>Infrastructure</option>
                      <option>Industrial</option>
                      <option>Commercial</option>
                      <option>Public Services</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team Assignment</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Role</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select role</option>
                      <option>Project Manager</option>
                      <option>Site Engineer</option>
                      <option>Quantity Surveyor</option>
                      <option>Finance Officer</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Member Name</label>
                    <select
                      value={form.memberName}
                      onChange={(e) => setForm((prev) => ({ ...prev, memberName: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select team member</option>
                      <option>Alex Johnson</option>
                      <option>Daniel Garcia</option>
                      <option>Michael Lee</option>
                      <option>Anna Brown</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial Details</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Contract Value</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.contractValue}
                      onChange={(e) => setForm((prev) => ({ ...prev, contractValue: e.target.value }))}
                      className="h-9 text-xs"
                      placeholder="0.00"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Currency</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select currency</option>
                      <option value="USD">USD</option>
                      <option value="ETB">ETB</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline & Milestones</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Number of Milestones</label>
                    <select
                      value={form.numberOfMilestones}
                      onChange={(e) => setForm((prev) => ({ ...prev, numberOfMilestones: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      disabled={readOnly}
                    >
                      <option value="">Select count</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Contract Sign Date</label>
                    <Input
                      type="date"
                      value={form.contractSignDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, contractSignDate: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Planned End Date</label>
                    <Input
                      type="date"
                      value={form.plannedEndDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, plannedEndDate: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Project Start Date</label>
                    <Input
                      type="date"
                      value={form.projectStartDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, projectStartDate: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Project End Date</label>
                    <Input
                      type="date"
                      value={form.projectEndDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, projectEndDate: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial Milestones</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">LC Opening Date</label>
                    <Input
                      type="date"
                      value={form.lcOpeningDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, lcOpeningDate: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Advance Payment Date</label>
                    <Input
                      type="date"
                      value={form.advancePaymentDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, advancePaymentDate: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags / Options</p>
                <div className="flex flex-wrap items-center gap-6 rounded-md border bg-muted/20 px-3 py-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.officeProject}
                      onChange={(e) => setForm((prev) => ({ ...prev, officeProject: e.target.checked }))}
                      disabled={readOnly}
                    />
                    Office Project
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.newOpportunity}
                      onChange={(e) => setForm((prev) => ({ ...prev, newOpportunity: e.target.checked }))}
                      disabled={readOnly}
                    />
                    New Opportunity
                  </label>
                </div>
              </section>

              {formError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p> : null}
              {boqNotice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{boqNotice}</p> : null}

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="outline" size="sm" onClick={closeCreateModal}>
                  {readOnly ? "Close" : "Cancel"}
                </Button>
                {!readOnly ? <Button type="submit" size="sm">{modalMode === "edit" ? "Update Project" : "Save Project"}</Button> : null}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

type BudgetEntityType = "Project" | "Department";

type BudgetEntity = {
  id: string;
  name: string;
  type: BudgetEntityType;
  linkedEntity: string;
  total: number;
  used: number;
  status: "Active" | "Closed";
};

type BudgetTab = "Overview" | "Budgets";

function formatBudgetCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function budgetRemainingAmount(e: BudgetEntity) {
  return Math.max(0, e.total - e.used);
}

function budgetUsagePercent(e: BudgetEntity) {
  if (e.total <= 0) return 0;
  return Math.min(100, (e.used / e.total) * 100);
}

function usageBarTone(pct: number) {
  if (pct < 70) return "bg-emerald-500";
  if (pct <= 90) return "bg-amber-500";
  return "bg-red-500";
}

function usagePercentTextClass(pct: number) {
  if (pct < 70) return "text-emerald-600";
  if (pct <= 90) return "text-amber-600";
  return "text-destructive";
}

const BUDGET_PROJECT_OPTIONS = [
  { value: "proj-a", label: "Construction Project A" },
  { value: "proj-b", label: "Road Expansion Project" },
  { value: "proj-c", label: "Warehouse Setup" },
];

const BUDGET_DEPT_OPTIONS = [
  { value: "ops", label: "Operations" },
  { value: "log", label: "Logistics" },
  { value: "mro", label: "MRO" },
  { value: "it", label: "IT Department" },
  { value: "finance", label: "Finance" },
];

function linkedValueFromBudgetEntity(entity: BudgetEntity | null): string {
  if (!entity) return "";
  const p = BUDGET_PROJECT_OPTIONS.find((o) => o.label === entity.linkedEntity);
  const d = BUDGET_DEPT_OPTIONS.find((o) => o.label === entity.linkedEntity);
  return p?.value ?? d?.value ?? "";
}

function BudgetAllocationModalBody({
  initial,
  readOnly,
  onClose,
  onSave,
}: {
  initial: BudgetEntity | null;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (row: BudgetEntity) => void;
}) {
  const [budgetType, setBudgetType] = useState<BudgetEntityType>(() => initial?.type ?? "Department");
  const [name, setName] = useState(() => initial?.name ?? "");
  const [linkedVal, setLinkedVal] = useState(() => linkedValueFromBudgetEntity(initial));
  const [totalStr, setTotalStr] = useState(() => (initial ? String(initial.total) : ""));
  const [usedStr, setUsedStr] = useState(() => (initial ? String(initial.used) : "0"));
  const [status, setStatus] = useState<"Active" | "Closed">(() => initial?.status ?? "Active");

  const selectClassB = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";

  const submit = () => {
    if (readOnly) {
      onClose();
      return;
    }
    const total = Number(String(totalStr).replace(/[^0-9.-]/g, "")) || 0;
    const used = Number(String(usedStr).replace(/[^0-9.-]/g, "")) || 0;
    if (!name.trim() || !linkedVal || total <= 0) return;
    const linkLabel =
      budgetType === "Project"
        ? BUDGET_PROJECT_OPTIONS.find((o) => o.value === linkedVal)?.label ?? linkedVal
        : BUDGET_DEPT_OPTIONS.find((o) => o.value === linkedVal)?.label ?? linkedVal;
    const row: BudgetEntity = {
      id:
        initial?.id ??
        (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bud-${String(Date.now())}`),
      name: name.trim(),
      type: budgetType,
      linkedEntity: linkLabel,
      total,
      used: Math.min(Math.max(0, used), total),
      status,
    };
    onSave(row);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="no-scrollbar max-h-[min(90vh,560px)] w-full max-w-md overflow-y-auto rounded-lg border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{readOnly ? "Budget details" : initial ? "Edit budget" : "Create budget"}</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-5 text-xs">
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium">Budget name</label>
            <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-medium text-foreground">Budget type</legend>
            <div className="flex flex-wrap gap-4">
              {(["Project", "Department"] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="budget-entity-type"
                    className="accent-primary"
                    checked={budgetType === t}
                    disabled={readOnly}
                    onChange={() => {
                      setBudgetType(t);
                      setLinkedVal("");
                    }}
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {budgetType === "Project" ? (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium">Linked project</label>
              <select className={selectClassB} value={linkedVal} onChange={(e) => setLinkedVal(e.target.value)} disabled={readOnly}>
                <option value="">Select project</option>
                {BUDGET_PROJECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium">Linked department</label>
              <select className={selectClassB} value={linkedVal} onChange={(e) => setLinkedVal(e.target.value)} disabled={readOnly}>
                <option value="">Select department</option>
                {BUDGET_DEPT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium">Total budget (USD)</label>
              <Input className="h-9" type="number" min={0} value={totalStr} onChange={(e) => setTotalStr(e.target.value)} disabled={readOnly} />
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium">Used amount (USD)</label>
              <Input className="h-9" type="number" min={0} value={usedStr} onChange={(e) => setUsedStr(e.target.value)} disabled={readOnly} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium">Status</label>
            <select className={selectClassB} value={status} onChange={(e) => setStatus(e.target.value as "Active" | "Closed")} disabled={readOnly}>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          {totalStr && usedStr && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-muted-foreground">
              Remaining balance:{" "}
              <span className="font-medium text-foreground">
                {formatBudgetCurrency(
                  Math.max(0, (Number(String(totalStr).replace(/[^0-9.-]/g, "")) || 0) - (Number(String(usedStr).replace(/[^0-9.-]/g, "")) || 0))
                )}
              </span>
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2 pt-4">
          <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly ? (
            <Button className="h-8 min-w-24" onClick={submit}>
              Save
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BudgetAllocationModal({
  open,
  onClose,
  initial,
  readOnly,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: BudgetEntity | null;
  readOnly?: boolean;
  onSave: (row: BudgetEntity) => void;
}) {
  if (!open) return null;
  const formKey = `${readOnly ? "ro" : "rw"}-${initial?.id ?? "new"}`;
  return (
    <BudgetAllocationModalBody key={formKey} initial={initial} readOnly={readOnly} onClose={onClose} onSave={onSave} />
  );
}

function BudgetModule() {
  const [tab, setTab] = useState<BudgetTab>("Overview");
  const budgetTabs: BudgetTab[] = ["Overview", "Budgets"];
  const [rows, setRows] = useState<BudgetEntity[]>(() => [
    { id: "b1", name: "Raw Materials", type: "Department", linkedEntity: "Operations", total: 1_800_000, used: 1_210_000, status: "Active" },
    { id: "b2", name: "Logistics", type: "Department", linkedEntity: "Logistics", total: 600_000, used: 552_000, status: "Active" },
    { id: "b3", name: "MRO", type: "Department", linkedEntity: "MRO", total: 320_000, used: 146_000, status: "Active" },
    { id: "b4", name: "Capital Project Alpha", type: "Project", linkedEntity: "Construction Project A", total: 2_500_000, used: 720_000, status: "Active" },
    { id: "b5", name: "IT Annual Spend", type: "Department", linkedEntity: "IT Department", total: 450_000, used: 90_000, status: "Closed" },
  ]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<BudgetEntity | null>(null);
  const [modalReadOnly, setModalReadOnly] = useState(false);
  const [budgetTableSearch, setBudgetTableSearch] = useState("");

  const activeRows = useMemo(() => rows.filter((r) => r.status === "Active"), [rows]);

  const overviewKpis = useMemo(() => {
    const allocated = activeRows.reduce((s, r) => s + r.total, 0);
    const used = activeRows.reduce((s, r) => s + r.used, 0);
    return {
      allocated,
      used,
      remaining: Math.max(0, allocated - used),
      activeCount: activeRows.length,
    };
  }, [activeRows]);

  const topBudgets = useMemo(() => {
    return [...activeRows].sort((a, b) => budgetUsagePercent(b) - budgetUsagePercent(a)).slice(0, 5);
  }, [activeRows]);

  const filteredBudgetRows = useMemo(() => {
    const q = budgetTableSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => {
      const rem = budgetRemainingAmount(b);
      const pct = budgetUsagePercent(b);
      const blob = [
        b.name,
        b.type,
        b.linkedEntity,
        b.status,
        formatBudgetCurrency(b.total),
        formatBudgetCurrency(b.used),
        formatBudgetCurrency(rem),
        String(Math.round(pct)),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, budgetTableSearch]);

  const budgetTabBtn = (item: BudgetTab) => (
    <Button
      key={item}
      variant="ghost"
      onClick={() => setTab(item)}
      className={cn(
        "h-9 rounded-none border-0 bg-transparent px-0 text-sm font-normal shadow-none hover:bg-transparent",
        tab === item ? "text-primary hover:text-primary" : "text-slate-500 hover:text-slate-700"
      )}
    >
      <span
        className={cn(
          "inline-block border-b border-transparent pb-1 font-normal",
          tab === item && "border-primary font-bold text-primary"
        )}
      >
        {item}
      </span>
    </Button>
  );

  const openCreate = () => {
    setModalInitial(null);
    setModalReadOnly(false);
    setModalOpen(true);
  };

  const openEdit = (row: BudgetEntity) => {
    setModalInitial(row);
    setModalReadOnly(false);
    setModalOpen(true);
  };

  const openView = (row: BudgetEntity) => {
    setModalInitial(row);
    setModalReadOnly(true);
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const saveBudget = (row: BudgetEntity) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx >= 0) return prev.map((r, i) => (i === idx ? row : r));
      return [...prev, row];
    });
  };

  const closeBudgetRow = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "Closed" as const } : r)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-6">{budgetTabs.map(budgetTabBtn)}</div>

      {tab === "Overview" && (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Total Budget Allocated",
                value: formatBudgetCurrency(overviewKpis.allocated),
                icon: Wallet,
              },
              {
                label: "Total Used Amount",
                value: formatBudgetCurrency(overviewKpis.used),
                icon: PieChart,
              },
              {
                label: "Total Remaining Balance",
                value: formatBudgetCurrency(overviewKpis.remaining),
                icon: Activity,
              },
              {
                label: "Active Budgets",
                value: String(overviewKpis.activeCount),
                icon: Building2,
              },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className={KPI_STAT_CARD_CN}>
                <CardContent className={KPI_STAT_CONTENT_CN}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={KPI_STAT_VALUE_CN}>{value}</p>
                    <Icon className={cn(KPI_STAT_ICON_CN)} aria-hidden />
                  </div>
                  <p className={KPI_STAT_LABEL_CN}>{label}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">Top budgets by usage</p>
            <div className="space-y-4 text-xs">
              {topBudgets.map((b) => {
                const pct = budgetUsagePercent(b);
                return (
                  <div key={b.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{b.name}</p>
                        <p className="text-muted-foreground">
                          {formatBudgetCurrency(b.used)} of {formatBudgetCurrency(b.total)} · {pct.toFixed(0)}%
                        </p>
                      </div>
                      <span className="text-muted-foreground">{b.type}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full transition-all", usageBarTone(pct))} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-sm font-medium">PR budget validation</p>
            <div className="space-y-4 text-xs">
              <p className="rounded-md bg-emerald-50 p-2 text-emerald-800">
                PR-2459 validated: amount is within the linked project budget balance.
              </p>
              <p className="rounded-md bg-amber-50 p-2 text-amber-800">PR-2470 warning: department budget is above 90% utilization.</p>
            </div>
          </div>
        </div>
      )}

      {tab === "Budgets" && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full min-w-0 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <Input
                className="h-9 w-full pl-9 text-xs"
                placeholder="Search budgets by name, type, entity, status, or amounts"
                value={budgetTableSearch}
                onChange={(e) => setBudgetTableSearch(e.target.value)}
                aria-label="Search budgets"
              />
            </div>
            <Button type="button" size="sm" className="h-8 min-w-24 shrink-0 gap-1 self-end sm:self-auto" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Create budget
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Budget name</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Linked entity</th>
                  <th className="pb-2 pr-3 font-medium">Total budget</th>
                  <th className="pb-2 pr-3 font-medium">Used</th>
                  <th className="pb-2 pr-3 font-medium">Remaining</th>
                  <th className="pb-2 pr-3 font-medium">Usage</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBudgetRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-muted-foreground">
                      No budgets match your search.
                    </td>
                  </tr>
                ) : null}
                {filteredBudgetRows.map((b) => {
                  const rem = budgetRemainingAmount(b);
                  const pct = budgetUsagePercent(b);
                  return (
                    <tr key={b.id} className="border-b border-border/60">
                      <td className="py-3 pr-3 font-medium">{b.name}</td>
                      <td className="py-3 pr-3">{b.type}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{b.linkedEntity}</td>
                      <td className="py-3 pr-3 tabular-nums">{formatBudgetCurrency(b.total)}</td>
                      <td className="py-3 pr-3 tabular-nums">{formatBudgetCurrency(b.used)}</td>
                      <td className="py-3 pr-3 tabular-nums">{formatBudgetCurrency(rem)}</td>
                      <td className="py-3 pr-3">
                        <span className={cn("text-xs font-medium tabular-nums", usagePercentTextClass(pct))}>
                          {pct.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge value={b.status} />
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <TableEditIconButton onClick={() => openEdit(b)} aria-label="Edit budget" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="More budget actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => openView(b)}>View</DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={b.status === "Closed"}
                                onClick={() => closeBudgetRow(b.id)}
                              >
                                Close
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BudgetAllocationModal
        open={modalOpen}
        onClose={closeModal}
        initial={modalInitial}
        readOnly={modalReadOnly}
        onSave={saveBudget}
      />
    </div>
  );
}

export default function Home() {
  const [activeModule, setActiveModule] = useState<MainModule>("Dashboard");
  const [activeDrawer, setActiveDrawer] = useState<DrawerKey | null>(null);
  const [createdPrs, setCreatedPrs] = useState<CreatedPrRecord[]>([]);
  const [createdRfqs, setCreatedRfqs] = useState<CreatedRfqRecord[]>([]);
  const [createdPos, setCreatedPos] = useState<CreatedPoRecord[]>([]);
  const [createdMasterDataRows, setCreatedMasterDataRows] = useState<ItemMasterRow[]>([]);
  const [workflowRules, setWorkflowRules] = useState(DEFAULT_WORKFLOW_RULES);
  const [workflowInstances, setWorkflowInstances] = useState(() => buildInitialDemoInstances(DEFAULT_WORKFLOW_RULES));

  const submitDocumentForApproval = useCallback((payload: SubmitApprovalDocumentInput): string | null => {
    const res = createWorkflowInstance(
      newWorkflowId(),
      payload.documentRef,
      payload.docType,
      payload.title,
      {
        amount: payload.amount,
        departmentKey: payload.departmentKey,
        originatorRoleKey: payload.originatorRoleKey,
      },
      workflowRules
    );
    if (!res.ok) return res.reason;
    setWorkflowInstances((prev) => [...prev, res.instance]);
    if (res.conflict) {
      return `Warning: multiple rules tied at this priority (${res.tiedRuleIds?.join(", ") ?? ""}); first match was applied.`;
    }
    return null;
  }, [workflowRules]);

  const saveWorkflowRuleFromDrawer = useCallback((rule: WorkflowRule) => {
    setWorkflowRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id);
      if (idx >= 0) return prev.map((r, i) => (i === idx ? rule : r));
      return [...prev, rule];
    });
  }, []);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r bg-card md:flex md:flex-col">
        <div className="border-b px-5 py-4">
          <p className="text-base font-semibold">SupplyOS</p>
          <p className="text-xs text-muted-foreground">SCM System</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Button
                key={module.label}
                variant={activeModule === module.label ? "default" : "ghost"}
                className="h-9 w-full justify-start gap-2"
                onClick={() => setActiveModule(module.label)}
              >
                <Icon className="h-4 w-4" />
                {module.label}
              </Button>
            );
          })}
        </nav>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
          <div className="flex h-[4.5rem] items-center gap-3 px-4 md:px-6">
            <h1 className="w-36 text-sm font-semibold">{activeModule}</h1>
            <div className="relative hidden max-w-xl flex-1 md:block">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <Input placeholder="Search suppliers, PR, PO, RFQ, stock..." className="h-9 pl-9" />
            </div>
            <Button variant="ghost" size="icon" className="relative ml-auto">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 gap-2 px-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-slate-900 text-[10px] text-white">AJ</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-xs md:inline">Alex Johnson</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="space-y-4 p-4 md:p-6">
          {activeModule === "Dashboard" && <DashboardModule />}
          {activeModule === "Procurement" && (
            <ProcurementModule
              onOpenDrawer={setActiveDrawer}
              onSubmitForApproval={submitDocumentForApproval}
              onCreatePo={(record) => setCreatedPos((prev) => [record, ...prev])}
              createdPrs={createdPrs}
              createdRfqs={createdRfqs}
              setCreatedRfqs={setCreatedRfqs}
              createdPos={createdPos}
              createdMasterDataRows={createdMasterDataRows}
            />
          )}
          {activeModule === "Project" && <ProjectModule />}
          {activeModule === "Sourcing" && <SourcingModule />}
          {activeModule === "Inventory" && <InventoryModule />}
          {activeModule === "Budget" && <BudgetModule />}
          {activeModule === "Approvals" && (
            <ApprovalsWorkflowModule
              rules={workflowRules}
              setRules={setWorkflowRules}
              instances={workflowInstances}
              setInstances={setWorkflowInstances}
            />
          )}
          {activeModule === "Reporting" && <ReportingModule />}
        </main>
      </div>
      <CreateDrawer
        drawerKey={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        workflowRules={workflowRules}
        onSaveWorkflowRule={saveWorkflowRuleFromDrawer}
        onCreatePr={(record) => setCreatedPrs((prev) => [record, ...prev])}
        onCreateRfq={(record) => setCreatedRfqs((prev) => [record, ...prev])}
        onCreatePo={(record) => setCreatedPos((prev) => [record, ...prev])}
        onCreateMasterData={(rows) => setCreatedMasterDataRows((prev) => [...rows, ...prev])}
      />
    </div>
  );
}
