/** Shared types for the "Update plan from chat" AI engine (P1). */

export interface PlanOp {
  type: string;
  // cascade annotation added server-side after normalization
  _cascade?: string;
  // normalized display fields (resolved from T#/R# refs)
  taskId?: string;
  taskTitle?: string;
  onId?: string;
  onTitle?: string;
  parentId?: string;
  refId?: string;
  // all raw op fields are kept as-is
  [key: string]: unknown;
}

export interface PlanGroup {
  quote: string;
  ops: PlanOp[];
}

export interface PlanResult {
  groups: PlanGroup[];
}
