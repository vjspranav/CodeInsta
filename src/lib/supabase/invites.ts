export { validInvite } from "../../../packages/shared/src/validation";

export function safeReturnPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !/[\u0000-\u0020\u007f]/.test(value) && !value.includes("\\") && !value.startsWith("/auth/") ? value : "/";
}
