import type {
  ArrangementDocument,
  EffectDefinitionDocument,
  LayoutDefinition,
  ProjectTemplateDefinition,
} from "@/bridge/types";

const layoutModules = import.meta.glob("../../catalog/builtin/layouts/*.json", {
  eager: true,
  import: "default",
});
const arrangementModules = import.meta.glob("../../catalog/builtin/arrangements/*.json", {
  eager: true,
  import: "default",
});
const effectModules = import.meta.glob(
  ["../../catalog/builtin/effects/*.json", "!../../catalog/builtin/effects/_order.json"],
  {
    eager: true,
    import: "default",
  },
);
const projectTemplateModules = import.meta.glob("../../catalog/builtin/project-templates/*.json", {
  eager: true,
  import: "default",
});

export const builtinLayouts = loadAssetGroup<LayoutDefinition>(layoutModules, "Layout");
export const builtinEffects = loadAssetGroup<EffectDefinitionDocument>(effectModules, "Effect");
export const builtinArrangements = loadAssetGroup<ArrangementDocument>(
  arrangementModules,
  "Arrangement",
);
export const builtinProjectTemplates = loadAssetGroup<ProjectTemplateDefinition>(
  projectTemplateModules,
  "Project Template",
);

export function builtinProjectTemplate(id = "builtin.project-template.authoring-starter") {
  const template = builtinProjectTemplates.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Built-in Project Template is missing: ${id}`);
  return template;
}

function loadAssetGroup<T extends { id: string; revision?: number; schema_version: number }>(
  modules: Record<string, unknown>,
  kind: string,
) {
  const assets = Object.entries(modules)
    .map(([path, value]) => {
      if (!value || typeof value !== "object") {
        throw new Error(`${kind} source is not a JSON object: ${path}`);
      }
      const asset = value as T;
      if (asset.schema_version !== 1 || !asset.id) {
        throw new Error(`${kind} source does not match the V1 identity contract: ${path}`);
      }
      return asset;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const identities = new Set<string>();
  for (const asset of assets) {
    const identity = `${asset.id}@${asset.revision ?? 1}`;
    if (identities.has(identity)) throw new Error(`Duplicate built-in ${kind}: ${identity}`);
    identities.add(identity);
  }
  return assets;
}
