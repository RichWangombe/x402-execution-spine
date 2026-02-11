import { PermissionCheckInput, PermissionCheckResult } from "./settlement.js";

export type PermissionVerifier = (
  input: PermissionCheckInput
) => Promise<PermissionCheckResult>;

export async function ensurePermission(
  input: PermissionCheckInput,
  verify: PermissionVerifier
): Promise<PermissionCheckResult> {
  if ((process.env.X402_MODE ?? "mock") === "mock") {
    return {
      approved: true,
      permissionId: input.permissionId ?? `mock-${input.workflowId}`
    };
  }

  const result = await verify(input);
  if (!result.approved) {
    throw new Error(`Permission denied: ${result.reason ?? "unknown"}`);
  }

  return result;
}
