"use client";

import { Clipboard, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function DiagnosticReferenceCopyButton({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      aria-label="Copiar referencia de diagnóstico"
      onClick={async () => {
        await navigator.clipboard.writeText(reference);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Clipboard aria-hidden="true" className="h-4 w-4" />}
      {copied ? "Copiada" : "Copiar diagnóstico"}
    </Button>
  );
}
