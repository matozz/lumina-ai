import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { engine } from "../bridge/commands";
import { useEngineStore, engineActions, engineSelectors } from "../stores/engineStore";
import { getTemplates, DslTemplate } from "./templates";
import { XCircle, FileCode2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DslEditor() {
  const code = useEngineStore(engineSelectors.currentDslCode);
  const compileErrors = useEngineStore(engineSelectors.compileErrors);

  const [templates, setTemplates] = useState<DslTemplate[]>(getTemplates);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("combined");

  const latestCodeRef = useRef(code);
  latestCodeRef.current = code;

  useEffect(() => {
    if (!code && templates.length > 0) {
      // Find the first valid template to set as default
      const firstValidTemplate = templates.find(t => !t.disabled) || templates[0];
      if (firstValidTemplate) {
        engineActions.setCurrentDslCode(firstValidTemplate.dsl);
        setSelectedTemplateKey(firstValidTemplate.key);
      }
    }
  }, []); // Run only on mount

  const compileCode = async (codeToCompile: string) => {
    engineActions.setCompileStatus('compiling');
    try {
      const res = await engine.loadDSL(codeToCompile);
      if (res.success) {
        engineActions.setCompileResult(res);
        engineActions.setCompileErrors([]);
        engineActions.setCompileStatus('success');
        window.dispatchEvent(new CustomEvent("engine:layout-ready"));
      } else {
        engineActions.setCompileErrors(res.errors);
        engineActions.setCompileStatus('error');
      }
    } catch (e: any) {
      console.error(e);
      engineActions.setCompileStatus('error');
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
    const template = templates.find(t => t.key === key);
    if (template && !template.disabled) {
      engineActions.setCurrentDslCode(template.dsl);
      setSelectedTemplateKey(key);
    }
  };

  const handleEditorChange = (val: string | undefined) => {
    engineActions.setCurrentDslCode(val || "");
    
    // If the user types something that matches a template exactly, select it
    // Otherwise, mark it as custom
    const matchedTemplate = templates.find(t => t.dsl === val);
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
    <div className={cn("flex flex-col h-full w-112.5 border-r border-zinc-800 bg-zinc-950 shadow-xl z-10 shrink-0")}>
      <div className={cn("h-10 border-b border-zinc-800 bg-zinc-900/80 flex items-center px-4 justify-between backdrop-blur-md shrink-0")}>
        <div className="flex items-center gap-2 shrink-0">
          <FileCode2 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">DSL EDITOR</span>
        </div>
        
        <div className="flex gap-2 justify-end items-center">
          <button 
            onClick={reloadTemplates}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            title="Reload Templates"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <Select value={selectedTemplateKey} onValueChange={loadTemplate}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 w-45">
              <SelectGroup>
                {selectedTemplateKey === "custom" && (
                  <SelectItem value="custom" className="text-zinc-400 italic focus:bg-zinc-800 focus:text-zinc-300 pr-8">
                    Custom...
                  </SelectItem>
                )}
                {templates.map(t => (
                  <SelectItem 
                    key={t.key} 
                    value={t.key} 
                    className={cn(
                      "flex items-center focus:bg-zinc-800 focus:text-zinc-100 pr-8",
                      t.disabled ? "text-zinc-600 opacity-80" : "text-zinc-300"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {t.disabled && t.errorMessage && (
                        <Tooltip>
                          <TooltipTrigger>
                            <div onClick={(e) => copyError(e, t.errorMessage!)}>
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500/80 shrink-0" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" >
                            <p className="text-[11px] font-mono whitespace-pre-wrap wrap-break-word opacity-80">
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
      <div className="flex-1 overflow-hidden relative">
        {compileErrors.length > 0 && (
          <div className={cn(
            "absolute top-0 left-0 w-full z-10 bg-red-950/90 border-b border-red-900 p-3 max-h-40 overflow-y-auto backdrop-blur-sm shadow-md"
          )}>
            <h4 className={cn("text-red-400 text-[11px] font-bold mb-1.5 uppercase tracking-wider flex items-center gap-1.5")}>
              <XCircle className="w-3.5 h-3.5" /> Compile Errors
            </h4>
            {compileErrors.map((e, i) => (
              <div key={i} className={cn("text-red-300 text-xs font-mono break-all mb-1 last:mb-0 bg-red-900/20 p-1.5 rounded border border-red-900/50")}>
                <span className="opacity-70 font-semibold">[{e.path}]</span> {e.message}
              </div>
            ))}
          </div>
        )}
        <Editor
          height="100%"
          defaultLanguage="json"
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{ minimap: { enabled: false }, tabSize: 2, wordWrap: "on", fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 } }}
        />
      </div>
    </div>
  );
}
