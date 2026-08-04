import { RotateCcw } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AuthoringDiagnostic } from "./diagnostics";

interface AuthoringDiagnosticAlertProps {
  diagnostic: AuthoringDiagnostic;
  onRecover: () => void;
  recoveryLabel?: string;
}

export function AuthoringDiagnosticAlert({
  diagnostic,
  onRecover,
  recoveryLabel = "Reset preview",
}: AuthoringDiagnosticAlertProps) {
  return (
    <Alert variant="destructive" className="m-2">
      <AlertTitle>
        {diagnostic.code} · {diagnostic.path}
      </AlertTitle>
      <AlertDescription>
        {diagnostic.message} {diagnostic.hint}
      </AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline" onClick={onRecover}>
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          {recoveryLabel}
        </Button>
      </AlertAction>
    </Alert>
  );
}
