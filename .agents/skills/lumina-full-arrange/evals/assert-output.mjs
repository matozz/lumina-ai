import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [mode, inputPathArg, runDirectoryArg] = process.argv.slice(2);
if (!mode || !runDirectoryArg) {
  throw new Error(
    "Usage: node assert-output.mjs <base-create|project-modify|trigger-boundary> <input-or-dash> <run-directory>",
  );
}

const runDirectory = resolve(runDirectoryArg);
const outputDirectory = resolve(runDirectory, "outputs");
const transcriptPath = resolve(runDirectory, "transcript.md");
const transcript = existsSync(transcriptPath) ? readFileSync(transcriptPath, "utf8") : "";
const inputPath = inputPathArg === "-" ? null : resolve(inputPathArg);
const expectations = [];

if (mode === "trigger-boundary") gradeTriggerBoundary();
else gradePack(mode);

const passed = expectations.filter((item) => item.passed).length;
const result = {
  expectations,
  summary: {
    passed,
    failed: expectations.length - passed,
    total: expectations.length,
    pass_rate: expectations.length === 0 ? 0 : passed / expectations.length,
  },
  claims: [],
  user_notes_summary: { uncertainties: [], needs_review: [], workarounds: [] },
  eval_feedback: {
    suggestions: [],
    overall:
      "Assertions cover structural safety and eval-specific preservation; musical quality remains a viewer judgment.",
  },
};
writeFileSync(resolve(runDirectory, "grading.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary));

function gradePack(packMode) {
  const input = inputPath && existsSync(inputPath) ? readJson(inputPath) : null;
  const packFiles = existsSync(outputDirectory)
    ? readdirSync(outputDirectory)
        .filter((name) => name.endsWith(".lumina-assets.json"))
        .map((name) => resolve(outputDirectory, name))
    : [];
  const outputPath = packFiles[0];
  const output = outputPath ? safelyReadJson(outputPath) : null;
  const structural = output
    ? validatePackStructure(output)
    : ["No readable output Project Pack found"];

  const outputValid = Boolean(output) && structural.length === 0 && readSemanticStatus();
  const inputSafe =
    Boolean(inputPath && outputPath) &&
    resolve(inputPath) !== resolve(outputPath) &&
    inputHashUnchanged();
  if (packMode === "project-modify") {
    add(
      "The output is a schema-, reference-, exact-ref-, and semantic-valid UserAssetPack V1 and the input hash is unchanged.",
      outputValid && inputSafe,
      structural.length > 0
        ? structural.join("; ")
        : `semantic=${readSemanticStatus()}; inputSafe=${inputSafe}; output=${outputPath ?? "missing"}`,
    );
  } else {
    add(
      "The output is a schema-, reference-, exact-ref-, and semantic-valid UserAssetPack V1.",
      outputValid,
      structural.length > 0
        ? structural.join("; ")
        : `Pack structure and real semantic harness status: ${readSemanticStatus()}`,
    );
    add(
      "The input file hash is unchanged and the output uses a different filename.",
      inputSafe,
      inputPath && outputPath
        ? `input=${inputPath}; output=${outputPath}; recorded hash matches=${inputHashUnchanged()}`
        : "Missing input or output path",
    );
  }

  if (!input || !output) {
    while (expectations.length < 6) {
      const index = expectations.length;
      add(
        `Eval-specific pack assertion ${index + 1}`,
        false,
        "Input or output pack is unavailable",
      );
    }
    return;
  }

  if (packMode === "base-create") gradeBaseCreate(input, output);
  else gradeProjectModify(input, output);
}

function gradeBaseCreate(input, output) {
  const builtinsEqual = sharedBuiltinAssets(input, output).every(
    ({ inputAsset, outputAsset }) => canonical(inputAsset) === canonical(outputAsset),
  );
  const newEffects = output.effects.filter((asset) => !findExact(input.effects, asset));
  const newCues = output.cues.filter((asset) => !findExact(input.cues, asset));
  const newArrangements = output.arrangements.filter(
    (asset) => !findExact(input.arrangements, asset),
  );
  add(
    "Every built-in asset present in both input and output is deeply unchanged; every created or customized Effect is project_local and every created Cue/Arrangement has a non-built-in ID.",
    builtinsEqual &&
      newEffects.every(
        (asset) => asset.source === "project_local" && !asset.id.startsWith("builtin."),
      ) &&
      newCues.every((asset) => !asset.id.startsWith("builtin.")) &&
      newArrangements.every((asset) => !asset.id.startsWith("builtin.")) &&
      newCues.length > 0 &&
      newArrangements.length > 0,
    `builtinsEqual=${builtinsEqual}; newEffects=${newEffects.length}; newCues=${newCues.length}; newArrangements=${newArrangements.length}`,
  );

  const arrangement = output.arrangements.find((asset) => asset.name === "Midnight Geometry 128");
  const clips = arrangement?.tracks.flatMap((track) => track.clips ?? []) ?? [];
  add(
    "`Midnight Geometry 128` uses PPQ 960, 128 BPM, 4/4, 122880 total ticks, legal integer Clip/keyframe ranges, and has no unexplained empty tail.",
    Boolean(arrangement) &&
      arrangement.ppq === 960 &&
      arrangement.tempo_map.points[0]?.bpm === 128 &&
      arrangement.time_signatures[0]?.numerator === 4 &&
      arrangement.time_signatures[0]?.denominator === 4 &&
      arrangement.length_ticks === 122880 &&
      coversRange(clips, 0, 122880),
    arrangement
      ? `ppq=${arrangement.ppq}; bpm=${arrangement.tempo_map.points[0]?.bpm}; length=${arrangement.length_ticks}; fullCoverage=${coversRange(clips, 0, 122880)}`
      : "Arrangement not found",
  );
  add(
    "CueClips reference Cues only and contain no TargetSet field; exact Cue/Effect/Stage/Layout dependencies resolve.",
    validatePackStructure(output).length === 0 && allClipsHaveNoTargeting(output),
    `structuralIssues=${validatePackStructure(output).join("; ") || "none"}; cueClipTargetingAbsent=${allClipsHaveNoTargeting(output)}`,
  );
  add(
    "The transcript includes the pack inventory, Effect/Cue audit, confirmed full Arrangement brief, and validation handoff without exposing raw Layer IDs.",
    /inventory|清单/i.test(transcript) &&
      /audit|审查/i.test(transcript) &&
      /brief/i.test(transcript) &&
      /valid|校验/i.test(transcript) &&
      !/layer_[a-z0-9]{8,}/i.test(transcript),
    `transcriptChars=${transcript.length}; exposesRawLayerId=${/layer_[a-z0-9]{8,}/i.test(transcript)}`,
  );
}

function gradeProjectModify(input, output) {
  const source = input.arrangements.find((asset) => asset.name === "House 128 Custom");
  const draft = output.arrangements.find(
    (asset) => asset.name === "House 128 Custom – Bars 29–36 Draft",
  );
  const sourceClips = source?.tracks.flatMap((track) => track.clips ?? []) ?? [];
  const draftClips = draft?.tracks.flatMap((track) => track.clips ?? []) ?? [];
  const sourceLanes = source?.tracks.flatMap((track) => track.automation_lanes ?? []) ?? [];
  const draftLanes = draft?.tracks.flatMap((track) => track.automation_lanes ?? []) ?? [];
  const barTicks = 3840;
  const sourceEnd = sourceClips.length
    ? Math.max(...sourceClips.map((clip) => clip.start_tick + clip.duration_tick))
    : 0;

  add(
    "The transcript reports actual 132 BPM despite the name, PPQ 960, 4/4, 64 bars, the source occupied end at bar 28, 39 existing Clips, four automation lanes, and the original empty tail.",
    ["132", "960", "4/4", "64", "28", "39"].every((token) => transcript.includes(token)) &&
      /four automation|4 automation|4 条|四条/i.test(transcript) &&
      /empty tail|空尾/i.test(transcript) &&
      sourceEnd === 28 * barTicks,
    `sourceEnd=${sourceEnd}; transcriptChars=${transcript.length}`,
  );
  add(
    "The output contains a new non-built-in Arrangement variant with 132 BPM and 245760 ticks; it preserves all source Clips and automation before bar 29 exactly.",
    Boolean(draft && source) &&
      !draft.id.startsWith("builtin.") &&
      draft.id !== source.id &&
      draft.tempo_map.points[0]?.bpm === 132 &&
      draft.length_ticks === 245760 &&
      sourceClips.every((clip) =>
        draftClips.some((candidate) => canonical(candidate) === canonical(clip)),
      ) &&
      sourceLanes.every((lane) =>
        draftLanes.some((candidate) => canonical(candidate) === canonical(lane)),
      ),
    draft
      ? `idChanged=${draft.id !== source?.id}; bpm=${draft.tempo_map.points[0]?.bpm}; length=${draft.length_ticks}; sourceClips=${sourceClips.length}; draftClips=${draftClips.length}`
      : "Draft Arrangement not found",
  );

  const sourceClipKeys = new Set(sourceClips.map(canonical));
  const addedClips = draftClips.filter((clip) => !sourceClipKeys.has(canonical(clip)));
  const addedLanes = draftLanes.filter(
    (lane) => !sourceLanes.some((candidate) => canonical(candidate) === canonical(lane)),
  );
  add(
    "New content is confined to bars 29-36 and there are no Clips or keyframes in bars 37-64.",
    addedClips.length > 0 &&
      addedClips.every(
        (clip) =>
          clip.start_tick >= 28 * barTicks && clip.start_tick + clip.duration_tick <= 36 * barTicks,
      ) &&
      draftClips.every((clip) => clip.start_tick < 36 * barTicks) &&
      addedLanes.every((lane) =>
        lane.keyframes.every(
          (keyframe) => keyframe.time_tick >= 28 * barTicks && keyframe.time_tick < 36 * barTicks,
        ),
      ),
    `addedClips=${addedClips.length}; addedLanes=${addedLanes.length}`,
  );
  add(
    "Unrelated Effects/Cues and built-ins are unchanged; any copied asset is project-local and exact references resolve.",
    output.effects.every((asset) => {
      const original = findExact(input.effects, asset);
      return original
        ? canonical(original) === canonical(asset)
        : asset.source === "project_local" && !asset.id.startsWith("builtin.");
    }) &&
      output.cues.every((asset) => {
        const original = findExact(input.cues, asset);
        return original
          ? canonical(original) === canonical(asset)
          : !asset.id.startsWith("builtin.");
      }) &&
      validatePackStructure(output).length === 0,
    `structuralIssues=${validatePackStructure(output).join("; ") || "none"}`,
  );
  add(
    "CueClips contain no targeting field, and the transcript states the preservation boundary and intentional empty tail without exposing raw Layer IDs.",
    allClipsHaveNoTargeting(output) &&
      /preserv|保留/i.test(transcript) &&
      /empty tail|空尾/i.test(transcript) &&
      !/layer_[a-z0-9]{8,}/i.test(transcript),
    `cueClipTargetingAbsent=${allClipsHaveNoTargeting(output)}; exposesRawLayerId=${/layer_[a-z0-9]{8,}/i.test(transcript)}`,
  );
}

function gradeTriggerBoundary() {
  const decisionPath = resolve(outputDirectory, "trigger-decisions.json");
  const decision = existsSync(decisionPath) ? safelyReadJson(decisionPath) : null;
  const byId = new Map(
    Array.isArray(decision?.decisions)
      ? decision.decisions.map((item) => [String(item.id).toUpperCase(), item])
      : [],
  );
  add(
    "The decision file is valid JSON and classifies A and E as trigger=true.",
    byId.get("A")?.trigger === true && byId.get("E")?.trigger === true,
    decision
      ? `A=${byId.get("A")?.trigger}; E=${byId.get("E")?.trigger}`
      : "Decision JSON missing or invalid",
  );
  add(
    "The decision file classifies B, C, and D as trigger=false.",
    ["B", "C", "D"].every((id) => byId.get(id)?.trigger === false),
    `B=${byId.get("B")?.trigger}; C=${byId.get("C")?.trigger}; D=${byId.get("D")?.trigger}`,
  );
  add(
    "The rationale distinguishes full Arrangement collaboration from single-asset, single-point, and Timeline UI work.",
    /full|complete|完整/i.test(JSON.stringify(decision)) &&
      /single|one|单个|单点/i.test(JSON.stringify(decision)) &&
      /ui|timeline/i.test(JSON.stringify(decision)),
    `decisionChars=${JSON.stringify(decision).length}`,
  );
  const packs = existsSync(outputDirectory)
    ? readdirSync(outputDirectory).filter((name) => name.endsWith(".lumina-assets.json"))
    : [];
  add("No Lumina asset pack is generated.", packs.length === 0, `packFiles=${packs.length}`);
}

function validatePackStructure(pack) {
  const issues = [];
  if (pack?.schema_version !== 1) issues.push("schema_version is not 1");
  for (const key of ["stages", "layouts", "effects", "cues", "arrangements"]) {
    if (!Array.isArray(pack?.[key])) issues.push(`${key} is not an array`);
  }
  if (issues.length) return issues;
  const layouts = new Set(pack.layouts.map(identity));
  const stages = new Map(pack.stages.map((asset) => [identity(asset), asset]));
  const effects = new Map(pack.effects.map((asset) => [identity(asset), asset]));
  const cues = new Map(pack.cues.map((asset) => [identity(asset), asset]));
  for (const stage of pack.stages) {
    if (!layouts.has(identity(stage.layout_ref)))
      issues.push(`missing Layout ${identity(stage.layout_ref)}`);
  }
  for (const cue of pack.cues) {
    const stage = stages.get(identity(cue.compatible_stage_ref));
    if (!stage) issues.push(`missing Stage ${identity(cue.compatible_stage_ref)}`);
    for (const layer of cue.layers ?? []) {
      if (!effects.has(identity(layer.effect_ref)))
        issues.push(`missing Effect ${identity(layer.effect_ref)}`);
      if (
        !stage?.target_sets?.some((target) => target.id === layer.target_set_ref?.target_set_id)
      ) {
        issues.push(`missing TargetSet for Cue ${cue.id}`);
      }
    }
  }
  for (const arrangement of pack.arrangements) {
    for (const track of arrangement.tracks ?? []) {
      const clips = track.clips ?? [];
      for (const clip of clips) {
        if (!cues.has(identity(clip.cue_ref))) issues.push(`missing Cue ${identity(clip.cue_ref)}`);
        if (!Number.isInteger(clip.start_tick) || !Number.isInteger(clip.duration_tick))
          issues.push(`non-integer Clip tick ${clip.id}`);
        if (
          clip.start_tick < 0 ||
          clip.duration_tick <= 0 ||
          clip.start_tick + clip.duration_tick > arrangement.length_ticks
        ) {
          issues.push(`out-of-range Clip ${clip.id}`);
        }
      }
      for (const lane of track.automation_lanes ?? []) {
        if (!lane.keyframes.every((keyframe) => Number.isInteger(keyframe.time_tick)))
          issues.push(`non-integer keyframe ${lane.id}`);
        if (
          !lane.keyframes.every(
            (keyframe) => keyframe.time_tick >= 0 && keyframe.time_tick <= arrangement.length_ticks,
          )
        )
          issues.push(`out-of-range keyframe ${lane.id}`);
      }
    }
  }
  return [...new Set(issues)];
}

function allClipsHaveNoTargeting(pack) {
  return pack.arrangements
    .flatMap((arrangement) => arrangement.tracks ?? [])
    .flatMap((track) => track.clips ?? [])
    .every(
      (clip) =>
        !("target_set_id" in clip) &&
        !("target_set_ref" in clip) &&
        !("targeting_scene_ref" in clip),
    );
}

function coversRange(clips, start, end) {
  const intervals = clips
    .map((clip) => [clip.start_tick, clip.start_tick + clip.duration_tick])
    .filter(([, finish]) => finish > start)
    .sort((left, right) => left[0] - right[0]);
  let cursor = start;
  for (const [begin, finish] of intervals) {
    if (begin > cursor) return false;
    cursor = Math.max(cursor, finish);
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

function sharedBuiltinAssets(input, output) {
  const pairs = [];
  for (const key of ["layouts", "effects", "arrangements"]) {
    for (const asset of output[key] ?? []) {
      if (!asset.id.startsWith("builtin.")) continue;
      const inputAsset = findExact(input[key] ?? [], asset);
      if (inputAsset) pairs.push({ inputAsset, outputAsset: asset });
    }
  }
  return pairs;
}

function inputHashUnchanged() {
  const statusPath = resolve(runDirectory, "input-integrity.json");
  if (!inputPath || !existsSync(statusPath)) return false;
  const status = safelyReadJson(statusPath);
  const current = sha256(readFileSync(inputPath));
  const before = status?.before_sha256 ?? status?.before;
  const after = status?.after_sha256 ?? status?.after;
  return before === current && after === current && status?.unchanged !== false;
}

function readSemanticStatus() {
  const statusPath = resolve(runDirectory, "semantic-validation.json");
  if (!existsSync(statusPath)) return false;
  const status = safelyReadJson(statusPath);
  return status?.passed === true || status?.success === true || status?.status === "pass";
}

function add(text, passed, evidence) {
  expectations.push({ text, passed: Boolean(passed), evidence: String(evidence) });
}

function identity(asset) {
  return `${asset.id}@${asset.revision}`;
}

function findExact(assets, reference) {
  return assets.find((asset) => asset.id === reference.id && asset.revision === reference.revision);
}

function canonical(value) {
  return JSON.stringify(value);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function safelyReadJson(path) {
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
