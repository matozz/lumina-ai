import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { engine } from "../bridge/commands";
import { useUiStore } from "../stores/uiStore";
import { TEMPLATES } from "./templates";
import { XCircle } from "lucide-react";
import { cn } from "../utils/cn";

export function DslEditor() {
  const { currentDslCode: code, setCurrentDslCode: setCode } = useUiStore();
  const { compileErrors, compileStatus, setCompileResult, setCompileErrors, setCompileStatus } = useUiStore();

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

  const loadTemplate = (key: string) => {
    const template = TEMPLATES.find(t => t.key === key);
    if (template) {
      setCode(template.dsl);
    }
  };

  return (
    <div className={cn("flex flex-col h-full w-100 border-r border-zinc-800 bg-zinc-950 shadow-xl z-10")}>
      <div className={cn("p-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center gap-3")}>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-zinc-100 font-semibold text-sm tracking-tight">DSL Editor</span>
        </div>
        
        <div className="flex gap-2 flex-1 justify-end">
          <select 
            onChange={(e) => loadTemplate(e.target.value)}
            className={cn(
              "h-8 max-w-37.5 items-center justify-between rounded-md border border-zinc-800 bg-zinc-950",
              "px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-400",
              "focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
            )}
          >
            {TEMPLATES.map(t => (
              <option key={t.key} value={t.key}>{t.name}</option>
            ))}
          </select>
          <button 
            onClick={() => compileCode(code)} 
            disabled={compileStatus === 'compiling'}
            className={cn(
              "inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50",
              "bg-zinc-100 text-zinc-900 shadow hover:bg-zinc-200 h-8 px-3"
            )}
          >
            Compile
          </button>
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
