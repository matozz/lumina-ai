import { FullDSLSchema } from "@/bridge/types";

export interface DslTemplate {
  key: string;
  name: string;
  dsl: string;
  disabled?: boolean;
  errorMessage?: string;
}

export function getTemplates(): DslTemplate[] {
  // Use import.meta.glob with eager: true inside the function, 
  // though Vite will static analyze this, we do it here so it evaluates when called
  const templateModules = import.meta.glob('./templates/*.json', { eager: true });
  
  const templates: DslTemplate[] = [];
  const seenNames = new Set<string>();

  for (const [path, module] of Object.entries(templateModules)) {
    // path looks like './templates/combined.json'
    const key = path.split('/').pop()?.replace('.json', '') || 'unknown';
    const json = module as any;
    // For default exports in JSON
    const content = json.default || json;

    // Validate the template against ShowDSL schema
    const result = FullDSLSchema.safeParse(content);
    
    if (!result.success) {
      const errorMsg = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      console.error(`[Template Error] Invalid DSL in template: ${path}`, result.error);
      
      const name = content.meta?.name || key;
      templates.push({
        key,
        name,
        dsl: JSON.stringify(content, null, 2),
        disabled: true,
        errorMessage: errorMsg
      });
      continue;
    }

    const validContent = result.data;
    const name = validContent.meta?.name || key;

    if (seenNames.has(name)) {
      console.warn(`[Template Warning] Duplicate template name found: "${name}" in file ${path}`);
    }
    seenNames.add(name);

    templates.push({
      key,
      name,
      dsl: JSON.stringify(validContent, null, 2),
    });
  }

  return templates;
}
