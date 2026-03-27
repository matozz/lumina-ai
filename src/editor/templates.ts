export interface DslTemplate {
  key: string;
  name: string;
  dsl: string;
}

const templateModules = import.meta.glob('./templates/*.json', { eager: true });

function getTemplates(): DslTemplate[] {
  const templates: DslTemplate[] = [];
  const seenNames = new Set<string>();

  for (const [path, module] of Object.entries(templateModules)) {
    // path looks like './templates/combined.json'
    const key = path.split('/').pop()?.replace('.json', '') || 'unknown';
    const json = module as any;
    // For default exports in JSON
    const content = json.default || json;
    const name = content.meta?.name || key;

    if (seenNames.has(name)) {
      console.warn(`[Template Warning] Duplicate template name found: "${name}" in file ${path}`);
    }
    seenNames.add(name);

    templates.push({
      key,
      name,
      dsl: JSON.stringify(content, null, 2),
    });
  }

  return templates;
}

export const TEMPLATES = getTemplates();
