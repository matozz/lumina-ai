import { describe, expect, it } from "vitest";
import type { AssetRef, ProjectBundle } from "@/bridge/types";
import {
  builtinArrangements,
  builtinEffects,
  builtinLayouts,
  builtinProjectTemplate,
} from "@/catalog/builtinCatalog";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import {
  appendExactRef,
  createCueAsset,
  createEffectAsset,
  duplicateArrangementAsset,
  exactAsset,
} from "./projectModel";
import {
  assetPackConflicts,
  createBaseAssetPack,
  createUserAssetPack,
  importUserAssetPack,
  replaceProjectAssetsFromPack,
  validateUserAssetPack,
} from "./userAssetPack";

describe("UserAssetPack V1", () => {
  it("exports the immutable built-in Catalog as a base pack", () => {
    const template = builtinProjectTemplate();
    const source = {
      template: structuredClone(template),
      layouts: structuredClone(builtinLayouts),
      effects: structuredClone(builtinEffects),
      arrangements: structuredClone(builtinArrangements),
    };
    const pack = createBaseAssetPack();

    expect(pack.name).toBe("Base Assets");
    expect(pack.source_project_id).toBe("builtin.project-template.authoring-starter");
    expect(pack.stages).toEqual([template.stage]);
    expect(pack.layouts).toEqual(builtinLayouts);
    expect(pack.effects).toEqual(builtinEffects);
    expect(pack.effects).toHaveLength(17);
    expect(pack.cues).toEqual(template.cues);
    expect(pack.cues).toEqual([]);
    expect(pack.arrangements).toEqual(builtinArrangements);
    expect(pack.arrangements.map((arrangement) => arrangement.id)).toEqual([
      "builtin.arrangement.house-128",
    ]);
    expect(validateUserAssetPack(pack)).toEqual({ success: true, data: pack, issues: [] });
    expect(template).toEqual(source.template);
    expect(builtinLayouts).toEqual(source.layouts);
    expect(builtinEffects).toEqual(source.effects);
    expect(builtinArrangements).toEqual(source.arrangements);
  });

  it("exports a dependency-complete pack and migrates it across projects", () => {
    const { bundle: source, effectRef, cueRef, arrangementRef } = projectWithPortableAssets();
    const pack = createUserAssetPack(source, "Touring Package");

    expect(validateUserAssetPack(pack)).toEqual({ success: true, data: pack, issues: [] });
    expect(pack.source_project_id).toBe("source-project");
    expect(pack.stages).toHaveLength(1);
    expect(pack.layouts).toHaveLength(1);
    expect(pack.effects.map((effect) => effect.id)).toContain(effectRef.id);
    expect(pack.cues.map((cue) => cue.id)).toContain(cueRef.id);
    expect(pack.arrangements.map((arrangement) => arrangement.id)).toContain(arrangementRef.id);

    const destination = createStarterProjectBundle();
    destination.manifest.project_id = "destination-project";
    const imported = importUserAssetPack(destination, pack);

    expect(exactAsset(imported.bundle.effects, effectRef)?.source).toBe("project_local");
    expect(exactAsset(imported.bundle.cues, cueRef)?.layers[0].effect_ref).toEqual(effectRef);
    expect(
      exactAsset(imported.bundle.arrangements, arrangementRef)?.tracks[0].clips?.[0].cue_ref,
    ).toEqual(cueRef);
    expect(imported.bundle.manifest.project_id).toBe("destination-project");
  });

  it("reports conflicts and can rename every conflicting dependency as one closure", () => {
    const { bundle: source, effectRef, cueRef, arrangementRef } = projectWithPortableAssets();
    source.stages[0].name = "Tour Stage";
    source.layouts.find((layout) => layout.id === source.stages[0].layout_ref.id)!.name =
      "Tour Matrix";
    const pack = createUserAssetPack(source, "Conflicting Package");
    const destination = conflictingDestination(pack);

    expect(assetPackConflicts(destination, pack).map((conflict) => conflict.kind)).toEqual([
      "stage",
      "layout",
      "effect",
      "cue",
      "arrangement",
    ]);
    expect(() => importUserAssetPack(destination, pack)).toThrow(/Asset pack conflicts/);

    const imported = importUserAssetPack(destination, pack, "rename");
    const renamed = imported.importedPack;
    const stage = renamed.stages[0];
    const layout = renamed.layouts[0];
    const effect = renamed.effects.find(
      (candidate) => candidate.id === `imported-${effectRef.id}`,
    )!;
    const cue = renamed.cues.find((candidate) => candidate.id === `imported-${cueRef.id}`)!;
    const arrangement = renamed.arrangements.find(
      (candidate) => candidate.id === `imported-${arrangementRef.id}`,
    )!;

    expect(stage.id).toBe(`imported-${pack.stages[0].id}`);
    expect(stage.layout_ref.id).toBe(layout.id);
    expect(cue.compatible_stage_ref.id).toBe(stage.id);
    expect(cue.layers[0].target_set_ref.stage_id).toBe(stage.id);
    expect(cue.layers[0].effect_ref.id).toBe(effect.id);
    expect(arrangement.tracks[0].clips?.[0].cue_ref.id).toBe(cue.id);
    expect(validateUserAssetPack(renamed).success).toBe(true);
    expect(imported.bundle.manifest.layout_refs).toContainEqual(toRef(layout));
    expect(imported.bundle.manifest.effect_refs).toContainEqual(toRef(effect));
    expect(imported.bundle.manifest.cue_refs).toContainEqual(toRef(cue));
    expect(imported.bundle.manifest.arrangement_refs).toContainEqual(toRef(arrangement));
  });

  it("replaces the complete asset set while preserving Project identity and references", () => {
    const { bundle: source, effectRef, cueRef, arrangementRef } = projectWithPortableAssets();
    source.stages[0].name = "Tour Stage";
    source.layouts.find((layout) => layout.id === source.stages[0].layout_ref.id)!.name =
      "Tour Matrix";
    const pack = createUserAssetPack(source, "Replacement Package");
    const destination = conflictingDestination(pack);
    destination.manifest.project_id = "destination-project";
    destination.manifest.name = "Destination Show";

    const replaced = replaceProjectAssetsFromPack(destination, pack);
    const stage = replaced.importedPack.stages[0];
    const layout = replaced.importedPack.layouts[0];
    const effect = replaced.importedPack.effects.find(
      (candidate) => candidate.id === effectRef.id,
    )!;
    const cue = replaced.importedPack.cues.find((candidate) => candidate.id === cueRef.id)!;
    const arrangement = replaced.importedPack.arrangements.find(
      (candidate) => candidate.id === arrangementRef.id,
    )!;

    expect(replaced.bundle.manifest).toMatchObject({
      project_id: "destination-project",
      name: "Destination Show",
      stage_ref: toRef(stage),
      active_arrangement_id: arrangement.id,
    });
    expect(replaced.bundle.effects).toEqual(replaced.importedPack.effects);
    expect(replaced.bundle.cues).toEqual(replaced.importedPack.cues);
    expect(replaced.bundle.arrangements).toEqual(replaced.importedPack.arrangements);
    expect(JSON.stringify(replaced.bundle)).not.toContain("Local Effect");
    expect(JSON.stringify(replaced.bundle)).not.toContain("Local Cue");
    expect(JSON.stringify(replaced.bundle)).not.toContain("Local Arrangement");
    expect(stage.revision).toBeGreaterThan(pack.stages[0].revision);
    expect(stage.layout_ref).toEqual(toRef(layout));
    expect(cue.compatible_stage_ref).toEqual(toRef(stage));
    expect(cue.layers[0].target_set_ref.stage_revision).toBe(stage.revision);
    expect(cue.layers[0].effect_ref).toEqual(toRef(effect));
    expect(arrangement.tracks[0].clips?.[0].cue_ref).toEqual(toRef(cue));
    expect(validateUserAssetPack(replaced.importedPack).success).toBe(true);
  });

  it("rejects replacement packs that cannot materialize a complete Project", () => {
    const pack = createBaseAssetPack();
    pack.arrangements = [];
    expect(validateUserAssetPack(pack).success).toBe(true);

    expect(() => replaceProjectAssetsFromPack(createStarterProjectBundle(), pack)).toThrow(
      /no Arrangement.*incremental import/,
    );
  });

  it("rejects Effects that omit the standard Color contract", () => {
    const { bundle, effectRef } = projectWithPortableAssets();
    const pack = createUserAssetPack(bundle, "Legacy Package");
    const legacyEffect = exactAsset(pack.effects, effectRef)!;
    legacyEffect.parameters = legacyEffect.parameters.filter(
      (parameter) => parameter.id !== "color",
    );

    const validation = validateUserAssetPack(pack);
    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.issues).toContainEqual(
        expect.objectContaining({ message: "Effect is missing the standard Color parameter" }),
      );
    }
    expect(() => importUserAssetPack(createStarterProjectBundle(), pack)).toThrow(
      /missing the standard Color parameter/,
    );
  });

  it("rejects unsynchronized Cue and Arrangement speed values before import", () => {
    const { bundle, cueRef, arrangementRef } = projectWithPortableAssets();
    const pack = createUserAssetPack(bundle, "Unsynchronized Package");
    const cue = exactAsset(pack.cues, cueRef)!;
    cue.layers[0]!.parameter_overrides = {
      ...cue.layers[0]!.parameter_overrides,
      speed: { type: "scalar", value: 0.75 },
    };
    const arrangement = exactAsset(pack.arrangements, arrangementRef)!;
    arrangement.tracks[0].clips![0]!.layer_overrides = [
      {
        layer_id: cue.layers[0]!.id,
        parameter_overrides: { speed: { type: "scalar", value: 1.25 } },
      },
    ];
    arrangement.tracks[0].automation_lanes = [
      {
        id: "invalid-speed",
        target: {
          scope: "cue_layer",
          clip_id: "portable-clip",
          layer_id: cue.layers[0].id,
          parameter_id: "speed",
        },
        keyframes: [
          {
            id: "invalid-speed-value",
            time_tick: 0,
            value: { type: "scalar", value: 1.5 },
            interpolation: "linear",
          },
        ],
      },
    ];

    const validation = validateUserAssetPack(pack);
    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining("Speed override") }),
          expect.objectContaining({
            path: expect.stringContaining("layer_overrides"),
            message: expect.stringContaining("Speed override"),
          }),
          expect.objectContaining({ message: expect.stringContaining("Speed automation") }),
        ]),
      );
    }
  });

  it("rejects invalid Cue layer seeds before import and preview compilation", () => {
    const { bundle, cueRef } = projectWithPortableAssets();
    const pack = createUserAssetPack(bundle, "Invalid Seed Package");
    const cue = exactAsset(pack.cues, cueRef)!;
    cue.layers[0]!.seed = "friendly-seed";

    const validation = validateUserAssetPack(pack);
    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.issues).toContainEqual({
        path: expect.stringContaining("layers[0].seed"),
        message: "Cue layer seed must contain exactly 16 hexadecimal characters",
      });
    }
    expect(() => importUserAssetPack(createStarterProjectBundle(), pack)).toThrow(
      /exactly 16 hexadecimal characters/,
    );
  });

  it("rejects malformed packs and missing transitive dependencies", () => {
    const { bundle } = projectWithPortableAssets();
    const pack = createUserAssetPack(bundle);
    const missingEffect = { ...structuredClone(pack), effects: [] };

    expect(validateUserAssetPack({ ...pack, schema_version: 2 }).success).toBe(false);
    const result = validateUserAssetPack(missingEffect);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ message: "Effect dependency is missing" }),
      );
    }
  });
});

function projectWithPortableAssets() {
  const bundle = createStarterProjectBundle();
  bundle.manifest.project_id = "source-project";
  const effect = createEffectAsset(bundle, "Portable Pulse");
  const effectRef = toRef(effect);
  bundle.effects.push(effect);
  appendExactRef(bundle.manifest.effect_refs, effectRef);

  const cue = createCueAsset(bundle, [effectRef], "Portable Cue");
  cue.layers[0].target_set_ref.target_set_id = "zone-2x2-1";
  const cueRef = toRef(cue);
  bundle.cues.push(cue);
  appendExactRef(bundle.manifest.cue_refs, cueRef);

  const sourceArrangement = bundle.arrangements[0];
  const arrangement = duplicateArrangementAsset(bundle, sourceArrangement, "Portable Sequence");
  arrangement.tracks[0].clips = [
    { id: "portable-clip", cue_ref: cueRef, start_tick: 0, duration_tick: 3_840 },
  ];
  const arrangementRef = toRef(arrangement);
  bundle.arrangements.push(arrangement);
  appendExactRef(bundle.manifest.arrangement_refs, arrangementRef);
  return { bundle, effectRef, cueRef, arrangementRef };
}

function conflictingDestination(pack: ReturnType<typeof createUserAssetPack>): ProjectBundle {
  const bundle = createStarterProjectBundle();
  bundle.stages[0].name = "Local Stage";
  bundle.layouts.find((layout) => layout.id === bundle.stages[0].layout_ref.id)!.name =
    "Local Matrix";

  const effect = structuredClone(
    pack.effects.find((candidate) => candidate.name === "Portable Pulse")!,
  );
  effect.name = "Local Effect";
  bundle.effects.push(effect);
  appendExactRef(bundle.manifest.effect_refs, toRef(effect));

  const cue = structuredClone(pack.cues.find((candidate) => candidate.name === "Portable Cue")!);
  cue.name = "Local Cue";
  bundle.cues.push(cue);
  appendExactRef(bundle.manifest.cue_refs, toRef(cue));

  const arrangement = structuredClone(
    pack.arrangements.find((candidate) => candidate.name === "Portable Sequence")!,
  );
  arrangement.name = "Local Arrangement";
  bundle.arrangements.push(arrangement);
  appendExactRef(bundle.manifest.arrangement_refs, toRef(arrangement));
  return bundle;
}

function toRef(asset: { id: string; revision: number }): AssetRef {
  return { id: asset.id, revision: asset.revision };
}
