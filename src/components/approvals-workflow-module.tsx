"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Clock, Plus, X, XCircle } from "lucide-react";
import { TableDeleteIconButton, TableEditIconButton } from "@/components/table-action-icon-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  APPROVAL_ROLE_ORDER,
  approveCurrentStep,
  type ApprovalStep,
  type DocType,
  type DocumentRuleInput,
  type RuleCondition,
  rejectCurrentStep,
  roleLabelForKey,
  type WorkflowInstance,
  type WorkflowRule,
  inboxInstancesForRole,
  newRuleId,
  pickMatchingRule,
  pendingStep,
} from "@/lib/approval-workflow";

const textareaClass =
  "min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatTs(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const docTone: Record<DocType, string> = {
  PR: "bg-muted text-muted-foreground",
  RFQ: "bg-secondary text-secondary-foreground",
  PO: "bg-secondary text-secondary-foreground",
};

const stepStatusTone: Record<ApprovalStep["status"], string> = {
  pending: "text-foreground bg-muted border-border",
  approved: "text-foreground bg-muted border-border",
  rejected: "text-destructive bg-destructive/10 border-destructive/30",
};

const overallDocBadge: Record<WorkflowInstance["documentStatus"], string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-secondary text-secondary-foreground",
  in_progress: "bg-secondary text-secondary-foreground",
  approved: "bg-secondary text-secondary-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

function DocTypeBadge({ t }: { t: DocType }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", docTone[t])}>{t}</span>;
}

function WorkflowTimeline({ instance }: { instance: WorkflowInstance }) {
  const submitted = instance.submittedAt;
  return (
    <div className="space-y-4 text-xs">
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <div className="mt-1 min-h-[28px] w-px flex-1 bg-border" />
        </div>
        <div className="flex-1 pb-2">
          <p className="font-medium text-foreground">Submitted</p>
          <p className="text-muted-foreground">{formatTs(submitted)}</p>
          <p className="text-muted-foreground">
            Rule: <span className="font-medium text-foreground">{instance.matchedRuleId ?? "—"}</span>
          </p>
        </div>
      </div>

      {instance.steps.map((s, idx) => (
        <div key={s.level} className="flex gap-3">
          <div className="flex flex-col items-center">
            {s.status === "approved" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : s.status === "rejected" ? (
              <XCircle className="h-4 w-4 text-red-600" />
            ) : (
              <Clock className="h-4 w-4 text-amber-600" />
            )}
            {idx < instance.steps.length - 1 ? <div className="mt-1 min-h-[28px] w-px flex-1 bg-border" /> : null}
          </div>
          <div className="flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                Level {s.level} · {s.roleLabel}
              </p>
              <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", stepStatusTone[s.status])}>
                {s.status === "pending" ? "Pending" : s.status === "approved" ? "Approved" : "Rejected"}
              </span>
            </div>
            <p className="text-muted-foreground">
              {s.approverName ? `${s.approverName} · ` : ""}
              {formatTs(s.decidedAt)}
            </p>
            {s.comment ? <p className="mt-1 rounded-md bg-muted/60 p-2 text-foreground">{s.comment}</p> : null}
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          {instance.documentStatus === "approved" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : instance.documentStatus === "rejected" ? (
            <XCircle className="h-4 w-4 text-red-600" />
          ) : (
            <Clock className="h-4 w-4 text-amber-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-medium">Final outcome</p>
          <Badge className={cn("mt-1 font-normal", overallDocBadge[instance.documentStatus])}>
            {instance.documentStatus === "in_progress"
              ? "In progress"
              : instance.documentStatus.charAt(0).toUpperCase() + instance.documentStatus.slice(1)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export function WorkflowRuleEditorForm({
  onClose,
  onSave,
  initialRule,
  existingRules,
}: {
  onClose: () => void;
  onSave: (rule: WorkflowRule) => void;
  initialRule: WorkflowRule | null;
  existingRules: WorkflowRule[];
}) {
  const [name, setName] = useState(() => initialRule?.name ?? "");
  const [priority, setPriority] = useState(() => String(initialRule?.priority ?? 30));
  const [docType, setDocType] = useState<DocType>(() => initialRule?.docType ?? "PR");
  const [amountMode, setAmountMode] = useState<"none" | "lt" | "range" | "gt" | "gte">(() => {
    const a = initialRule?.conditions.find((c): c is Extract<RuleCondition, { kind: "amount" }> => c.kind === "amount");
    if (!a) return "none";
    return a.mode;
  });
  const [amountMin, setAmountMin] = useState(() => {
    const a = initialRule?.conditions.find((c): c is Extract<RuleCondition, { kind: "amount" }> => c.kind === "amount");
    if (!a) return "";
    if (a.mode === "range" || a.mode === "gt" || a.mode === "gte") return String(a.min ?? "");
    return "";
  });
  const [amountMax, setAmountMax] = useState(() => {
    const a = initialRule?.conditions.find((c): c is Extract<RuleCondition, { kind: "amount" }> => c.kind === "amount");
    if (!a) return "";
    if (a.mode === "lt") return String(a.max ?? "");
    if (a.mode === "range") return String(a.max ?? "");
    return "";
  });
  const [deptKey, setDeptKey] = useState(() => {
    const d = initialRule?.conditions.find((c): c is Extract<RuleCondition, { kind: "department" }> => c.kind === "department");
    return d?.departmentKey ?? "";
  });
  const [originatorRole, setOriginatorRole] = useState(() => {
    const r = initialRule?.conditions.find((c): c is Extract<RuleCondition, { kind: "originator_role" }> => c.kind === "originator_role");
    return r?.roleKey ?? "";
  });
  const [r1, setR1] = useState(() => initialRule?.approverRoleKeys[0] ?? "dept_manager");
  const [r2, setR2] = useState(() => initialRule?.approverRoleKeys[1] ?? "");
  const [r3, setR3] = useState(() => initialRule?.approverRoleKeys[2] ?? "");
  const [warn, setWarn] = useState<string | null>(null);

  const roleSelect = (value: string, onChange: (v: string) => void) => (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">(none)</option>
      {APPROVAL_ROLE_ORDER.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
    </select>
  );

  const submit = () => {
    setWarn(null);
    const p = Number(String(priority).replace(/[^0-9.-]/g, "")) || 0;
    const conditions: RuleCondition[] = [];
    if (amountMode !== "none") {
      const nMin = Number(String(amountMin).replace(/[^0-9.-]/g, ""));
      const nMax = Number(String(amountMax).replace(/[^0-9.-]/g, ""));
      if (amountMode === "lt") {
        if (!Number.isFinite(nMax) || nMax <= 0) {
          setWarn("Amount: enter a valid upper bound.");
          return;
        }
        conditions.push({ kind: "amount", mode: "lt", max: nMax });
      }
      if (amountMode === "range") {
        if (!Number.isFinite(nMin) || !Number.isFinite(nMax) || nMin >= nMax) {
          setWarn("Amount: enter a valid min/max range.");
          return;
        }
        conditions.push({ kind: "amount", mode: "range", min: nMin, max: nMax });
      }
      if (amountMode === "gt") {
        if (!Number.isFinite(nMin)) {
          setWarn("Amount: enter a valid lower bound for greater-than.");
          return;
        }
        conditions.push({ kind: "amount", mode: "gt", min: nMin });
      }
      if (amountMode === "gte") {
        if (!Number.isFinite(nMin)) {
          setWarn("Amount: enter a valid minimum for greater-or-equal.");
          return;
        }
        conditions.push({ kind: "amount", mode: "gte", min: nMin });
      }
    }
    if (deptKey) conditions.push({ kind: "department", departmentKey: deptKey });
    if (originatorRole) conditions.push({ kind: "originator_role", roleKey: originatorRole });
    if (conditions.length === 0) {
      setWarn("Add at least one condition (amount, department, or originator role).");
      return;
    }
    const keys = [r1, r2, r3].filter(Boolean);
    if (keys.length === 0) {
      setWarn("Select at least one approval level (role).");
      return;
    }
    const dup = existingRules.some((x) => x.id !== initialRule?.id && x.docType === docType && x.priority === p);
    if (dup) {
      setWarn("Another rule already uses this document type and priority. Increase priority for more specific rules.");
      return;
    }
    const rule: WorkflowRule = {
      id: initialRule?.id ?? newRuleId(),
      name: name.trim() || "Untitled rule",
      priority: p,
      docType,
      conditions,
      approverRoleKeys: keys,
    };
    onSave(rule);
    onClose();
  };

  return (
    <div className="space-y-5 text-xs">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 sm:col-span-2">
          <label className="text-xs font-medium">Rule name</label>
          <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PR mid-tier approvals" />
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium">Priority (higher runs first)</label>
          <Input className="h-9" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium">Document type</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
          >
            <option value="PR">PR</option>
            <option value="RFQ">RFQ</option>
            <option value="PO">PO</option>
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
        <legend className="text-xs font-medium text-foreground">Conditions (all must match)</legend>
        <div className="flex flex-col gap-3">
          <label className="text-[11px] text-muted-foreground">Amount</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={amountMode}
            onChange={(e) => setAmountMode(e.target.value as typeof amountMode)}
          >
            <option value="none">No amount condition</option>
            <option value="lt">Less than</option>
            <option value="range">Between (inclusive)</option>
            <option value="gt">Greater than</option>
            <option value="gte">Greater or equal</option>
          </select>
        </div>
        {amountMode === "lt" ? (
          <div className="flex flex-col gap-3">
            <label className="text-[11px] text-muted-foreground">Upper bound (USD)</label>
            <Input className="h-9" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="1000" />
          </div>
        ) : null}
        {amountMode === "range" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <label className="text-[11px] text-muted-foreground">Min (USD)</label>
              <Input className="h-9" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} />
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-[11px] text-muted-foreground">Max (USD)</label>
              <Input className="h-9" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} />
            </div>
          </div>
        ) : null}
        {(amountMode === "gt" || amountMode === "gte") && (
          <div className="flex flex-col gap-3">
            <label className="text-[11px] text-muted-foreground">Amount (USD)</label>
            <Input className="h-9" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} />
          </div>
        )}
        <div className="flex flex-col gap-3">
          <label className="text-[11px] text-muted-foreground">Department (optional)</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={deptKey}
            onChange={(e) => setDeptKey(e.target.value)}
          >
            <option value="">Any department</option>
            <option value="ops">Operations</option>
            <option value="it">IT Department</option>
            <option value="finance">Finance</option>
            <option value="hr">HR</option>
          </select>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-[11px] text-muted-foreground">Originator role (optional)</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={originatorRole}
            onChange={(e) => setOriginatorRole(e.target.value)}
          >
            <option value="">Any</option>
            <option value="requestor">Requestor</option>
            <option value="buyer">Buyer</option>
          </select>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium">Approval levels (ordered)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-3">
            <span className="text-[11px] text-muted-foreground">Level 1</span>
            {roleSelect(r1, setR1)}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[11px] text-muted-foreground">Level 2</span>
            {roleSelect(r2, setR2)}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[11px] text-muted-foreground">Level 3</span>
            {roleSelect(r3, setR3)}
          </div>
        </div>
      </div>

      {warn ? <p className="rounded-md bg-amber-50 p-2 text-amber-900">{warn}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="h-8 min-w-24" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" className="h-8 min-w-24" onClick={submit}>
          Save rule
        </Button>
      </div>
    </div>
  );
}

type ApprovalsTab = "inbox" | "rules" | "workflows" | "sett";
type SettSection = "clients" | "shipment" | "payment" | "businessUnit" | "sectors" | "users" | "supplierCategory" | "approval" | "stock";

export function ApprovalsWorkflowModule({
  rules,
  setRules,
  instances,
  setInstances,
}: {
  rules: WorkflowRule[];
  setRules: React.Dispatch<React.SetStateAction<WorkflowRule[]>>;
  instances: WorkflowInstance[];
  setInstances: React.Dispatch<React.SetStateAction<WorkflowInstance[]>>;
}) {
  const [tab, setTab] = useState<ApprovalsTab>("inbox");
  const [actingRoleKey, setActingRoleKey] = useState<string>(APPROVAL_ROLE_ORDER[0]?.key ?? "dept_manager");
  const [detail, setDetail] = useState<WorkflowInstance | null>(null);
  const [action, setAction] = useState<null | { kind: "approve" | "reject"; instance: WorkflowInstance }>(null);
  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [ruleEditor, setRuleEditor] = useState<WorkflowRule | null | "create">(null);
  const [ruleDeleteTarget, setRuleDeleteTarget] = useState<WorkflowRule | null>(null);
  const [settSection, setSettSection] = useState<SettSection>("clients");
  const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
  const [businessUnitDraft, setBusinessUnitDraft] = useState("");
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [sectorDraft, setSectorDraft] = useState("");
  const [clients, setClients] = useState<
    { id: string; clientName: string; address: string; poBox: string; telephone: string }[]
  >([]);
  const [clientDraft, setClientDraft] = useState({
    clientName: "",
    address: "",
    poBox: "",
    telephone: "",
  });
  const [supplierCategories, setSupplierCategories] = useState<
    { id: string; name: string; description: string }[]
  >([]);
  const [supplierCategoryDraft, setSupplierCategoryDraft] = useState({
    name: "",
    description: "",
  });
  const [shipmentDestinations, setShipmentDestinations] = useState<{ id: string; name: string }[]>([]);
  const [shipmentModes, setShipmentModes] = useState<{ id: string; name: string }[]>([]);
  const [shipmentTypes, setShipmentTypes] = useState<{ id: string; name: string }[]>([]);
  const [shipmentDestinationDraft, setShipmentDestinationDraft] = useState("");
  const [shipmentModeDraft, setShipmentModeDraft] = useState("");
  const [shipmentTypeDraft, setShipmentTypeDraft] = useState("");
  const [paymentModes, setPaymentModes] = useState<{ id: string; name: string }[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<{ id: string; name: string }[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<{ id: string; advancePct: string; description: string }[]>([]);
  const [paymentModeDraft, setPaymentModeDraft] = useState("");
  const [paymentTypeDraft, setPaymentTypeDraft] = useState("");
  const [paymentTermDraft, setPaymentTermDraft] = useState({ advancePct: "", description: "" });

  const inbox = useMemo(() => inboxInstancesForRole(instances, actingRoleKey), [instances, actingRoleKey]);

  const tabBtn = (id: ApprovalsTab, label: string) => (
    <Button
      key={id}
      variant="ghost"
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        "h-9 rounded-none border-0 bg-transparent px-0 text-sm font-normal shadow-none hover:bg-transparent",
        tab === id ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "inline-block border-b border-transparent pb-1 font-normal",
          tab === id && "border-primary font-bold text-primary"
        )}
      >
        {label}
      </span>
    </Button>
  );

  const runApprove = useCallback(() => {
    if (!action) return;
    setActionError(null);
    const res = approveCurrentStep(action.instance, "Alex Johnson", actingRoleKey, comment);
    if (!res.ok) {
      setActionError(res.reason);
      return;
    }
    setInstances((prev) => prev.map((w) => (w.id === res.instance.id ? res.instance : w)));
    setAction(null);
    setComment("");
    setDetail((d) => (d && d.id === res.instance.id ? res.instance : d));
  }, [action, actingRoleKey, comment, setInstances]);

  const runReject = useCallback(() => {
    if (!action) return;
    setActionError(null);
    const res = rejectCurrentStep(action.instance, "Alex Johnson", actingRoleKey, comment);
    if (!res.ok) {
      setActionError(res.reason);
      return;
    }
    setInstances((prev) => prev.map((w) => (w.id === res.instance.id ? res.instance : w)));
    setAction(null);
    setComment("");
    setDetail((d) => (d && d.id === res.instance.id ? res.instance : d));
  }, [action, actingRoleKey, comment, setInstances]);

  const saveRule = (rule: WorkflowRule) => {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id);
      if (idx >= 0) return prev.map((r, i) => (i === idx ? rule : r));
      return [...prev, rule];
    });
  };

  const addBusinessUnit = useCallback(() => {
    const name = businessUnitDraft.trim();
    if (!name) return;
    setBusinessUnits((prev) => [{ id: `bu-${Date.now()}`, name }, ...prev]);
    setBusinessUnitDraft("");
  }, [businessUnitDraft]);

  const addSector = useCallback(() => {
    const name = sectorDraft.trim();
    if (!name) return;
    setSectors((prev) => [{ id: `sector-${Date.now()}`, name }, ...prev]);
    setSectorDraft("");
  }, [sectorDraft]);

  const addClient = useCallback(() => {
    const clientName = clientDraft.clientName.trim();
    const address = clientDraft.address.trim();
    const poBox = clientDraft.poBox.trim();
    const telephone = clientDraft.telephone.trim();
    if (!clientName || !address || !poBox || !telephone) return;
    setClients((prev) => [{ id: `client-${Date.now()}`, clientName, address, poBox, telephone }, ...prev]);
    setClientDraft({ clientName: "", address: "", poBox: "", telephone: "" });
  }, [clientDraft]);

  const addSupplierCategory = useCallback(() => {
    const name = supplierCategoryDraft.name.trim();
    const description = supplierCategoryDraft.description.trim();
    if (!name || !description) return;
    setSupplierCategories((prev) => [{ id: `supcat-${Date.now()}`, name, description }, ...prev]);
    setSupplierCategoryDraft({ name: "", description: "" });
  }, [supplierCategoryDraft]);

  const addShipmentDestination = useCallback(() => {
    const name = shipmentDestinationDraft.trim();
    if (!name) return;
    setShipmentDestinations((prev) => [{ id: `ship-dest-${Date.now()}`, name }, ...prev]);
    setShipmentDestinationDraft("");
  }, [shipmentDestinationDraft]);

  const addShipmentMode = useCallback(() => {
    const name = shipmentModeDraft.trim();
    if (!name) return;
    setShipmentModes((prev) => [{ id: `ship-mode-${Date.now()}`, name }, ...prev]);
    setShipmentModeDraft("");
  }, [shipmentModeDraft]);

  const addShipmentType = useCallback(() => {
    const name = shipmentTypeDraft.trim();
    if (!name) return;
    setShipmentTypes((prev) => [{ id: `ship-type-${Date.now()}`, name }, ...prev]);
    setShipmentTypeDraft("");
  }, [shipmentTypeDraft]);

  const addPaymentMode = useCallback(() => {
    const name = paymentModeDraft.trim();
    if (!name) return;
    setPaymentModes((prev) => [{ id: `pay-mode-${Date.now()}`, name }, ...prev]);
    setPaymentModeDraft("");
  }, [paymentModeDraft]);

  const addPaymentType = useCallback(() => {
    const name = paymentTypeDraft.trim();
    if (!name) return;
    setPaymentTypes((prev) => [{ id: `pay-type-${Date.now()}`, name }, ...prev]);
    setPaymentTypeDraft("");
  }, [paymentTypeDraft]);

  const addPaymentTerm = useCallback(() => {
    const advancePct = paymentTermDraft.advancePct.trim();
    const description = paymentTermDraft.description.trim();
    if (!advancePct || !description) return;
    const parsedPct = Number(advancePct);
    if (!Number.isFinite(parsedPct) || parsedPct < 0 || parsedPct > 100) return;
    setPaymentTerms((prev) => [{ id: `pay-term-${Date.now()}`, advancePct, description }, ...prev]);
    setPaymentTermDraft({ advancePct: "", description: "" });
  }, [paymentTermDraft]);

  const previewPick = useMemo(() => pickMatchingRule(rules, { docType: "PR", amount: 7500 } satisfies DocumentRuleInput), [rules]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          {tabBtn("inbox", "Approval inbox")}
          {tabBtn("rules", "Workflow rules")}
          {tabBtn("workflows", "All workflows")}
          {tabBtn("sett", "SETT")}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Acting as role</span>
          <select
            className="h-9 min-w-[11rem] rounded-md border border-input bg-background px-3 text-xs"
            value={actingRoleKey}
            onChange={(e) => setActingRoleKey(e.target.value)}
          >
            {APPROVAL_ROLE_ORDER.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tab === "inbox" && (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending for your role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {inbox.length === 0 ? (
              <p className="rounded-md bg-muted/60 p-6 text-center text-muted-foreground">No pending items for this role.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Document</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Summary</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Current level</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbox.map((w) => {
                      const p = pendingStep(w);
                      return (
                        <tr key={w.id} className="border-t border-border/60">
                          <td className="px-3 py-2 font-medium">{w.documentRef}</td>
                          <td className="px-3 py-2">
                            <DocTypeBadge t={w.docType} />
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-muted-foreground">{w.title}</td>
                          <td className="px-3 py-2 tabular-nums">{formatMoney(w.amount)}</td>
                          <td className="px-3 py-2">
                            {p ? (
                              <span>
                                L{p.level} · {p.roleLabel}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={cn("font-normal", overallDocBadge[w.documentStatus])}>
                              {w.documentStatus === "in_progress" ? "Pending" : w.documentStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDetail(w)}>
                                View
                              </Button>
                              <Button type="button" size="sm" className="h-7 text-xs" onClick={() => setAction({ kind: "approve", instance: w })}>
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => setAction({ kind: "reject", instance: w })}
                              >
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "rules" && (
        <div className="space-y-4">
          <Card className="border-border shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">Rule library</CardTitle>
              <CardAction className="flex gap-2">
                <Button type="button" size="sm" className="h-8 gap-1" onClick={() => setRuleEditor("create")}>
                  <Plus className="h-3.5 w-3.5" />
                  New rule
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                Rules are evaluated in <span className="font-medium text-foreground">priority order</span> (highest first). The first rule
                whose conditions all match defines the approval chain. Overlapping rules at the same priority are flagged as conflicts when
                a document is submitted.
              </p>
              <p className="rounded-md border border-border bg-muted/60 p-2 text-[11px] text-muted-foreground">
                Dry-run sample: PR @ $7,500 matches rule{" "}
                <span className="font-medium text-foreground">{previewPick.rule?.name ?? "—"}</span>
                {"conflict" in previewPick && previewPick.conflict ? (
                  <span className="text-amber-700"> (priority conflict between multiple rules)</span>
                ) : null}
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[880px] text-left">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Priority</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Doc</th>
                      <th className="px-3 py-2 font-medium">Conditions</th>
                      <th className="px-3 py-2 font-medium">Levels</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rules].sort((a, b) => b.priority - a.priority).map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-3 py-2 tabular-nums">{r.priority}</td>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">
                          <DocTypeBadge t={r.docType} />
                        </td>
                        <td className="max-w-[280px] px-3 py-2 text-muted-foreground">
                          {r.conditions.map((c) => JSON.stringify(c)).join(" · ")}
                        </td>
                        <td className="px-3 py-2">
                          {r.approverRoleKeys.map((k) => roleLabelForKey(k)).join(" → ")}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <TableEditIconButton onClick={() => setRuleEditor(r)} aria-label={`Edit rule ${r.name}`} />
                            <TableDeleteIconButton onClick={() => setRuleDeleteTarget(r)} aria-label={`Delete rule ${r.name}`} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "workflows" && (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Documents in workflow</CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[800px] text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Ref</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Progress</th>
                    <th className="px-3 py-2 font-medium">Outcome</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((w) => {
                    const done = w.steps.filter((s) => s.status === "approved").length;
                    return (
                      <tr key={w.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">{w.documentRef}</td>
                        <td className="px-3 py-2">
                          <DocTypeBadge t={w.docType} />
                        </td>
                        <td className="max-w-[200px] px-3 py-2 text-muted-foreground">{w.title}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(w.amount)}</td>
                        <td className="px-3 py-2">
                          {done}/{w.steps.length} levels
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={cn("font-normal", overallDocBadge[w.documentStatus])}>
                            {w.documentStatus === "in_progress" ? "In progress" : w.documentStatus}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDetail(w)}>
                            Timeline
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "sett" && (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">SETT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={settSection === "clients" ? "default" : "outline"} onClick={() => setSettSection("clients")}>Clients</Button>
              <Button type="button" size="sm" variant={settSection === "shipment" ? "default" : "outline"} onClick={() => setSettSection("shipment")}>shipment</Button>
              <Button type="button" size="sm" variant={settSection === "payment" ? "default" : "outline"} onClick={() => setSettSection("payment")}>payment</Button>
              <Button type="button" size="sm" variant={settSection === "businessUnit" ? "default" : "outline"} onClick={() => setSettSection("businessUnit")}>Business Unit</Button>
              <Button type="button" size="sm" variant={settSection === "sectors" ? "default" : "outline"} onClick={() => setSettSection("sectors")}>Sectors</Button>
              <Button type="button" size="sm" variant={settSection === "users" ? "default" : "outline"} onClick={() => setSettSection("users")}>Users</Button>
              <Button type="button" size="sm" variant={settSection === "supplierCategory" ? "default" : "outline"} onClick={() => setSettSection("supplierCategory")}>Supplier Category</Button>
              <Button type="button" size="sm" variant={settSection === "approval" ? "default" : "outline"} onClick={() => setSettSection("approval")}>Approval</Button>
              <Button type="button" size="sm" variant={settSection === "stock" ? "default" : "outline"} onClick={() => setSettSection("stock")}>Stock</Button>
            </div>

            {settSection === "businessUnit" ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-foreground">Business Unit</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="h-8 w-full max-w-sm"
                    placeholder="Add business unit"
                    value={businessUnitDraft}
                    onChange={(e) => setBusinessUnitDraft(e.target.value)}
                  />
                  <Button type="button" size="sm" onClick={addBusinessUnit}>Add</Button>
                </div>
                {businessUnits.length === 0 ? (
                  <p>No business units added yet.</p>
                ) : (
                  <div className="space-y-1">
                    {businessUnits.map((row) => (
                      <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                        <span>{row.name}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setBusinessUnits((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {settSection === "sectors" ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-foreground">Sectors</p>
                <div className="flex flex-wrap gap-2">
                  <Input className="h-8 w-full max-w-sm" placeholder="Add sector" value={sectorDraft} onChange={(e) => setSectorDraft(e.target.value)} />
                  <Button type="button" size="sm" onClick={addSector}>Add</Button>
                </div>
                {sectors.length === 0 ? (
                  <p>No sectors added yet.</p>
                ) : (
                  <div className="space-y-1">
                    {sectors.map((row) => (
                      <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                        <span>{row.name}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setSectors((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {settSection === "clients" ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-foreground">Clients</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input className="h-8" placeholder="Client Name" value={clientDraft.clientName} onChange={(e) => setClientDraft((prev) => ({ ...prev, clientName: e.target.value }))} />
                  <Input className="h-8" placeholder="Address" value={clientDraft.address} onChange={(e) => setClientDraft((prev) => ({ ...prev, address: e.target.value }))} />
                  <Input className="h-8" placeholder="P.O. Box" value={clientDraft.poBox} onChange={(e) => setClientDraft((prev) => ({ ...prev, poBox: e.target.value }))} />
                  <Input className="h-8" placeholder="Telephone" value={clientDraft.telephone} onChange={(e) => setClientDraft((prev) => ({ ...prev, telephone: e.target.value }))} />
                </div>
                <Button type="button" size="sm" onClick={addClient}>Add Client</Button>
                {clients.length === 0 ? (
                  <p>No clients added yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[620px] text-left">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Client Name</th>
                          <th className="px-2 py-1.5 font-medium">Address</th>
                          <th className="px-2 py-1.5 font-medium">P.O. Box</th>
                          <th className="px-2 py-1.5 font-medium">Telephone</th>
                          <th className="px-2 py-1.5 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map((row) => (
                          <tr key={row.id} className="border-t">
                            <td className="px-2 py-1.5">{row.clientName}</td>
                            <td className="px-2 py-1.5">{row.address}</td>
                            <td className="px-2 py-1.5">{row.poBox}</td>
                            <td className="px-2 py-1.5">{row.telephone}</td>
                            <td className="px-2 py-1.5">
                              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setClients((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {settSection === "supplierCategory" ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-foreground">Supplier Category</p>
                <div className="grid gap-2 md:grid-cols-[1fr,2fr,auto]">
                  <Input className="h-8" placeholder="Category name" value={supplierCategoryDraft.name} onChange={(e) => setSupplierCategoryDraft((prev) => ({ ...prev, name: e.target.value }))} />
                  <Input className="h-8" placeholder="Description" value={supplierCategoryDraft.description} onChange={(e) => setSupplierCategoryDraft((prev) => ({ ...prev, description: e.target.value }))} />
                  <Button type="button" size="sm" onClick={addSupplierCategory}>Add</Button>
                </div>
                {supplierCategories.length === 0 ? (
                  <p>No supplier categories added yet.</p>
                ) : (
                  <div className="space-y-1">
                    {supplierCategories.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                        <div>
                          <p className="text-foreground">{row.name}</p>
                          <p className="text-[11px] text-muted-foreground">{row.description}</p>
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setSupplierCategories((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {settSection === "shipment" ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-foreground">Shipment Configuration</p>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium text-foreground">Shipment Destination</p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-8 w-full"
                        placeholder="Add shipment destination"
                        value={shipmentDestinationDraft}
                        onChange={(e) => setShipmentDestinationDraft(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={addShipmentDestination}>Add</Button>
                    </div>
                    {shipmentDestinations.length === 0 ? (
                      <p>No shipment destinations added yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {shipmentDestinations.map((row) => (
                          <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                            <span>{row.name}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setShipmentDestinations((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium text-foreground">Shipment Mode</p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-8 w-full"
                        placeholder="Add shipment mode"
                        value={shipmentModeDraft}
                        onChange={(e) => setShipmentModeDraft(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={addShipmentMode}>Add</Button>
                    </div>
                    {shipmentModes.length === 0 ? (
                      <p>No shipment modes added yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {shipmentModes.map((row) => (
                          <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                            <span>{row.name}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setShipmentModes((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium text-foreground">Shipment Type</p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-8 w-full"
                        placeholder="Add shipment type"
                        value={shipmentTypeDraft}
                        onChange={(e) => setShipmentTypeDraft(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={addShipmentType}>Add</Button>
                    </div>
                    {shipmentTypes.length === 0 ? (
                      <p>No shipment types added yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {shipmentTypes.map((row) => (
                          <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                            <span>{row.name}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setShipmentTypes((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {settSection === "payment" ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-foreground">Payment Configuration</p>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium text-foreground">Payment Mode</p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-8 w-full"
                        placeholder="Add payment mode"
                        value={paymentModeDraft}
                        onChange={(e) => setPaymentModeDraft(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={addPaymentMode}>Add</Button>
                    </div>
                    {paymentModes.length === 0 ? (
                      <p>No payment modes added yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {paymentModes.map((row) => (
                          <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                            <span>{row.name}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setPaymentModes((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium text-foreground">Payment Terms</p>
                    <div className="grid gap-2 md:grid-cols-[120px,1fr,auto]">
                      <Input
                        className="h-8"
                        placeholder="Advance %"
                        value={paymentTermDraft.advancePct}
                        onChange={(e) => setPaymentTermDraft((prev) => ({ ...prev, advancePct: e.target.value }))}
                      />
                      <Input
                        className="h-8"
                        placeholder="Description"
                        value={paymentTermDraft.description}
                        onChange={(e) => setPaymentTermDraft((prev) => ({ ...prev, description: e.target.value }))}
                      />
                      <Button type="button" size="sm" onClick={addPaymentTerm}>Add</Button>
                    </div>
                    {paymentTerms.length === 0 ? (
                      <p>No payment terms added yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {paymentTerms.map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                            <span>{row.advancePct}% - {row.description}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setPaymentTerms((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium text-foreground">Payment Type</p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-8 w-full"
                        placeholder="Add payment type"
                        value={paymentTypeDraft}
                        onChange={(e) => setPaymentTypeDraft(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={addPaymentType}>Add</Button>
                    </div>
                    {paymentTypes.length === 0 ? (
                      <p>No payment types added yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {paymentTypes.map((row) => (
                          <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                            <span>{row.name}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setPaymentTypes((prev) => prev.filter((x) => x.id !== row.id))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {settSection === "users" || settSection === "approval" || settSection === "stock" ? (
              <div className="rounded-md border border-dashed p-4">
                <p>
                  {settSection === "users"
                    ? "Users settings section is ready."
                    : settSection === "approval"
                      ? "Approval settings section is ready."
                      : "Stock settings section is ready."}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="no-scrollbar max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Approval timeline</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail.documentRef} · <DocTypeBadge t={detail.docType} />
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDetail(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <WorkflowTimeline instance={detail} />
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" className="h-8 min-w-24" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {action ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <h3 className="text-sm font-semibold">{action.kind === "approve" ? "Approve" : "Reject"} document</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {action.instance.documentRef} — {action.instance.title}
            </p>
            <label className="mt-3 block text-xs font-medium">Comment</label>
            <textarea className={cn(textareaClass, "mt-1")} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment for the audit trail" />
            {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-8 min-w-24" onClick={() => { setAction(null); setComment(""); setActionError(null); }}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={action.kind === "reject" ? "destructive" : "default"}
                className="h-8 min-w-24"
                onClick={action.kind === "approve" ? runApprove : runReject}
              >
                {action.kind === "approve" ? "Confirm approve" : "Confirm reject"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {ruleEditor ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="no-scrollbar max-h-[min(90vh,720px)] w-full max-w-xl overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{ruleEditor === "create" ? "Create workflow rule" : "Edit workflow rule"}</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="border-0 bg-transparent shadow-none hover:bg-muted/70 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                onClick={() => setRuleEditor(null)}
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <WorkflowRuleEditorForm
              initialRule={ruleEditor === "create" ? null : ruleEditor}
              existingRules={rules}
              onClose={() => setRuleEditor(null)}
              onSave={saveRule}
            />
          </div>
        </div>
      ) : null}

      {ruleDeleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRuleDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-rule-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-rule-title" className="text-sm font-semibold text-foreground">
              Delete workflow rule?
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              This will remove <span className="font-medium text-foreground">{ruleDeleteTarget.name}</span> from the rule library. This cannot be
              undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="h-8" type="button" onClick={() => setRuleDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="h-8"
                type="button"
                onClick={() => {
                  setRules((prev) => prev.filter((r) => r.id !== ruleDeleteTarget.id));
                  setRuleDeleteTarget(null);
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
