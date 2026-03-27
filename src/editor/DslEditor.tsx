import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { engine } from "../bridge/commands";
import { useUiStore } from "../stores/uiStore";
import { TEMPLATES } from "./templates";
import { XCircle, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DslEditor() {
  const { currentDslCode: code, setCurrentDslCode: setCode } = useUiStore();
  const { compileErrors, setCompileResult, setCompileErrors, setCompileStatus } = useUiStore();

  const latestCodeRef = useRef(code);
  latestCodeRef.current = code;

  useState(() => {
    if (!code) {
      setCode(TEMPLATES[0].dsl);
    }
  });

  const compileCode = async (codeToCompile: string) => {
    setCompileStatus('compiling');
    try {
      const res = await engine.loadDSL(codeToCompile);
      if (res.success) {
        setCompileResult(res);
        setCompileErrors([]);
        setCompileStatus('success');
        window.dispatchEvent(new CustomEvent("engine:layout-ready"));
      } else {
        setCompileErrors(res.errors);
        setCompileStatus('error');
      }
    } catch (e: any) {
      console.error(e);
      setCompileStatus('error');
    }
  };

  useEffect(() => {
    if (!code) return;
    
    const handler = setTimeout(() => {
      compileCode(code);
    }, 200); 
    
    return () => clearTimeout(handler);
  }, [code]); 

  const loadTemplate = (key: string | null) => {
    if (!key) return;
    const template = TEMPLATES.find(t => t.key === key);
    if (template) {
      setCode(template.dsl);
    }
  };

  return (
    <div className={cn("flex flex-col h-full w-112.5 border-r border-zinc-800 bg-zinc-950 shadow-xl z-10 shrink-0")}>
      <div className={cn("h-10 border-b border-zinc-800 bg-zinc-900/80 flex items-center px-4 justify-between backdrop-blur-md shrink-0")}>
        <div className="flex items-center gap-2 shrink-0">
          <FileCode2 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">DSL EDITOR</span>
        </div>
        
        <div className="flex gap-2 flex-1 justify-end">
          <Select onValueChange={loadTemplate}>
            <SelectTrigger size="sm" className={cn(
              "h-6 max-w-37.5 items-center justify-between rounded border border-zinc-800 bg-zinc-950",
              "px-1.5 py-0 text-xs text-zinc-300 placeholder:text-zinc-400",
              "focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
            )}>
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800">
              <SelectGroup>
                {TEMPLATES.map(t => (
                  <SelectItem key={t.key} value={t.key} className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100">
                    {t.name}
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
          onChange={(val) => setCode(val || "")}
          options={{ minimap: { enabled: false }, tabSize: 2, wordWrap: "on", fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 } }}
        />
      </div>
    </div>
  );
}
