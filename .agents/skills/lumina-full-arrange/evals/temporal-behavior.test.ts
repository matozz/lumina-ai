import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { TemporalFingerprintReport, UserAssetPack } from "@/bridge/types";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const manifest = resolve(repoRoot, "src-tauri/Cargo.toml");
const basePackPath = resolve(
  repoRoot,
  ".agents/skills/lumina-full-arrange/evals/files/base-assets.lumina-assets.json",
);
const outputDirectory = mkdtempSync(join(tmpdir(), "lumina-temporal-skill-eval-"));

afterAll(() => rmSync(outputDirectory, { recursive: true, force: true }));

describe.sequential("lumina-full-arrange real runtime temporal evals", () => {
  it("covers normalized rate, ping-pong traversal, and high-speed aliasing", () => {
    const contactSheet = resolve(outputDirectory, "ping-pong-4x.svg");
    const report = analyze({
      effectId: "builtin.spatial.column-ping-pong",
      targetSetId: "zone-4x4-1",
      speeds: "all",
      previewFps: 30,
      contactSheet,
      contactSpeed: 4,
    });

    expect(report.fingerprints.map((item) => item.primary_events_per_beat)).toEqual([
      0.25, 0.5, 1, 2, 4, 8,
    ]);
    expect(report.fingerprints[2]).toMatchObject({
      speed: 1,
      graph_cycles_per_beat: 0.5,
      primary_events_per_beat: 1,
    });
    expect(report.fingerprints[2].spatial_centroid?.direction_reversals).toBeGreaterThanOrEqual(3);
    expect(report.fingerprints[4].aliasing.risk).toBe("caution");
    expect(report.fingerprints[5].aliasing.risk).toBe("severe");
    expect(readFileSync(contactSheet, "utf8")).toContain("<svg");
  }, 120_000);

  it("keeps Color Accent alive and declares topology-relative column partitions", () => {
    const accent = analyze({
      effectId: "builtin.color.pulse",
      targetSetId: "zone-4x4-1",
      speeds: "0.25,1",
      previewFps: 60,
    });
    for (const fingerprint of accent.fingerprints) {
      expect(fingerprint.intensity?.minimum).toBeGreaterThanOrEqual(0.1);
      expect(fingerprint.intensity?.maximum).toBeGreaterThan(0.8);
      expect(fingerprint.intensity?.variance).toBeGreaterThan(0.01);
      expect(fingerprint.on_duty_cycle).toBeUndefined();
      expect(fingerprint.strobe).toBeUndefined();
    }

    const pack = JSON.parse(readFileSync(basePackPath, "utf8")) as UserAssetPack;
    expect(pack.effects.some((effect) => effect.id === "builtin.strobe.safe-pulse")).toBe(false);
    for (const [effectId, expectedCount] of [
      ["builtin.intensity.chase", 2],
      ["builtin.spatial.column-thirds-triplet", 3],
      ["builtin.spatial.column-quarter-cascade", 4],
      ["builtin.color.column-prism", 4],
    ] as const) {
      const effect = pack.effects.find((candidate) => candidate.id === effectId)!;
      const spatial = effect.graph.nodes.find((node) => node.type === "spatial_phase");
      expect(spatial).toMatchObject({ type: "spatial_phase", partition_count: expectedCount });
    }
  }, 120_000);

  it("includes exact TargetSet topology in the fingerprint identity", () => {
    const zone25 = analyze({
      effectId: "builtin.transition.wipe",
      targetSetId: "zone-4x4-1",
      speeds: "1",
      previewFps: 60,
    });
    const zone100 = analyze({
      effectId: "builtin.transition.wipe",
      targetSetId: "zone-2x2-1",
      speeds: "1",
      previewFps: 60,
    });
    expect(zone25.identity.target_fixture_count).toBe(25);
    expect(zone100.identity.target_fixture_count).toBe(100);
    expect(zone25.cache_key).not.toBe(zone100.cache_key);
    expect(zone25.fingerprints[0].spatial_centroid?.path_distance).toBeGreaterThan(0);
    expect(zone100.fingerprints[0].spatial_centroid?.path_distance).toBeGreaterThan(0);
  }, 120_000);

  it("audits a generated project-local smooth accent through compile and render_at", () => {
    const pack = JSON.parse(readFileSync(basePackPath, "utf8")) as UserAssetPack;
    const source = pack.effects.find((effect) => effect.id === "builtin.color.pulse")!;
    const generated = structuredClone(source);
    generated.id = "project.eval.generated-smooth-accent";
    generated.name = "Generated Smooth Accent";
    generated.source = "project_local";
    for (const [parameterId, value] of [
      ["attack", 0.25],
      ["release", 0.45],
    ] as const) {
      const parameter = generated.parameters.find((candidate) => candidate.id === parameterId)!;
      if (parameter.schema.type !== "scalar") {
        throw new Error(`${parameterId} parameter must be scalar`);
      }
      parameter.schema.default = value;
      const envelope = generated.graph.nodes.find(
        (node) => node.type === "envelope" && node.id === parameter.graph_binding?.node_id,
      );
      if (!envelope || envelope.type !== "envelope") {
        throw new Error("Accent envelope is missing");
      }
      envelope[parameterId] = value;
    }
    pack.effects.push(generated);
    const generatedPackPath = resolve(outputDirectory, "generated-accent-pack.json");
    const contactSheet = resolve(outputDirectory, "generated-accent.svg");
    writeFileSync(generatedPackPath, `${JSON.stringify(pack, null, 2)}\n`);

    const report = analyze({
      packPath: generatedPackPath,
      effectId: generated.id,
      targetSetId: "zone-4x4-1",
      speeds: "1",
      previewFps: 60,
      contactSheet,
      contactSpeed: 1,
    });
    expect(report.behavior).toEqual({
      primary_event: "rise_fall_cycle",
      events_per_graph_cycle: 1,
    });
    expect(report.fingerprints[0].primary_events_per_beat).toBe(1);
    expect(report.fingerprints[0].intensity?.minimum).toBeGreaterThanOrEqual(0.1);
    expect(report.fingerprints[0].intensity?.maximum).toBeGreaterThan(0.8);
    expect(report.fingerprints[0].intensity?.variance).toBeGreaterThan(0.01);
    expect(report.fingerprints[0].on_duty_cycle).toBeUndefined();
    expect(report.fingerprints[0].strobe).toBeUndefined();
    expect(readFileSync(contactSheet, "utf8")).toContain("<svg");
  }, 120_000);
});

function analyze({
  packPath = basePackPath,
  effectId,
  targetSetId,
  speeds,
  previewFps,
  contactSheet,
  contactSpeed,
}: {
  packPath?: string;
  effectId: string;
  targetSetId: string;
  speeds: string;
  previewFps: number;
  contactSheet?: string;
  contactSpeed?: number;
}) {
  const args = [
    "run",
    "--quiet",
    "--manifest-path",
    manifest,
    "--example",
    "analyze_effect_temporal",
    "--",
    "--pack",
    packPath,
    "--effect-id",
    effectId,
    "--revision",
    "1",
    "--target-set-id",
    targetSetId,
    "--bpm",
    "128",
    "--speeds",
    speeds,
    "--preview-fps",
    String(previewFps),
  ];
  if (contactSheet) args.push("--contact-sheet", contactSheet);
  if (contactSpeed != null) args.push("--contact-speed", String(contactSpeed));
  return JSON.parse(
    execFileSync("cargo", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
  ) as TemporalFingerprintReport;
}
