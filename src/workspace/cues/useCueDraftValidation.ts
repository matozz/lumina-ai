import { useCallback, useEffect } from "react";
import { engine } from "@/bridge/commands";
import type { CueDefinition, ProductionCatalog, ProjectBundle } from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";
import { authoringDraftActions, type CueDraftSession } from "@/stores/authoringDraft";
import { materializeCueDraftBundle } from "../authoringPreviewBundle";
import { cueDiagnostic, cueDiagnosticsFrom } from "./cueAuthoring";

export function useCueDraftValidation(
  bundle: ProjectBundle,
  catalog: ProductionCatalog | null,
  session: CueDraftSession | null,
  active: boolean,
) {
  const validate = useCallback(
    (draft: CueDefinition, generation: number) => {
      authoringDraftActions.markCueValidating(generation);
      const arrangementRef =
        bundle.manifest.arrangement_refs.find(
          (reference) => reference.id === bundle.manifest.active_arrangement_id,
        ) ?? null;
      const candidateBundle = materializeCueDraftBundle(bundle, draft, catalog, arrangementRef);
      void engine
        .validateProjectWorkingDraft(candidateBundle)
        .then((normalizedBundle) => {
          const normalized = exactAsset(normalizedBundle.cues, draft);
          if (!normalized) {
            authoringDraftActions.rejectCueValidation(generation, [
              cueDiagnostic("cue", "Validated Project omitted the working Cue revision."),
            ]);
            return;
          }
          authoringDraftActions.acceptCueValidation(generation, normalized);
        })
        .catch((error) =>
          authoringDraftActions.rejectCueValidation(generation, cueDiagnosticsFrom(error)),
        );
    },
    [bundle, catalog],
  );

  useEffect(() => {
    if (!active || session?.status !== "dirty") return;
    const timeout = window.setTimeout(
      () => validate(structuredClone(session.working), session.generation),
      240,
    );
    return () => window.clearTimeout(timeout);
  }, [active, session, validate]);

  return validate;
}
