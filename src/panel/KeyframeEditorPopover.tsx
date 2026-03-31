import React, { useEffect, useRef, useState } from 'react';
import type { KeyframeDSL } from '../bridge/types';
import { Check, Trash2, X } from 'lucide-react';

interface KeyframeEditorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  x: number;
  y: number;
  keyframe: KeyframeDSL;
  onUpdate: (updates: Partial<KeyframeDSL>) => void;
  onDelete: () => void;
}

export function KeyframeEditorPopover({
  isOpen,
  onClose,
  x,
  y,
  keyframe,
  onUpdate,
  onDelete
}: KeyframeEditorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const [val, setVal] = useState(String(keyframe.value));
  const [time, setTime] = useState(String(keyframe.time));
  const [easing, setEasing] = useState(keyframe.easing || 'linear');

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use mousedown instead of click to fire before drag events
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    const updates: Partial<KeyframeDSL> = {};
    
    const parsedTime = parseFloat(time);
    if (!isNaN(parsedTime) && parsedTime !== keyframe.time) {
       updates.time = parsedTime;
    }

    // Try to parse value as number if possible, else string
    const parsedVal = Number(val);
    const finalVal = isNaN(parsedVal) ? val : parsedVal;
    if (finalVal !== keyframe.value) {
       updates.value = finalVal;
    }

    if (easing !== (keyframe.easing || 'linear')) {
       updates.easing = easing;
    }

    if (Object.keys(updates).length > 0) {
       onUpdate(updates);
    }
    onClose();
  };

  // Keep popover within screen bounds
  const style: React.CSSProperties = {
     position: 'fixed',
     left: x,
     top: y + 10,
     zIndex: 100,
  };

  return (
    <div 
      ref={popoverRef}
      className="bg-zinc-900 border border-zinc-700 rounded-md shadow-xl p-3 w-64 text-sm font-sans flex flex-col gap-3"
      style={style}
      onMouseDown={(e) => e.stopPropagation()} // Prevent closing when interacting with inputs
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-center mb-1 border-b border-zinc-800 pb-2">
        <h3 className="font-semibold text-zinc-300">Edit Keyframe</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400">Time (beats)</label>
        <input 
           type="number"
           step="0.1"
           value={time}
           onChange={(e) => setTime(e.target.value)}
           className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400">Value</label>
        <input 
           type="text"
           value={val}
           onChange={(e) => setVal(e.target.value)}
           className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400">Easing</label>
        <select 
           value={easing}
           onChange={(e) => setEasing(e.target.value)}
           className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
           <option value="linear">Linear</option>
           <option value="ease_in">Ease In</option>
           <option value="ease_out">Ease Out</option>
           <option value="ease_in_out">Ease In/Out</option>
           <option value="step">Step (Hold)</option>
        </select>
      </div>

      <div className="flex justify-between mt-2 pt-2 border-t border-zinc-800">
         <button 
           onClick={onDelete}
           className="text-red-400 hover:text-red-300 hover:bg-red-950/30 px-2 py-1 rounded transition-colors flex items-center gap-1"
         >
           <Trash2 size={12} /> Delete
         </button>
         <button 
           onClick={handleSave}
           className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded transition-colors flex items-center gap-1 font-medium"
         >
           <Check size={12} /> Apply
         </button>
      </div>
    </div>
  );
}
