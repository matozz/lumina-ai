import { z } from "zod";

export interface FixtureOutput {
  id: number;
  r: number; // 0-255
  g: number;
  b: number;
  dimmer: number; // 0-1
}

export interface FramePayload {
  beat: number;
  full: boolean;
  outputs: FixtureOutput[];
}

export interface LayoutCoord {
  id: number;
  x: number;
  y: number;
  type: string;
}

export interface CompileResult {
  success: boolean;
  fixture_count: number;
  layout_coords: LayoutCoord[];
  group_names: string[];
  phasers: { id: string; name: string }[];
  sequence_names: string[];
  errors: CompileError[];
  warnings: CompileError[];
}

export interface CompileError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface EngineStatePayload {
  is_playing: boolean;
  tempo: number;
  global_beat: number;
  active_phasers: { id: string; multiplier: number }[];
}

// -----------------------------------------------------------------------------
// Zod Schemas for ShowDSL
// -----------------------------------------------------------------------------

export const PatchDSLSchema = z.object({
  type: z.enum(["spot", "pixel"]),
  id_range: z.tuple([z.number(), z.number()]),
});

export const FormulaDefSchema = z.object({
  x: z.string(),
  y: z.string(),
  t_range: z.tuple([z.number(), z.number()]),
  count: z.number(),
  scale: z.number().optional(),
});

export const SvgPathDefSchema = z.object({
  d: z.string(),
  sample_count: z.number(),
  scale: z.number().optional(),
});

export const CustomFixturePosSchema = z.object({
  id: z.number(),
  x: z.number(),
  y: z.number(),
});

export const FromToSchema = z.union([z.string(), z.number()]);
export const EasingSchema = z.enum(["linear", "ease_in", "ease_out", "ease_in_out"]);

export const GeneratorDSLSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("matrix"),
    rows: z.number(),
    columns: z.number(),
    spacing: z.number(),
    origin: z.tuple([z.number(), z.number()]).optional(),
  }),
  z.object({
    shape: z.literal("circle"),
    rings: z.number(),
    increment: z.number(),
    gap: z.number(),
    center: z.tuple([z.number(), z.number()]).optional(),
  }),
  z.object({
    shape: z.literal("formula"),
    formula: FormulaDefSchema,
  }),
  z.object({
    shape: z.literal("svg_path"),
    svgPath: SvgPathDefSchema,
  }),
  z.object({
    shape: z.literal("custom"),
    fixtures: z.array(CustomFixturePosSchema),
  }),
]);

export const LayoutDSLSchema = z.object({
  type: z.literal("generator"),
  generator: GeneratorDSLSchema,
});

export const GroupDSLSchema = z.object({
  name: z.string(),
  fixtures: z.union([z.array(z.number()), z.object({ range: z.tuple([z.number(), z.number()]) })]),
  sort_by: z.string().optional(),
});

export const PhaserStepDSLSchema = z.object({
  values: z.object({
    color: z.string().optional(),
    dimmer: z.number().optional(),
  }),
  width: z.number().optional(),
  transition: z.number().optional(),
  accel: z.number().optional(),
  decel: z.number().optional(),
});

export const PhaseConfigDSLSchema = z.object({
  mode: z.enum(["spread", "grouped"]),
  spread: z.object({ from: z.number().min(0).max(100), to: z.number().min(0).max(100) }).optional(),
  grouped: z
    .object({
      group_size: z.number(),
      spread: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
    })
    .optional(),
});

export const PhaserDSLSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.string(),
  multiplier: z.number().optional(),
  steps: z.array(PhaserStepDSLSchema),
  phase: PhaseConfigDSLSchema,
});

export const TimelineActionDefDSLSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("phaser"),
    phaser: z.string(),
  }),
  z.object({
    type: z.literal("animate"),
    target: z.string(),
    from: FromToSchema,
    to: FromToSchema,
    easing: EasingSchema.optional(),
  }),
]);

export const TimelineEventDSLSchema = z.object({
  beat: z.number(),
  duration: z.number().optional(),
  action: TimelineActionDefDSLSchema,
});

export const TimelineDSLSchema = z.object({
  events: z.array(TimelineEventDSLSchema),
});

export const FullDSLSchema = z.object({
  meta: z.object({
    name: z.string(),
  }),
  patch: z.array(PatchDSLSchema),
  layout: LayoutDSLSchema,
  groups: z.array(GroupDSLSchema),
  phasers: z.array(PhaserDSLSchema),
  timeline: TimelineDSLSchema.optional(),
});

// -----------------------------------------------------------------------------
// Inferred Types
// -----------------------------------------------------------------------------

export type PatchDSL = z.infer<typeof PatchDSLSchema>;
export type FormulaDef = z.infer<typeof FormulaDefSchema>;
export type SvgPathDef = z.infer<typeof SvgPathDefSchema>;
export type CustomFixturePos = z.infer<typeof CustomFixturePosSchema>;
export type FromTo = z.infer<typeof FromToSchema>;
export type Easing = z.infer<typeof EasingSchema>;
export type GeneratorDSL = z.infer<typeof GeneratorDSLSchema>;
export type LayoutDSL = z.infer<typeof LayoutDSLSchema>;
export type GroupDSL = z.infer<typeof GroupDSLSchema>;
export type PhaserStepDSL = z.infer<typeof PhaserStepDSLSchema>;
export type PhaseConfigDSL = z.infer<typeof PhaseConfigDSLSchema>;
export type PhaserDSL = z.infer<typeof PhaserDSLSchema>;
export type TimelineActionDefDSL = z.infer<typeof TimelineActionDefDSLSchema>;
export type TimelineEventDSL = z.infer<typeof TimelineEventDSLSchema>;
export type TimelineDSL = z.infer<typeof TimelineDSLSchema>;
export type FullDSL = z.infer<typeof FullDSLSchema>;
