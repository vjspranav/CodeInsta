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

export const elementSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...positioned, type: z.literal("title"), text: nonempty }),
  z.strictObject({ ...positioned, type: z.literal("text"), text: nonempty }),
  z.strictObject({ ...positioned, type: z.literal("box"), text: nonempty, w: dimension, h: dimension }),
  z.strictObject({ ...base, type: z.literal("arrow"), from: nonempty, to: nonempty, label: z.string().optional() }),
  z.strictObject({ ...positioned, type: z.literal("code"), lang: nonempty, text: nonempty }),
  z.strictObject({ ...positioned, type: z.literal("list"), items: z.array(nonempty).min(1) }),
  z.strictObject({ ...base, type: z.literal("highlight"), target: nonempty }),
]);

export const sceneSchema = z.strictObject({
  duration_ms: z.number().int().positive(),
  caption: z.string().max(120),
  narration: z.string().optional(),
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
    const references: [string, string][] = element.type === "arrow"
      ? [["from", element.from], ["to", element.to]]
      : element.type === "highlight" ? [["target", element.target]] : [];
    for (const [field, id] of references) {
      if (!ids.has(id)) {
        ctx.addIssue({ code: "custom", path: ["elements", index, field], message: `Reference must name an element in the same scene: ${id}` });
      }
    }
  });
});

export const reelSchema = z.strictObject({
  version: z.literal(1),
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
