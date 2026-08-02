import Editor, { type Monaco } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { engine } from "../bridge/commands";
import { formatDiagnostic, normalizeDiagnostic } from "../bridge/diagnostics";
import { useEngineStore, engineActions, engineSelectors } from "../stores/engine";
import { getTemplates, DslTemplate } from "./templates";
import { XCircle, FileCode2, AlertTriangle, RefreshCw, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { showDocumentSchema, showDocumentSchemaUri } from "@/document/showDocument";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const DslEditor = () => {
  const code = useEngineStore(engineSelectors.currentDslCode);
  const compileErrors = useEngineStore(engineSelectors.compileErrors);

  const [templates, setTemplates] = useState<DslTemplate[]>(getTemplates);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("combined");

  const latestCodeRef = useRef(code);
  latestCodeRef.current = code;

  useEffect(() => {
    if (!code && templates.length > 0) {
      // Find the first valid template to set as default
      const firstValidTemplate = templates.find((t) => !t.disabled) || templates[0];
      if (firstValidTemplate) {
        engineActions.loadCurrentDslCode(firstValidTemplate.dsl);
        setSelectedTemplateKey(firstValidTemplate.key);
      }
    }
  }, []); // Run only on mount

  const compileCode = async (codeToCompile: string) => {
    engineActions.setCompileStatus("compiling");
    try {
      const res = await engine.loadDSL(codeToCompile);
      if (res.success) {
        engineActions.setCompileResult(res);
        engineActions.setCompileErrors([]);
        engineActions.setCompileStatus("success");
        window.dispatchEvent(new CustomEvent("engine:layout-ready"));
      } else {
        engineActions.setCompileErrors(res.errors);
        engineActions.setCompileStatus("error");
      }
    } catch (error: unknown) {
      engineActions.setCompileErrors([normalizeDiagnostic(error)]);
      engineActions.setCompileStatus("error");
    }
  };

  useEffect(() => {
    if (!code) return;

    const handler = setTimeout(() => {
      compileCode(code);
    }, 200);

    return () => clearTimeout(handler);
  }, [code]);

  const reloadTemplates = () => {
    setTemplates(getTemplates());
  };

  const loadTemplate = (key: string | null) => {
    if (!key || key === "custom") return;
    const template = templates.find((t) => t.key === key);
    if (template && !template.disabled) {
      engineActions.loadCurrentDslCode(template.dsl);
      setSelectedTemplateKey(key);
    }
  };

  const handleEditorChange = (val: string | undefined) => {
    engineActions.setCurrentDslCode(val || "");

    // If the user types something that matches a template exactly, select it
    // Otherwise, mark it as custom
    const matchedTemplate = templates.find((t) => t.dsl === val);
    if (matchedTemplate) {
      setSelectedTemplateKey(matchedTemplate.key);
    } else {
      setSelectedTemplateKey("custom");
    }
  };

  const copyError = (e: React.MouseEvent, errorMessage: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(errorMessage);
  };

  return (
    <div
      className={cn(
        "z-10 flex h-full min-h-0 w-[clamp(20rem,30vw,28.125rem)] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 shadow-xl",
      )}
      data-layout-region="editor"
    >
      <div
        className={cn(
          "flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-md",
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
          <FileCode2 className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold tracking-wide text-zinc-200">DSL EDITOR</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={reloadTemplates}
            title="Reload Templates"
            aria-label="Reload templates"
          >
            <RefreshCw />
          </Button>
          <Select value={selectedTemplateKey} onValueChange={loadTemplate}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent className="w-45 border-zinc-800 bg-zinc-950">
              <SelectGroup>
                {selectedTemplateKey === "custom" && (
                  <SelectItem
                    value="custom"
                    className="pr-8 text-zinc-400 italic focus:bg-zinc-800 focus:text-zinc-300"
                  >
                    Custom...
                  </SelectItem>
                )}
                {templates.map((t) => (
                  <SelectItem
                    key={t.key}
                    value={t.key}
                    className={cn(
                      "flex items-center pr-8 focus:bg-zinc-800 focus:text-zinc-100",
                      t.disabled ? "text-zinc-600 opacity-80" : "text-zinc-300",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {t.disabled && t.errorMessage && (
                        <Tooltip>
                          <TooltipTrigger>
                            <div onClick={(e) => copyError(e, t.errorMessage!)}>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500/80" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="font-mono text-[11px] wrap-break-word whitespace-pre-wrap opacity-80">
                              {t.errorMessage}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {compileErrors.length > 0 && (
          <Alert
            variant="destructive"
            className="absolute top-0 left-0 z-10 max-h-48 overflow-y-auto rounded-none border-x-0 border-t-0 shadow-md backdrop-blur-sm"
          >
            <XCircle />
            <AlertTitle>Compile diagnostics</AlertTitle>
            <AlertDescription className="flex flex-col gap-1.5 text-left text-xs text-pretty">
              {compileErrors.map((diagnostic, index) => (
                <div
                  key={`${diagnostic.code}:${diagnostic.path}:${index}`}
                  className="border-destructive/20 bg-destructive/5 relative rounded-md border p-2 pr-8 font-mono"
                >
                  <div className="font-semibold wrap-break-word">
                    [{diagnostic.code}] {diagnostic.path}
                  </div>
                  <div className="wrap-break-word">{diagnostic.message}</div>
                  {diagnostic.hint && (
                    <div className="mt-1 wrap-break-word opacity-80">Hint: {diagnostic.hint}</div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1 right-1"
                    onClick={() => navigator.clipboard.writeText(formatDiagnostic(diagnostic))}
                    title="Copy diagnostic"
                    aria-label={`Copy ${diagnostic.code} diagnostic`}
                  >
                    <Copy />
                  </Button>
                </div>
              ))}
            </AlertDescription>
          </Alert>
        )}
        <Editor
          height="100%"
          defaultLanguage="json"
          theme="vs-dark"
          value={code}
          beforeMount={configureJsonSchema}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            tabSize: 2,
            wordWrap: "on",
            fontSize: 13,
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
};

function configureJsonSchema(monaco: Monaco) {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    schemas: [
      {
        uri: showDocumentSchemaUri,
        fileMatch: ["*"],
        schema: showDocumentSchema,
      },
    ],
  });
}
