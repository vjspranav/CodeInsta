import { TOPIC_AREAS, type TopicArea } from "./reel-schema";

export const AREA_INFO: Record<TopicArea, { label: string; blurb: string; emoji: string }> = {
  aosp: { label: "Android internals", blurb: "Binder, Treble, the build system", emoji: "🤖" },
  os: { label: "Operating systems", blurb: "Scheduling, memory, syscalls", emoji: "🧠" },
  compilers: { label: "Compilers", blurb: "Parsing, IR, optimization passes", emoji: "⚙️" },
  distributed: { label: "Distributed systems", blurb: "Consensus, replication, failure modes", emoji: "🌐" },
  networking: { label: "Networking", blurb: "TCP, DNS, TLS, packets on the wire", emoji: "📡" },
  databases: { label: "Databases", blurb: "Indexes, transactions, storage engines", emoji: "🗄️" },
  linkers: { label: "Linkers & loaders", blurb: "ELF, symbols, relocation, dynamic loading", emoji: "🔗" },
  virtualization: { label: "Virtualization", blurb: "Hypervisors, containers, VMs", emoji: "📦" },
  architecture: { label: "Computer architecture", blurb: "Caches, pipelines, memory ordering", emoji: "🔬" },
};

export const areaLabel = (area: string) => AREA_INFO[area as TopicArea]?.label ?? area;
export const AREAS = TOPIC_AREAS;
export const MAX_ONBOARDING_REQUESTS = 3;
export const REQUEST_MIN = 3;
export const REQUEST_MAX = 200;
export const PENDING_LIMIT_MESSAGE =
  "You already have 5 requests waiting for review. Wait for a decision before adding more.";

export type TopicRequest = {
  id: string;
  user_id: string;
  body: string;
  area: string | null;
  status: "pending" | "approved" | "rejected" | "done";
  created_at: string;
  fulfilled_reel_id: string | null;
};

export function requestError(error: { code?: string; message?: string }): string {
  if (error.code === "P0001" || /too many pending/i.test(error.message ?? "")) return PENDING_LIMIT_MESSAGE;
  return "Could not save your request. Try again.";
}
