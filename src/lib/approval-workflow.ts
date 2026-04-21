/**
 * Rule-driven approval engine (SCM demo).
 * Separates: rule matching → step generation → execution (approve/reject).
 */

export type DocType = "PR" | "RFQ" | "PO";

export type AmountMode = "lt" | "range" | "gt" | "gte";

export type AmountCondition = {
  kind: "amount";
  mode: AmountMode;
  /** exclusive upper bound when mode === "lt" */
  max?: number;
  /** inclusive when mode === "range"; lower bound when mode === "gt" */
  min?: number;
};

export type DepartmentCondition = {
  kind: "department";
  departmentKey: string;
};

export type OriginatorRoleCondition = {
  kind: "originator_role";
  roleKey: string;
};

export type RuleCondition = AmountCondition | DepartmentCondition | OriginatorRoleCondition;

export type WorkflowRule = {
  id: string;
  name: string;
  /** Higher number wins when multiple rules match (more specific rules should use higher priority). */
  priority: number;
  docType: DocType;
  /** All conditions must match (AND). */
  conditions: RuleCondition[];
  /** Ordered approver roles — levels are implicit from array order. */
  approverRoleKeys: string[];
};

export type RoleDefinition = {
  key: string;
  label: string;
  /** Demo inbox actors mapped to this role. */
  demoActors: string[];
};

export const APPROVAL_ROLE_ORDER: RoleDefinition[] = [
  { key: "dept_manager", label: "Department Manager", demoActors: ["M. Ibrahim", "L. Kim"] },
  { key: "finance_manager", label: "Finance Manager", demoActors: ["F. Gomez"] },
  { key: "procurement_head", label: "Procurement Head", demoActors: ["A. Khan"] },
];

export const DEPARTMENT_OPTIONS = [
  { key: "ops", label: "Operations" },
  { key: "it", label: "IT Department" },
  { key: "finance", label: "Finance" },
  { key: "hr", label: "HR" },
] as const;

export const ORIGINATOR_ROLE_OPTIONS = [
  { key: "requestor", label: "Requestor" },
  { key: "buyer", label: "Buyer" },
] as const;

export function roleLabelForKey(roleKey: string): string {
  return APPROVAL_ROLE_ORDER.find((r) => r.key === roleKey)?.label ?? roleKey;
}

export type StepStatus = "pending" | "approved" | "rejected";

export type ApprovalStep = {
  level: number;
  roleKey: string;
  roleLabel: string;
  status: StepStatus;
  approverName?: string;
  decidedAt?: string;
  comment?: string;
};

export type WorkflowDocumentStatus = "draft" | "submitted" | "in_progress" | "approved" | "rejected";

export type WorkflowInstance = {
  id: string;
  documentRef: string;
  docType: DocType;
  title: string;
  amount: number;
  departmentKey?: string;
  originatorRoleKey?: string;
  documentStatus: WorkflowDocumentStatus;
  steps: ApprovalStep[];
  /** Index of the first pending step, or steps.length when complete / rejected at prior step. */
  currentStepIndex: number;
  submittedAt?: string;
  matchedRuleId?: string;
};

export type DocumentRuleInput = {
  docType: DocType;
  amount: number;
  departmentKey?: string;
  originatorRoleKey?: string;
};

/** Payload when a PR/RFQ/PO is submitted into the approval engine. */
export type SubmitApprovalDocumentInput = DocumentRuleInput & {
  documentRef: string;
  title: string;
};

function matchesAmount(docAmount: number, c: AmountCondition): boolean {
  if (c.mode === "lt") return c.max != null && docAmount < c.max;
  if (c.mode === "range") return c.min != null && c.max != null && docAmount >= c.min && docAmount <= c.max;
  if (c.mode === "gt") return c.min != null && docAmount > c.min;
  if (c.mode === "gte") return c.min != null && docAmount >= c.min;
  return false;
}

export function documentMatchesConditions(doc: DocumentRuleInput, conditions: RuleCondition[]): boolean {
  return conditions.every((c) => {
    if (c.kind === "amount") return matchesAmount(doc.amount, c);
    if (c.kind === "department") return doc.departmentKey === c.departmentKey;
    if (c.kind === "originator_role") return doc.originatorRoleKey === c.roleKey;
    return false;
  });
}

export type RulePickResult =
  | { rule: WorkflowRule; conflict: false }
  | { rule: WorkflowRule; conflict: true; tiedRuleIds: string[] }
  | { rule: null; conflict: false };

/**
 * Highest priority matching rule. If multiple rules share the top priority and all match, report conflict.
 */
export function pickMatchingRule(rules: WorkflowRule[], doc: DocumentRuleInput): RulePickResult {
  const applicable = rules
    .filter((r) => r.docType === doc.docType)
    .filter((r) => documentMatchesConditions(doc, r.conditions))
    .sort((a, b) => b.priority - a.priority);

  if (applicable.length === 0) return { rule: null, conflict: false };

  const topPriority = applicable[0].priority;
  const topBand = applicable.filter((r) => r.priority === topPriority);
  if (topBand.length > 1) {
    return {
      rule: topBand[0],
      conflict: true,
      tiedRuleIds: topBand.map((r) => r.id),
    };
  }
  return { rule: topBand[0], conflict: false };
}

export function buildStepsFromRule(rule: WorkflowRule): ApprovalStep[] {
  return rule.approverRoleKeys.map((roleKey, i) => ({
    level: i + 1,
    roleKey,
    roleLabel: roleLabelForKey(roleKey),
    status: "pending" as const,
  }));
}

export type CreateWorkflowResult =
  | { ok: true; instance: WorkflowInstance; conflict: boolean; tiedRuleIds?: string[] }
  | { ok: false; reason: string };

export function createWorkflowInstance(
  id: string,
  documentRef: string,
  docType: DocType,
  title: string,
  doc: Omit<DocumentRuleInput, "docType">,
  rules: WorkflowRule[]
): CreateWorkflowResult {
  const input: DocumentRuleInput = { docType, ...doc };
  const picked = pickMatchingRule(rules, input);
  if (!picked.rule) {
    return { ok: false, reason: "No workflow rule matches this document." };
  }
  const steps = buildStepsFromRule(picked.rule);
  const instance: WorkflowInstance = {
    id,
    documentRef,
    docType,
    title,
    amount: doc.amount,
    departmentKey: doc.departmentKey,
    originatorRoleKey: doc.originatorRoleKey,
    documentStatus: "submitted",
    steps,
    currentStepIndex: 0,
    submittedAt: new Date().toISOString(),
    matchedRuleId: picked.rule.id,
  };
  if ("conflict" in picked && picked.conflict && "tiedRuleIds" in picked) {
    return { ok: true, instance, conflict: true, tiedRuleIds: picked.tiedRuleIds };
  }
  return { ok: true, instance, conflict: false };
}

function isOpenStatus(s: WorkflowDocumentStatus): boolean {
  return s === "submitted" || s === "in_progress";
}

export type StepActionResult =
  | { ok: true; instance: WorkflowInstance }
  | { ok: false; reason: string };

/**
 * Approve the current pending level only (no skipping). Caller must pass the acting user's role key.
 */
export function approveCurrentStep(
  instance: WorkflowInstance,
  actorName: string,
  actorRoleKey: string,
  comment?: string
): StepActionResult {
  if (!isOpenStatus(instance.documentStatus)) {
    return { ok: false, reason: "This workflow is already closed." };
  }
  const idx = instance.currentStepIndex;
  if (idx < 0 || idx >= instance.steps.length) {
    return { ok: false, reason: "There is no pending approval step." };
  }
  const step = instance.steps[idx];
  if (step.status !== "pending") {
    return { ok: false, reason: "Current step is not pending." };
  }
  if (step.roleKey !== actorRoleKey) {
    return { ok: false, reason: "Your role is not authorized for this approval level." };
  }

  const now = new Date().toISOString();
  const steps = instance.steps.map((s, i) =>
    i === idx
      ? { ...s, status: "approved" as const, approverName: actorName, decidedAt: now, comment: comment?.trim() || undefined }
      : s
  );
  const nextIndex = idx + 1;
  const allDone = nextIndex >= steps.length;
  const next: WorkflowInstance = {
    ...instance,
    steps,
    currentStepIndex: allDone ? steps.length : nextIndex,
    documentStatus: allDone ? "approved" : "in_progress",
  };
  return { ok: true, instance: next };
}

/**
 * Rejection stops the workflow immediately; no further levels are processed.
 */
export function rejectCurrentStep(
  instance: WorkflowInstance,
  actorName: string,
  actorRoleKey: string,
  comment?: string
): StepActionResult {
  if (!isOpenStatus(instance.documentStatus)) {
    return { ok: false, reason: "This workflow is already closed." };
  }
  const idx = instance.currentStepIndex;
  if (idx < 0 || idx >= instance.steps.length) {
    return { ok: false, reason: "There is no pending approval step." };
  }
  const step = instance.steps[idx];
  if (step.status !== "pending") {
    return { ok: false, reason: "Current step is not pending." };
  }
  if (step.roleKey !== actorRoleKey) {
    return { ok: false, reason: "Your role is not authorized to reject at this level." };
  }

  const now = new Date().toISOString();
  const steps = instance.steps.map((s, i) =>
    i === idx
      ? { ...s, status: "rejected" as const, approverName: actorName, decidedAt: now, comment: comment?.trim() || undefined }
      : s
  );
  const next: WorkflowInstance = {
    ...instance,
    steps,
    currentStepIndex: idx,
    documentStatus: "rejected",
  };
  return { ok: true, instance: next };
}

export function pendingStep(instance: WorkflowInstance): ApprovalStep | null {
  if (!isOpenStatus(instance.documentStatus)) return null;
  const idx = instance.currentStepIndex;
  if (idx < 0 || idx >= instance.steps.length) return null;
  const s = instance.steps[idx];
  return s.status === "pending" ? s : null;
}

export function inboxInstancesForRole(instances: WorkflowInstance[], roleKey: string): WorkflowInstance[] {
  return instances.filter((w) => {
    const p = pendingStep(w);
    return p != null && p.roleKey === roleKey;
  });
}

export function newRuleId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rule-${Date.now()}`;
}

export function newWorkflowId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `wf-${Date.now()}`;
}

/** Starter rules: PR tiers from spec; RFQ/PO use scaled thresholds for demo consistency. */
export const DEFAULT_WORKFLOW_RULES: WorkflowRule[] = [
  {
    id: "pr-small",
    name: "PR under $1,000",
    priority: 30,
    docType: "PR",
    conditions: [{ kind: "amount", mode: "lt", max: 1000 }],
    approverRoleKeys: ["dept_manager"],
  },
  {
    id: "pr-mid",
    name: "PR $1,000 – $10,000",
    priority: 30,
    docType: "PR",
    conditions: [{ kind: "amount", mode: "range", min: 1000, max: 10_000 }],
    approverRoleKeys: ["dept_manager", "finance_manager"],
  },
  {
    id: "pr-large",
    name: "PR over $10,000",
    priority: 30,
    docType: "PR",
    conditions: [{ kind: "amount", mode: "gt", min: 10_000 }],
    approverRoleKeys: ["dept_manager", "finance_manager", "procurement_head"],
  },
  {
    id: "pr-finance-dept",
    name: "PR (Finance dept) — extra control",
    priority: 40,
    docType: "PR",
    conditions: [
      { kind: "department", departmentKey: "finance" },
      { kind: "amount", mode: "gte", min: 5000 },
    ],
    approverRoleKeys: ["dept_manager", "finance_manager", "procurement_head"],
  },
  {
    id: "rfq-small",
    name: "RFQ under $5,000",
    priority: 30,
    docType: "RFQ",
    conditions: [{ kind: "amount", mode: "lt", max: 5000 }],
    approverRoleKeys: ["dept_manager"],
  },
  {
    id: "rfq-mid",
    name: "RFQ $5,000 – $50,000",
    priority: 30,
    docType: "RFQ",
    conditions: [{ kind: "amount", mode: "range", min: 5000, max: 50_000 }],
    approverRoleKeys: ["dept_manager", "finance_manager"],
  },
  {
    id: "rfq-large",
    name: "RFQ over $50,000",
    priority: 30,
    docType: "RFQ",
    conditions: [{ kind: "amount", mode: "gt", min: 50_000 }],
    approverRoleKeys: ["dept_manager", "finance_manager", "procurement_head"],
  },
  {
    id: "po-small",
    name: "PO under $25,000",
    priority: 30,
    docType: "PO",
    conditions: [{ kind: "amount", mode: "lt", max: 25_000 }],
    approverRoleKeys: ["dept_manager"],
  },
  {
    id: "po-mid",
    name: "PO $25,000 – $100,000",
    priority: 30,
    docType: "PO",
    conditions: [{ kind: "amount", mode: "range", min: 25_000, max: 100_000 }],
    approverRoleKeys: ["dept_manager", "finance_manager"],
  },
  {
    id: "po-large",
    name: "PO over $100,000",
    priority: 30,
    docType: "PO",
    conditions: [{ kind: "amount", mode: "gt", min: 100_000 }],
    approverRoleKeys: ["dept_manager", "finance_manager", "procurement_head"],
  },
];

/** Demo inbox: mixed states using the same engine as runtime. */
export function buildInitialDemoInstances(rules: WorkflowRule[]): WorkflowInstance[] {
  const out: WorkflowInstance[] = [];

  const w1 = createWorkflowInstance(newWorkflowId(), "PR-2459", "PR", "Industrial fittings restock", { amount: 12_800, departmentKey: "ops" }, rules);
  if (w1.ok) {
    let inst = w1.instance;
    const a = approveCurrentStep(inst, "M. Ibrahim", "dept_manager", "Within department spend plan");
    if (a.ok) inst = a.instance;
    out.push(inst);
  }

  const w2 = createWorkflowInstance(newWorkflowId(), "RFQ-884", "RFQ", "Electrical enclosures RFQ", { amount: 18_400 }, rules);
  if (w2.ok) out.push(w2.instance);

  const w3 = createWorkflowInstance(
    newWorkflowId(),
    "PO-991",
    "PO",
    "Generator set purchase",
    { amount: 150_000, departmentKey: "it" },
    rules
  );
  if (w3.ok) {
    let inst = w3.instance;
    const a1 = approveCurrentStep(inst, "M. Ibrahim", "dept_manager");
    if (a1.ok) inst = a1.instance;
    const a2 = approveCurrentStep(inst, "F. Gomez", "finance_manager", "Capex validated");
    if (a2.ok) inst = a2.instance;
    out.push(inst);
  }

  return out;
}