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
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Package,
  PieChart,
  Search,
  ShoppingCart,
  Users,
  Plus,
  Wallet,
  X,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MainModule =
  | "Dashboard"
  | "Procurement"
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

const modules: { label: MainModule; icon: React.ElementType }[] = [
  { label: "Dashboard", icon: LayoutGrid },
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
  category: string;
  unitOfMeasure: string;
  sourcingType: string;
  approvedSupplier: string;
};

function createEmptyItemRow(): ItemMasterRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    itemName: "",
    category: "",
    unitOfMeasure: "",
    sourcingType: "",
    approvedSupplier: "",
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
  requiredDate: string;
  estimatedCost: string;
};

function createEmptyBomRow(): PrBomRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    itemName: "",
    quantity: "",
    unitOfMeasure: "",
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

function PurchaseRequisitionForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (record: CreatedPrRecord) => void }) {
  const [kind, setKind] = useState<PrRequisitionKind>("project");
  const [linkedProject, setLinkedProject] = useState("");
  const [department, setDepartment] = useState("");
  const [justification, setJustification] = useState("");
  const [billType, setBillType] = useState<"Bill of Material" | "Bill of Quantity">("Bill of Material");
  const [bomMethod, setBomMethod] = useState<BomInputMethod>("manual");
  const [bomRows, setBomRows] = useState<PrBomRow[]>(() => [createEmptyBomRow()]);

  const showProjectFields = kind === "project";

  const linkedBudget = useMemo(() => {
    if (kind === "project" && linkedProject && PR_BUDGET_BY_PROJECT[linkedProject]) {
      return PR_BUDGET_BY_PROJECT[linkedProject];
    }
    if (kind === "operational" && department && PR_BUDGET_BY_DEPARTMENT[department]) {
      return PR_BUDGET_BY_DEPARTMENT[department];
    }
    return null;
  }, [kind, linkedProject, department]);

  const bomEstimatedTotal = useMemo(() => {
    return bomRows.reduce((sum, r) => {
      const n = parseFloat(String(r.estimatedCost).replace(/[^0-9.-]/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [bomRows]);

  const remainingBalance = linkedBudget != null ? Math.max(0, linkedBudget.total - linkedBudget.used) : null;
  const budgetExceeded = linkedBudget != null && remainingBalance != null && bomEstimatedTotal > remainingBalance;

  const updateBomRow = useCallback((id: string, patch: Partial<Omit<PrBomRow, "id">>) => {
    setBomRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addBomRow = useCallback(() => {
    setBomRows((prev) => [...prev, createEmptyBomRow()]);
  }, []);

  const removeBomRow = useCallback((id: string) => {
    setBomRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const setRequestSourceKind = useCallback((next: PrRequisitionKind) => {
    setKind(next);
    if (next === "project") {
      setDepartment("");
    } else {
      setLinkedProject("");
    }
  }, []);

  const submitPr = useCallback(() => {
    const hasEntity = kind === "project" ? Boolean(linkedProject) : Boolean(department);
    if (!hasEntity || !justification.trim() || bomRows.length < 1 || budgetExceeded) return;
    const createdAt = new Date().toISOString();
    const idx = Math.floor(Math.random() * 900 + 100);
    const ref = `PR-${idx}${String(Date.now()).slice(-2)}`;
    const baseline = bomRows.reduce((sum, r) => sum + (Number.parseFloat(r.estimatedCost || "0") || 0), 0);
    const record: CreatedPrRecord = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      ref,
      typeLabel: kind === "project" ? "Project PR" : "Support PR",
      entityLabel:
        kind === "project"
          ? (linkedProject === "proj-a" ? "Construction Project A" : linkedProject === "proj-b" ? "Road Expansion Project" : "Warehouse Setup")
          : (department === "ops" ? "Operations" : department === "it" ? "IT Department" : department === "hr" ? "HR Department" : "Department"),
      requester: "Alex Johnson",
      owner: "Sarah Smith",
      status: "Pending Sourcing Assignment",
      sla: "48h",
      sourceKind: kind === "project" ? "project" : "department",
      projectKey: kind === "project" ? linkedProject : null,
      departmentKey: kind === "project" ? null : department,
      createdAt,
      lineItems: bomRows.map((r) => ({
        name: r.itemName || "Item",
        quantity: r.quantity || "1",
        unit: r.unitOfMeasure || "pcs",
        specification: billType,
      })),
      baselineTotal: baseline,
      terms: justification.trim(),
    };
    onSubmit(record);
    onClose();
  }, [kind, linkedProject, department, justification, bomRows, budgetExceeded, billType, onSubmit, onClose]);

  return (
    <>
      <div className="no-scrollbar max-h-[min(70vh,520px)] space-y-6 overflow-y-auto pr-1">
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium">Request Source</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={kind}
            onChange={(e) => setRequestSourceKind(e.target.value as PrRequisitionKind)}
          >
            <option value="project">Project</option>
            <option value="operational">Operation</option>
          </select>
        </div>

        {showProjectFields ? (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium">Project</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              value={linkedProject}
              onChange={(e) => setLinkedProject(e.target.value)}
            >
              <option value="">Select project</option>
              <option value="proj-a">Construction Project A</option>
              <option value="proj-b">Road Expansion Project</option>
              <option value="proj-c">Warehouse Setup</option>
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium">Department</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Select department</option>
              <option value="ops">Operations</option>
              <option value="log">Logistics</option>
              <option value="mro">MRO</option>
              <option value="it">IT Department</option>
              <option value="finance">Finance</option>
              <option value="hr">HR Department</option>
            </select>
          </div>
        )}

        {linkedBudget && remainingBalance != null && (
          <div
            className={cn(
              "flex flex-col gap-3 rounded-md border p-3 text-xs",
              budgetExceeded ? "border-red-200 bg-red-50" : "border-border bg-muted/60"
            )}
          >
            <p className="text-xs font-semibold">Budget summary</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Total budget</p>
                <p className="font-medium tabular-nums">{formatPrCurrency(linkedBudget.total)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Used amount</p>
                <p className="font-medium tabular-nums">{formatPrCurrency(linkedBudget.used)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Remaining balance</p>
                <p className={cn("font-medium tabular-nums", budgetExceeded && "text-destructive")}>
                  {formatPrCurrency(remainingBalance)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-muted-foreground">This requisition (estimated)</span>
              <span className="font-medium tabular-nums">{formatPrCurrency(bomEstimatedTotal)}</span>
            </div>
            {budgetExceeded ? <p className="text-xs font-medium text-destructive">Budget exceeded</p> : null}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium">Justification</label>
          <textarea
            className="min-h-[88px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            placeholder={
              kind === "operational"
                ? "Explain the purpose of the request"
                : "Explain why the requisition is needed"
            }
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium">Document Type</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={billType}
            onChange={(e) => setBillType(e.target.value as "Bill of Material" | "Bill of Quantity")}
          >
            <option value="Bill of Material">Bill of Material</option>
            <option value="Bill of Quantity">Bill of Quantity</option>
          </select>
        </div>

        <div className="space-y-3 rounded-md border border-border p-3">
          <h4 className="text-xs font-semibold">{billType}</h4>
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">{billType} input method</legend>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-background/80">
                <input
                  type="radio"
                  name="bom-method"
                  className="mt-0.5 accent-primary"
                  checked={bomMethod === "upload"}
                  onChange={() => setBomMethod("upload")}
                />
                <span>{`Upload ${billType} file`}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-background/80">
                <input
                  type="radio"
                  name="bom-method"
                  className="mt-0.5 accent-primary"
                  checked={bomMethod === "manual"}
                  onChange={() => setBomMethod("manual")}
                />
                <span>{`Enter ${billType} manually`}</span>
              </label>
            </div>
          </fieldset>
          {bomMethod === "upload" ? (
            <div className="space-y-1">
              <label className="text-xs font-medium">File</label>
              <Input className="h-9 cursor-pointer text-xs file:mr-2 file:text-xs" type="file" />
            </div>
          ) : (
            <div className="space-y-3">
              {bomRows.map((row) => (
                <div
                  key={row.id}
                  className="relative flex flex-col gap-3 rounded-md border border-border bg-background p-3"
                >
                  {bomRows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-2 right-2"
                      onClick={() => removeBomRow(row.id)}
                      aria-label="Remove item"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Item or Service Name</label>
                      <Input
                        className="h-9 text-xs"
                        placeholder="Requested item or service"
                        value={row.itemName}
                        onChange={(e) => updateBomRow(row.id, { itemName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Quantity</label>
                      <Input
                        className="h-9 text-xs"
                        placeholder="Units required"
                        value={row.quantity}
                        onChange={(e) => updateBomRow(row.id, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Unit of Measure</label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                        value={row.unitOfMeasure}
                        onChange={(e) => updateBomRow(row.id, { unitOfMeasure: e.target.value })}
                      >
                        <option value="">Select UoM</option>
                        <option value="pcs">pcs</option>
                        <option value="kg">kg</option>
                        <option value="l">L</option>
                        <option value="svc">service</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Required Date</label>
                      <Input
                        className="h-9 text-xs"
                        type="date"
                        value={row.requiredDate}
                        onChange={(e) => updateBomRow(row.id, { requiredDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Estimated cost (optional)</label>
                      <Input
                        className="h-9 text-xs"
                        placeholder="Approximate cost"
                        value={row.estimatedCost}
                        onChange={(e) => updateBomRow(row.id, { estimatedCost: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Line documents</label>
                      <Input className="h-9 cursor-pointer text-xs file:mr-2 file:text-xs" type="file" />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-24 gap-1 hover:border-border hover:bg-muted"
                  onClick={addBomRow}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2 pt-4">
        <Button className="h-8 min-w-24" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="h-8 min-w-24"
          variant="outline"
          onClick={onClose}
          disabled={budgetExceeded}
          title={budgetExceeded ? "Estimated cost exceeds remaining budget" : undefined}
        >
          Save draft
        </Button>
        <Button
          className="h-8 min-w-24"
          onClick={submitPr}
          disabled={budgetExceeded}
          title={budgetExceeded ? "Estimated cost exceeds remaining budget" : undefined}
        >
          Save
        </Button>
      </div>
    </>
  );
}

type RfqStep = 1 | 2 | 3;
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
  status: "Draft";
  createdAt: string;
  deliveryTimeline: string;
  terms: string;
  baselineTotal: number;
  lineItems: Array<{ name: string; quantity: string; unit: string; specification: string }>;
  selectedSuppliers: string[];
  quotations: Array<{
    supplier: string;
    unitPrice: number;
    totalPrice: number;
    currency: string;
    deliveryTimeline: string;
    notes: string;
  }>;
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

function RequestForQuotationForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (record: CreatedRfqRecord) => void }) {
  const [step, setStep] = useState<RfqStep>(1);
  const [rfqTitle, setRfqTitle] = useState("");
  const [prReference, setPrReference] = useState("");
  const [baselineTotal, setBaselineTotal] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [deliveryTimeline, setDeliveryTimeline] = useState("");
  const [terms, setTerms] = useState("");
  const [attachments, setAttachments] = useState<number[]>([0]);
  const [itemRows, setItemRows] = useState<RfqItemRow[]>(() => [createEmptyRfqItem()]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
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
    const record: CreatedRfqRecord = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      rfq: `RFQ-${String(Date.now()).slice(-6)}`,
      title: rfqTitle.trim(),
      prRef: prReference.trim() || "-",
      suppliers: `${selectedSuppliers.length} Suppliers`,
      deadline: submissionDeadline,
      sourceKind: "project",
      projectKey: "proj-a",
      departmentKey: null,
      status: "Draft",
      createdAt: now,
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
  }, [selectedSuppliers, rfqTitle, prReference, submissionDeadline, deliveryTimeline, terms, baselineTotal, itemRows, onSubmit, onClose]);

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
                        Description
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
  createdAt: string;
};

type PoLineRow = {
  id: string;
  itemOrService: string;
  quantity: string;
  price: string;
  deliveryDate: string;
  lineGroup: string;
};

function PurchaseOrderForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (record: CreatedPoRecord) => void }) {
  const [step, setStep] = useState<PoStep>(1);
  const [orderCategory, setOrderCategory] = useState<"Product" | "Service" | "Training">("Product");
  const [taxes, setTaxes] = useState("");
  const [poAttachments, setPoAttachments] = useState<number[]>([0]);
  const [lines, setLines] = useState<PoLineRow[]>(() => [
    { id: "l-1", itemOrService: "", quantity: "", price: "", deliveryDate: "", lineGroup: "" },
  ]);

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
    const record: CreatedPoRecord = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      po: `PO-${String(Date.now()).slice(-6)}`,
      supplier: "ABC Supplier",
      approval: "Draft",
      orderSource: "Project",
      requestType: orderCategory,
      sourceKind: "project",
      projectKey: "proj-a",
      departmentKey: null,
      createdAt: new Date().toISOString(),
    };
    onSubmit(record);
    onClose();
  }, [lines, orderCategory, onSubmit, onClose]);

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
                <select id="po-request-source" className={selectClass} defaultValue="project">
                  <option value="project">Project</option>
                  <option value="operations">Operations</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-approved-pr" className="text-xs font-medium text-foreground">
                  Approved Purchase Requisition
                </label>
                <select id="po-approved-pr" className={selectClass} defaultValue="">
                  <option value="">Select PR</option>
                  <option>PR-1023</option>
                  <option>PR-1024</option>
                  <option>PR-1025</option>
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
                <Input id="po-order-title" className="h-9" placeholder="" />
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-supplier" className="text-xs font-medium text-foreground">
                  Supplier
                </label>
                <select id="po-supplier" className={selectClass} defaultValue="">
                  <option value="">Select supplier</option>
                  <option>ABC Supplier</option>
                  <option>XYZ Services</option>
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
                <select id="po-pr-ref" className={selectClass} defaultValue="">
                  <option value="">Select PR</option>
                  <option>PR-1023</option>
                  <option>PR-1024</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="po-rfq-ref" className="text-xs font-medium text-foreground">
                  Request for Quotation Reference
                </label>
                <select id="po-rfq-ref" className={selectClass} defaultValue="">
                  <option value="">Select RFQ</option>
                  <option>RFQ-1001</option>
                  <option>RFQ-1002</option>
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
                <label className="text-xs font-medium text-foreground">Item name</label>
                <Input
                  className="h-9"
                  placeholder=""
                  value={row.itemName}
                  onChange={(e) => updateRow(row.id, { itemName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  value={row.category}
                  onChange={(e) => updateRow(row.id, { category: e.target.value })}
                >
                  <option value="">Select category</option>
                  <option value="raw-materials">Raw Materials</option>
                  <option value="mro">MRO</option>
                  <option value="packaging">Packaging</option>
                  <option value="consumables">Consumables</option>
                  <option value="equipment">Equipment</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">Unit of measure</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  value={row.unitOfMeasure}
                  onChange={(e) => updateRow(row.id, { unitOfMeasure: e.target.value })}
                >
                  <option value="">Select unit</option>
                  <option value="pcs">pcs</option>
                  <option value="kg">kg</option>
                  <option value="roll">roll</option>
                  <option value="drum">drum</option>
                  <option value="pallet">pallet</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-foreground">Sourcing type</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  value={row.sourcingType}
                  onChange={(e) => updateRow(row.id, { sourcingType: e.target.value })}
                >
                  <option value="">Select sourcing</option>
                  <option value="local">Local</option>
                  <option value="offshore">Offshore</option>
                </select>
              </div>
              <div className="flex flex-col gap-3 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Approved supplier</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  value={row.approvedSupplier}
                  onChange={(e) => updateRow(row.id, { approvedSupplier: e.target.value })}
                >
                  <option value="">Select supplier</option>
                  <option value="swift">Swift Supplies</option>
                  <option value="hansei">Hansei Global</option>
                  <option value="zenith">Zenith Industrial</option>
                  <option value="apollo">Apollo Components</option>
                </select>
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
            const validRows = rows.filter((r) => r.itemName.trim() && r.category && r.unitOfMeasure);
            if (validRows.length === 0) return;
            onSubmit(validRows.map((r) => ({ ...r, id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()) })));
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
          <div className="mb-4 flex items-start justify-between gap-2">
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
        <div className="w-full max-w-3xl rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-start justify-between gap-2">
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
        <div className="w-full max-w-4xl rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-start justify-between gap-2">
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
        <div className="w-full max-w-4xl rounded-lg border bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-start justify-between gap-2">
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
          <div className="mb-4 flex items-start justify-between gap-2">
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
        <div className="mb-4 flex items-start justify-between gap-2">
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
    status: "Closed",
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
    approval: "Not Approved",
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
    approval: "Draft",
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
  createdPrs,
  createdRfqs,
  createdPos,
  createdMasterDataRows,
}: {
  onOpenDrawer: (key: DrawerKey) => void;
  onSubmitForApproval: (payload: SubmitApprovalDocumentInput) => string | null;
  createdPrs: CreatedPrRecord[];
  createdRfqs: CreatedRfqRecord[];
  createdPos: CreatedPoRecord[];
  createdMasterDataRows: ItemMasterRow[];
}) {
  type RfqLifecycleStatus = "Draft" | "Sent" | "Quotations Received" | "Under Evaluation" | "Awarded";
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
  type PrEligibleStatus =
    | "Approved by Team Lead"
    | "Pending Sourcing Assignment"
    | "Pending Sourcing"
    | "In Sourcing Process";
  type RfqQuote = {
    supplier: string;
    unitPrice: number;
    totalPrice: number;
    currency: string;
    deliveryTimeline: string;
    notes: string;
  };
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
    quotations: RfqQuote[];
    awardedSupplier: string | null;
    notificationTriggered: boolean;
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
    showSubmitApproval?: true;
  };

  const [tab, setTab] = useState<ProcurementTab>("Overview");
  const tabs: ProcurementTab[] = ["Overview", "Master Data", "Purchase Requisition", "RFQ", "Purchase Order", "Settings"];
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
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
          ? ("Approved by Team Lead" as const)
          : row.ref === "PR-1024"
            ? ("Pending Sourcing Assignment" as const)
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
  const [rfqRows, setRfqRows] = useState<RfqRow[]>(() =>
    RFQ_MODULE_TABLE_ROWS.map((row) => ({
      ...row,
      status:
        row.status === "Draft"
          ? "Draft"
          : row.status === "Awarded"
            ? "Awarded"
            : row.status === "Closed"
              ? "Quotations Received"
              : "Sent",
      deliveryTimeline: "30 days after PO release",
      terms: "Supplier must comply with agreed quality and delivery terms.",
      baselineTotal: row.prRef === "PR-1024" ? 12000 : row.prRef === "PR-1025" ? 4200 : 8000,
      lineItems: [{ name: row.title, quantity: "1", unit: "lot", specification: "As per PR scope" }],
      selectedSuppliers: [],
      quotations: [],
      awardedSupplier: row.status === "Awarded" ? "Swift Supplies" : null,
      notificationTriggered: false,
    }))
  );
  const [poRows, setPoRows] = useState<PoRow[]>([...PO_MODULE_TABLE_ROWS]);
  const [masterDataRows, setMasterDataRows] = useState<ItemMasterRow[]>([
    { id: "md-1", itemName: "Cast Iron Valve", category: "Raw Materials", unitOfMeasure: "pcs", sourcingType: "Offshore", approvedSupplier: "Hansei Global" },
    { id: "md-2", itemName: "Packing Tape", category: "Consumables", unitOfMeasure: "roll", sourcingType: "Local", approvedSupplier: "Swift Supplies" },
  ]);
  const [activeRfqId, setActiveRfqId] = useState<string | null>(null);
  const [supplierFilterCategory, setSupplierFilterCategory] = useState("");
  const [supplierFilterLocation, setSupplierFilterLocation] = useState("");
  const [supplierFilterRating, setSupplierFilterRating] = useState("");
  const [quoteDraft, setQuoteDraft] = useState({
    supplier: "",
    unitPrice: "",
    totalPrice: "",
    currency: "USD",
    deliveryTimeline: "",
    notes: "",
  });
  const [rfqFlowNotice, setRfqFlowNotice] = useState<string | null>(null);

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

  const filteredRfqRows = useMemo(
    () =>
      rfqRows.filter((r) =>
        matchesModuleSourceFilter(r, rfqFilters.requestSource, rfqFilters.projectId, rfqFilters.departmentId),
      ),
    [rfqRows, rfqFilters.requestSource, rfqFilters.projectId, rfqFilters.departmentId],
  );

  const filteredPoRows = useMemo(
    () =>
      poRows.filter((r) =>
        matchesModuleSourceFilter(r, poFilters.requestSource, poFilters.projectId, poFilters.departmentId),
      ),
    [poRows, poFilters.requestSource, poFilters.projectId, poFilters.departmentId],
  );

  const activeRfq = useMemo(() => rfqRows.find((r) => r.rfq === activeRfqId) ?? null, [rfqRows, activeRfqId]);
  const eligiblePrStatuses: PrEligibleStatus[] = [
    "Approved by Team Lead",
    "Pending Sourcing Assignment",
    "Pending Sourcing",
    "In Sourcing Process",
  ];

  const updateRfq = useCallback((rfqId: string, patch: Partial<RfqRow>) => {
    setRfqRows((prev) => prev.map((row) => (row.rfq === rfqId ? { ...row, ...patch } : row)));
  }, []);

  const createRfqFromPr = useCallback((prRef: string) => {
    const pr = prRows.find((p) => p.ref === prRef);
    if (!pr) return;
    const nextNumber = rfqRows.length + 1001;
    const rfqId = `RFQ-${nextNumber}`;
    const next: RfqRow = {
      rfq: rfqId,
      title: `${pr.entityLabel} sourcing`,
      prRef: pr.ref,
      suppliers: "0 Suppliers",
      deadline: "",
      status: "Draft",
      sourceKind: pr.sourceKind,
      projectKey: pr.projectKey,
      departmentKey: pr.departmentKey,
      deliveryTimeline: "30 days after award",
      terms: pr.terms,
      baselineTotal: pr.baselineTotal,
      lineItems: pr.lineItems,
      selectedSuppliers: [],
      quotations: [],
      awardedSupplier: null,
      notificationTriggered: false,
    };
    setRfqRows((prev) => [next, ...prev]);
    setActiveRfqId(rfqId);
    setTab("RFQ");
    setRfqFlowNotice(`Draft ${rfqId} created from ${pr.ref}. Complete fields and send to suppliers.`);
  }, [prRows, rfqRows.length]);

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
                <Input className="h-9 w-72" placeholder="Search items, category, supplier..." />
                <Button size="sm" className="h-8 min-w-24" onClick={() => onOpenDrawer("master-data")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </Button>
              </div>
              <div className="overflow-hidden rounded-md">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-3 font-medium">Item</th>
                      <th className="px-3 py-3 font-medium">UoM</th>
                      <th className="px-3 py-3 font-medium">Sourcing</th>
                      <th className="px-3 py-3 font-medium">Approved Supplier</th>
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
                          <td className="px-3 py-2">{row.unitOfMeasure}</td>
                          <td className="px-3 py-2">{row.sourcingType || "-"}</td>
                          <td className="px-3 py-2">{row.approvedSupplier || "-"}</td>
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
          <Card>
            <CardContent className="space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input className="h-9 w-72" placeholder="Search unit or supplier mapping..." />
                <Button className="h-8 min-w-24" variant="outline">Edit Mapping Matrix</Button>
              </div>
              <p className="rounded-md bg-slate-100 p-2">UoM setup: pcs, kg, drum, pallet, roll.</p>
              <p className="rounded-md bg-slate-100 p-2">Supplier assignment enforced per item to maintain approved source compliance.</p>
            </CardContent>
          </Card>
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
                <Button size="sm" className="h-9 min-w-24 shrink-0 self-center" onClick={() => onOpenDrawer("pr")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </Button>
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
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">SLA</th>
                      <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-muted-foreground" colSpan={8}>
                          No purchase requisitions yet. Create one to get started.
                        </td>
                      </tr>
                    ) : filteredPrRows.map((row) => (
                      <tr key={row.ref} className="border-t border-border/60">
                        <td className="px-3 py-2">{row.ref}</td>
                        <td className="px-3 py-2">{row.typeLabel}</td>
                        <td className="px-3 py-2">{row.entityLabel}</td>
                        <td className="px-3 py-2">{row.requester}</td>
                        <td className="px-3 py-2">{row.owner}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={row.status} />
                        </td>
                        <td className="px-3 py-2">{row.sla}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="ghost">
                              View
                            </Button>
                            <TableEditIconButton onClick={() => {}} aria-label="Edit PR" />
                            {"showSubmitApproval" in row && row.showSubmitApproval ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() =>
                                  setSubmitDoc({
                                    documentRef: "PR-1025",
                                    docType: "PR",
                                    title: "Road expansion materials",
                                    amountStr: "4200",
                                    dept: "ops",
                                  })
                                }
                              >
                                Submit for approval
                              </Button>
                            ) : null}
                            {eligiblePrStatuses.includes(row.status as PrEligibleStatus) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => createRfqFromPr(row.ref)}
                              >
                                Prefill RFQ from PR
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing {filteredPrRows.length} of {prRows.length} records
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
                    <option>Closed</option>
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
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setActiveRfqId(row.rfq)}>
                              View
                            </Button>
                            <TableEditIconButton onClick={() => setActiveRfqId(row.rfq)} aria-label="Edit RFQ" />
                          </div>
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
          {activeRfq ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>RFQ Lifecycle: {activeRfq.rfq}</span>
                  <StatusBadge value={activeRfq.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="font-medium">RFQ title *</label>
                    <Input
                      className="h-9"
                      value={activeRfq.title}
                      disabled={activeRfq.status !== "Draft"}
                      onChange={(e) => updateRfq(activeRfq.rfq, { title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium">Submission deadline *</label>
                    <Input
                      className="h-9"
                      type="date"
                      value={activeRfq.deadline}
                      disabled={activeRfq.status !== "Draft"}
                      onChange={(e) => updateRfq(activeRfq.rfq, { deadline: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <select className="h-9 rounded-md border border-input bg-background px-3" value={supplierFilterCategory} onChange={(e) => setSupplierFilterCategory(e.target.value)}>
                    <option value="">Category</option><option>Office Supplies</option><option>IT Equipment</option><option>Construction Materials</option>
                  </select>
                  <select className="h-9 rounded-md border border-input bg-background px-3" value={supplierFilterLocation} onChange={(e) => setSupplierFilterLocation(e.target.value)}>
                    <option value="">Location</option><option>Addis Ababa</option><option>Dubai</option><option>Seoul</option>
                  </select>
                  <select className="h-9 rounded-md border border-input bg-background px-3" value={supplierFilterRating} onChange={(e) => setSupplierFilterRating(e.target.value)}>
                    <option value="">Rating</option><option>5 stars</option><option>4+ stars</option><option>3+ stars</option>
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {["Swift Supplies", "Hansei Global", "Apollo Components", "Zenith Industrial"].map((s) => {
                    const checked = activeRfq.selectedSuppliers.includes(s);
                    return (
                      <label key={s} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={checked}
                          disabled={activeRfq.status !== "Draft"}
                          onChange={() => {
                            const next = checked
                              ? activeRfq.selectedSuppliers.filter((x) => x !== s)
                              : [...activeRfq.selectedSuppliers, s];
                            updateRfq(activeRfq.rfq, { selectedSuppliers: next, suppliers: `${next.length} Suppliers` });
                          }}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
                {activeRfq.status === "Draft" ? (
                  <Button
                    className="h-8 min-w-24"
                    onClick={() => {
                      const itemsComplete = activeRfq.lineItems.every((i) => i.name && i.quantity && i.specification);
                      if (!activeRfq.title.trim() || !activeRfq.deadline || !itemsComplete || activeRfq.selectedSuppliers.length === 0) {
                        setRfqFlowNotice("Validation failed: title, deadline, complete items, and at least one supplier are required.");
                        return;
                      }
                      updateRfq(activeRfq.rfq, { status: "Sent", notificationTriggered: true });
                      setRfqFlowNotice(`${activeRfq.rfq} sent to suppliers. Editing of critical fields is now locked.`);
                    }}
                  >
                    Send to Suppliers
                  </Button>
                ) : null}
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="font-medium">Quotation recording</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input className="h-8" placeholder="Supplier" value={quoteDraft.supplier} onChange={(e) => setQuoteDraft((p) => ({ ...p, supplier: e.target.value }))} />
                    <Input className="h-8" placeholder="Unit price" value={quoteDraft.unitPrice} onChange={(e) => setQuoteDraft((p) => ({ ...p, unitPrice: e.target.value }))} />
                    <Input className="h-8" placeholder="Total price" value={quoteDraft.totalPrice} onChange={(e) => setQuoteDraft((p) => ({ ...p, totalPrice: e.target.value }))} />
                  </div>
                  <Button
                    className="h-8 min-w-24"
                    variant="outline"
                    disabled={activeRfq.status === "Draft"}
                    onClick={() => {
                      if (!quoteDraft.supplier || !quoteDraft.totalPrice) return;
                      const nextQuotes = [
                        ...activeRfq.quotations,
                        {
                          supplier: quoteDraft.supplier,
                          unitPrice: Number(quoteDraft.unitPrice || 0),
                          totalPrice: Number(quoteDraft.totalPrice || 0),
                          currency: quoteDraft.currency,
                          deliveryTimeline: quoteDraft.deliveryTimeline,
                          notes: quoteDraft.notes,
                        },
                      ];
                      updateRfq(activeRfq.rfq, {
                        quotations: nextQuotes,
                        status: nextQuotes.length > 0 ? "Quotations Received" : activeRfq.status,
                      });
                      setQuoteDraft({ supplier: "", unitPrice: "", totalPrice: "", currency: "USD", deliveryTimeline: "", notes: "" });
                    }}
                  >
                    Save quotation
                  </Button>
                </div>
                {activeRfq.quotations.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {activeRfq.status === "Quotations Received" ? (
                        <Button className="h-8 min-w-24" onClick={() => updateRfq(activeRfq.rfq, { status: "Under Evaluation" })}>
                          Compare & Select
                        </Button>
                      ) : null}
                      {activeRfq.status === "Awarded" ? (
                        <Button
                          className="h-8 min-w-24"
                          onClick={() => {
                            const award = activeRfq.quotations.find((q) => q.supplier === activeRfq.awardedSupplier);
                            if (!award) return;
                            setPoRows((prev) => [
                              {
                                po: `PO-${1000 + prev.length + 1}`,
                                supplier: award.supplier,
                                approval: "Draft",
                                orderSource: activeRfq.sourceKind === "project" ? "Project" : "Department",
                                requestType: "Product",
                                sourceKind: activeRfq.sourceKind,
                                projectKey: activeRfq.projectKey,
                                departmentKey: activeRfq.departmentKey,
                              },
                              ...prev,
                            ]);
                            setTab("Purchase Order");
                            setRfqFlowNotice(`PO prefilled from ${activeRfq.rfq} for ${award.supplier}.`);
                          }}
                        >
                          Proceed to PO
                        </Button>
                      ) : null}
                    </div>
                    {activeRfq.status === "Under Evaluation" || activeRfq.status === "Awarded" ? (
                      <div className="overflow-hidden rounded-md border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/60">
                            <tr>
                              <th className="px-3 py-2">Supplier</th>
                              <th className="px-3 py-2">Total</th>
                              <th className="px-3 py-2">Baseline</th>
                              <th className="px-3 py-2">Margin %</th>
                              <th className="px-3 py-2">P/L</th>
                              <th className="px-3 py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeRfq.quotations.map((q) => {
                              const margin = activeRfq.baselineTotal ? ((q.totalPrice - activeRfq.baselineTotal) / activeRfq.baselineTotal) * 100 : 0;
                              const pl = q.totalPrice - activeRfq.baselineTotal;
                              return (
                                <tr key={`${activeRfq.rfq}-${q.supplier}`} className="border-t border-border/50">
                                  <td className="px-3 py-2">{q.supplier}</td>
                                  <td className="px-3 py-2">{q.currency} {q.totalPrice.toLocaleString()}</td>
                                  <td className="px-3 py-2">{activeRfq.baselineTotal.toLocaleString()}</td>
                                  <td className="px-3 py-2">{margin.toFixed(1)}%</td>
                                  <td className={cn("px-3 py-2", pl <= 0 ? "text-emerald-700" : "text-destructive")}>{pl <= 0 ? "Profit" : "Loss"}</td>
                                  <td className="px-3 py-2">
                                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => updateRfq(activeRfq.rfq, { awardedSupplier: q.supplier, status: "Awarded" })}>
                                      Select winner
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
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
                </div>
                <Button size="sm" className="h-9 min-w-24 shrink-0 self-center" onClick={() => onOpenDrawer("po")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </Button>
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
                      <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPoRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-muted-foreground" colSpan={6}>
                          No purchase orders yet. Create one to get started.
                        </td>
                      </tr>
                    ) : filteredPoRows.map((row) => (
                      <tr key={row.po} className="border-t border-border/60">
                        <td className="px-3 py-2">{row.po}</td>
                        <td className="px-3 py-2">{row.supplier}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={row.approval} />
                        </td>
                        <td className="px-3 py-2">{row.orderSource}</td>
                        <td className="px-3 py-2">{row.requestType}</td>
                        <td className="px-3 py-2">
                          {"showSubmitApproval" in row && row.showSubmitApproval ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button size="sm" variant="ghost">
                                View
                              </Button>
                              <TableEditIconButton onClick={() => {}} aria-label="Edit purchase order" />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() =>
                                  setSubmitDoc({
                                    documentRef: "PO-1006",
                                    docType: "PO",
                                    title: "Logistics services renewal",
                                    amountStr: "32000",
                                    dept: "ops",
                                  })
                                }
                              >
                                Submit for approval
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost">
                                View
                              </Button>
                              <TableEditIconButton onClick={() => {}} aria-label="Edit purchase order" />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-muted-foreground">
                Showing {filteredPoRows.length} of {poRows.length} records
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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
            <div className="mb-4 flex items-start justify-between gap-2">
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
            <div className="mb-4 flex items-start justify-between gap-2">
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
                    idx === activeStepIdx ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      idx === activeStepIdx ? "bg-primary text-primary-foreground" : "bg-slate-200 text-slate-600"
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
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">ETA</label>
                        <Input className="h-9" placeholder="ETA" value={entityForm.manufacturerEta} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerEta: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Credit Facility</label>
                        <Input className="h-9" placeholder="Credit Facility" value={entityForm.manufacturerCreditFacility} onChange={(e) => setEntityForm((p) => ({ ...p, manufacturerCreditFacility: e.target.value }))} />
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
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-medium text-foreground">Phone Number</label>
                        <div className="flex min-w-0">
                          <select className="h-9 !w-[72px] min-w-[72px] max-w-[72px] shrink-0 rounded-r-none border border-input border-r-0 bg-background px-2 text-xs" value={entityForm.addressPhoneCountry} onChange={(e) => setEntityForm((p) => ({ ...p, addressPhoneCountry: e.target.value }))}>
                            {countryCodeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <Input className="!w-[248px] h-9 min-w-0 flex-1 !max-w-[248px] rounded-l-none" placeholder="Phone Number" value={entityForm.addressPhoneNumber} onChange={(e) => setEntityForm((p) => ({ ...p, addressPhoneNumber: e.target.value }))} />
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
        <div className="mb-4 flex items-start justify-between gap-2">
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
                <DropdownMenuSeparator />
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
              createdPrs={createdPrs}
              createdRfqs={createdRfqs}
              createdPos={createdPos}
              createdMasterDataRows={createdMasterDataRows}
            />
          )}
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
