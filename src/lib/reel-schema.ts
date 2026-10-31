import { z } from "zod";

export const TOPIC_AREAS = [
  "aosp", "os", "compilers", "distributed", "networking", "databases",
  "linkers", "virtualization", "architecture",
] as const;
export type TopicArea = (typeof TOPIC_AREAS)[number];

export const COLORS = ["blue", "green", "orange", "red", "purple", "gray"] as const;
export const ENTER_ANIMATIONS = ["fade", "pop", "slide-up", "draw"] as const;
export const colorSchema = z.enum(COLORS);
export const enterAnimationSchema = z.enum(ENTER_ANIMATIONS);
export type ReelColor = z.infer<typeof colorSchema>;
export type EnterAnimation = z.infer<typeof enterAnimationSchema>;

const nonempty = z.string().min(1);
const percentage = z.number().min(0).max(100);
const dimension = z.number().positive().max(100);
const base = {
  id: nonempty,
  at: z.number().int().nonnegative(),
  enter: enterAnimationSchema.default("fade"),
  color: colorSchema.optional(),
};
const positioned = {
  ...base,
  x: percentage,
  y: percentage,
  w: dimension.optional(),
  h: dimension.optional(),
};

export const FORMATS = ["dialogue", "whiteboard", "incident", "interview", "podcast", "explainer"] as const;
export const NODE_ICONS = [
  "client", "phone", "lb", "cdn", "cache", "db", "queue", "service", "worker", "storage", "search", "user",
] as const;
export const formatSchema = z.enum(FORMATS);
export const nodeIconSchema = z.enum(NODE_ICONS);
export type ReelFormat = z.infer<typeof formatSchema>;
export type NodeIcon = z.infer<typeof nodeIconSchema>;

export const castMemberSchema = z.strictObject({
  id: nonempty,
  name: nonempty,
  role: nonempty,
  /** Kokoro voice id, e.g. "am_michael". */
  voice: nonempty,
  color: colorSchema,
});
export const lineSchema = z.strictObject({ speaker: nonempty, text: nonempty });
export const MAX_LINES_PER_SCENE = 6;
export type CastMember = z.infer<typeof castMemberSchema>;
export type ReelLine = z.infer<typeof lineSchema>;

export const elementSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...positioned, type: z.literal("title"), text: nonempty }),
  z.strictObject({ ...positioned, type: z.literal("text"), text: nonempty }),
  z.strictObject({ ...positioned, type: z.literal("box"), text: nonempty, w: dimension, h: dimension }),
  z.strictObject({ ...base, type: z.literal("arrow"), from: nonempty, to: nonempty, label: z.string().optional() }),
  z.strictObject({ ...positioned, type: z.literal("code"), lang: nonempty, text: nonempty }),
  z.strictObject({ ...positioned, type: z.literal("list"), items: z.array(nonempty).min(1) }),
  z.strictObject({ ...base, type: z.literal("highlight"), target: nonempty }),
  // v2 elements
  z.strictObject({ ...positioned, type: z.literal("node"), label: nonempty, icon: nodeIconSchema }),
  z.strictObject({
    ...base,
    type: z.literal("flow"),
    from: nonempty,
    to: nonempty,
    label: z.string().optional(),
    count: z.number().int().min(1).max(5).default(3),
  }),
  // x is optional: bubbles align left/right by speaker unless positioned explicitly.
  z.strictObject({ ...base, type: z.literal("bubble"), x: percentage.optional(), y: percentage, w: dimension.optional(), h: dimension.optional(), speaker: nonempty, text: nonempty }),
  z.strictObject({
    ...positioned,
    type: z.literal("alert"),
    title: z.string().optional(),
    text: nonempty,
    level: z.enum(["critical", "warning"]).default("critical"),
  }),
  z.strictObject({ ...positioned, type: z.literal("metric"), value: nonempty, label: nonempty }),
]);

export const sceneSchema = z.strictObject({
  duration_ms: z.number().int().positive(),
  caption: z.string().max(120),
  narration: z.string().optional(),
  lines: z.array(lineSchema).min(1).max(MAX_LINES_PER_SCENE).optional(),
  elements: z.array(elementSchema).max(8),
}).superRefine((scene, ctx) => {
  const ids = new Set<string>();
  scene.elements.forEach((element, index) => {
    if (ids.has(element.id)) {
      ctx.addIssue({ code: "custom", path: ["elements", index, "id"], message: `Duplicate element id: ${element.id}` });
    }
    ids.add(element.id);
    if (element.at >= scene.duration_ms) {
      ctx.addIssue({ code: "custom", path: ["elements", index, "at"], message: "Element must enter before the scene ends" });
    }
  });
  // Resolve after collecting every ID so forward references are valid.
  scene.elements.forEach((element, index) => {
    const references: [string, string][] = element.type === "arrow" || element.type === "flow"
      ? [["from", element.from], ["to", element.to]]
      : element.type === "highlight" ? [["target", element.target]] : [];
    for (const [field, id] of references) {
      if (!ids.has(id)) {
        ctx.addIssue({ code: "custom", path: ["elements", index, field], message: `Reference must name an element in the same scene: ${id}` });
      }
    }
    if (element.type === "flow") {
      for (const [field, id] of [["from", element.from], ["to", element.to]] as const) {
        const target = scene.elements.find((candidate) => candidate.id === id);
        if (target && target.type !== "node" && target.type !== "box") {
          ctx.addIssue({ code: "custom", path: ["elements", index, field], message: `Flow endpoints must be node or box elements: ${id}` });
        }
      }
    }
  });
});

export const reelSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]),
  format: formatSchema.optional(),
  cast: z.array(castMemberSchema).min(1).max(4).optional(),
  title: nonempty,
  hook: nonempty,
  topic: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, "Expected a lowercase slash-separated topic path"),
  tags: z.array(nonempty),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  series: nonempty.optional(),
  series_index: z.number().int().positive().optional(),
  scenes: z.array(sceneSchema).min(3).max(10),
  takeaway: nonempty,
  sources: z.array(z.url()).optional(),
}).superRefine((reel, ctx) => {
  const cast = new Set<string>();
  reel.cast?.forEach((member, index) => {
    if (cast.has(member.id)) ctx.addIssue({ code: "custom", path: ["cast", index, "id"], message: `Duplicate cast id: ${member.id}` });
    cast.add(member.id);
  });
  const speaker = (path: (string | number)[], id: string) => {
    if (!cast.has(id)) ctx.addIssue({ code: "custom", path, message: `Speaker must name a cast member: ${id}` });
  };
  reel.scenes.forEach((scene, sceneIndex) => {
    scene.lines?.forEach((line, i) => speaker(["scenes", sceneIndex, "lines", i, "speaker"], line.speaker));
    scene.elements.forEach((element, i) => {
      if (element.type === "bubble") speaker(["scenes", sceneIndex, "elements", i, "speaker"], element.speaker);
    });
  });
  const duration = reel.scenes.reduce((total, scene) => total + scene.duration_ms, 0);
  if (duration < 20000 || duration > 90000) {
    ctx.addIssue({ code: "custom", path: ["scenes"], message: "Authored scenes must total 20–90 seconds (excluding hook and takeaway)" });
  }
});

export type ReelElement = z.infer<typeof elementSchema>;
export type ReelScene = z.infer<typeof sceneSchema>;
export type Reel = z.infer<typeof reelSchema>;
/** Input scripts may omit enter; validated output always includes it. */
export type ReelInput = z.input<typeof reelSchema>;
export type ReelValidationResult =
  | { ok: true; reel: Reel }
  | { ok: false; errors: string[] };

/** Validate a parsed JSON value. JSON syntax parsing belongs to the caller. */
export function validateReel(json: unknown): ReelValidationResult {
  const result = reelSchema.safeParse(json);
  if (result.success) return { ok: true, reel: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "reel"}: ${issue.message}`),
  };
}
