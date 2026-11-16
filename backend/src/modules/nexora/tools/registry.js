import { toJsonSchema } from '../jsonSchema.js';

/**
 * Nexora's tool registry: one list for every persona.
 *
 *   defineTool({ name, description, roles, requires?, kind, input, run | prepare + execute, label })
 *
 *   roles     which portal roles may use the tool ('ANY' or a list of RoleKeys), checked against the session
 *   requires  optional extra check on the session (e.g. a linked student profile); returns a reason or null
 *   kind      'read'   run(ctx, input) → { data, display? }; executes when the model calls it
 *             'action' prepare(ctx, input) → { payload, preview }; creates a PENDING action and nothing else.
 *                      execute(ctx, payload) → { result, summary } runs only from the person's confirm request.
 *
 * A tool never receives an identity from the model: `ctx.auth` is the authenticated session (tenant, user, roles,
 * profile ids), and every tool calls the module service that already enforces ownership for the same screen.
 */

const tools = new Map();

export function defineTool(spec) {
  if (tools.has(spec.name)) throw new Error(`Nexora tool ${spec.name} is defined twice.`);
  if (spec.kind === 'action' && (!spec.prepare || !spec.execute)) throw new Error(`Action tool ${spec.name} needs prepare and execute.`);
  if (spec.kind === 'read' && !spec.run) throw new Error(`Read tool ${spec.name} needs run.`);
  // Strict: an argument the schema does not declare (an invented userId, studentId, tenantId…) is rejected, not dropped.
  const input = spec.input.strict();
  const tool = { ...spec, input, inputSchema: toJsonSchema(input) };
  tools.set(spec.name, tool);
  return tool;
}

/** Why this session may not use the tool, or null when it may. */
export function denialReason(tool, auth) {
  const roles = auth?.roles ?? [];
  if (tool.roles !== 'ANY' && !tool.roles.some((role) => roles.includes(role))) return 'ROLE';
  const unmet = tool.requires?.(auth);
  return unmet ?? null;
}

/** The tools this session may use, in a stable (name) order so the request prefix stays cacheable. */
export function toolsFor(auth) {
  return [...tools.values()].filter((tool) => !denialReason(tool, auth)).sort((a, b) => a.name.localeCompare(b.name));
}

export const getTool = (name) => tools.get(name) ?? null;
export const allTools = () => [...tools.values()];
