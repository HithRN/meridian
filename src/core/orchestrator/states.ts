/**
 * The agent workflow state machine (§9).
 *
 * A research session advances through a fixed sequence of states; every
 * transition is recorded in the session trace so a reviewer can see exactly
 * what happened and in what order. Transitions are validated — the orchestrator
 * cannot skip DATA_VALIDATED or reach REPORT_READY without passing CRITIQUE.
 */

export const WORKFLOW_STATES = [
  "RECEIVED",
  "PLAN_CREATED",
  "DATA_VALIDATED",
  "HYPOTHESIS_DEFINED",
  "FEATURES_READY",
  "EXPERIMENTS_RUNNING",
  "RESULTS_READY",
  "CRITIQUE",
  "REPORT_READY",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** Allowed forward transitions. `FAILED` is reachable from any state. */
const TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  RECEIVED: ["PLAN_CREATED"],
  PLAN_CREATED: ["DATA_VALIDATED"],
  DATA_VALIDATED: ["HYPOTHESIS_DEFINED"],
  HYPOTHESIS_DEFINED: ["FEATURES_READY"],
  FEATURES_READY: ["EXPERIMENTS_RUNNING"],
  EXPERIMENTS_RUNNING: ["RESULTS_READY"],
  RESULTS_READY: ["CRITIQUE"],
  CRITIQUE: ["REPORT_READY"],
  REPORT_READY: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextState(from: WorkflowState): WorkflowState | null {
  return TRANSITIONS[from]?.[0] ?? null;
}

export function stateIndex(state: WorkflowState): number {
  return WORKFLOW_STATES.indexOf(state);
}

export class InvalidTransitionError extends Error {
  constructor(from: WorkflowState, to: WorkflowState) {
    super(`Invalid workflow transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}
