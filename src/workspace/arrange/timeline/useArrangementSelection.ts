import { useEffect, useRef, useState } from "react";
import type { ArrangementDocument } from "@/bridge/types";
import {
  EMPTY_ARRANGEMENT_SELECTION,
  reconcileArrangementSelection,
  selectionAfterClick,
  type ArrangementSelectionItem,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";

export function useArrangementSelection(arrangement: ArrangementDocument | undefined) {
  const [selection, setSelection] = useState<ArrangementTimelineSelection>(
    EMPTY_ARRANGEMENT_SELECTION,
  );
  const arrangementIdRef = useRef(arrangement?.id);

  useEffect(() => {
    if (!arrangement || arrangementIdRef.current !== arrangement.id) {
      arrangementIdRef.current = arrangement?.id;
      setSelection(EMPTY_ARRANGEMENT_SELECTION);
      return;
    }
    setSelection((current) => reconcileArrangementSelection(current, arrangement));
  }, [arrangement]);

  const selectItem = (
    item: ArrangementSelectionItem,
    modifiers: { additive?: boolean; toggle?: boolean } = {},
  ) => setSelection((current) => selectionAfterClick(current, item, modifiers));

  const clearSelection = () => setSelection(EMPTY_ARRANGEMENT_SELECTION);

  return { clearSelection, selectItem, selection, setSelection };
}
