/**
 * Tool subsystem entry point.
 *
 * Importing this module guarantees the catalog is registered exactly once,
 * regardless of how many call sites pull it in (Next.js may evaluate modules in
 * multiple contexts). Downstream code should import registry helpers from here.
 */

import "@/core/tools/catalog";

export {
  getTool,
  listTools,
  getToolManifest,
  executeTool,
  ToolNotFoundError,
} from "@/core/tools/registry";
export type {
  ToolDefinition,
  ToolContext,
  ToolLimits,
  ToolPermission,
  ToolManifestEntry,
  ToolCallResult,
} from "@/core/tools/types";
export { PUBLIC_LIMITS } from "@/core/tools/types";
