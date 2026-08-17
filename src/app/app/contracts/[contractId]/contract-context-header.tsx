"use client";

import { useSelectedLayoutSegments } from "next/navigation";

export function ContractContextHeader({
  contractCode,
  contractName,
  organizationName,
}: {
  contractCode: string;
  contractName: string;
  organizationName: string;
}) {
  const segments = useSelectedLayoutSegments();

  if (shouldHideContractContextHeader(segments)) {
    return null;
  }

  return (
    <header className="flex min-h-16 items-center border-b border-border px-4 md:block md:px-6 md:py-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">{contractName}</div>
        <div className="truncate text-sm text-muted-foreground">
          {contractCode} · {organizationName}
        </div>
      </div>
    </header>
  );
}

export function shouldHideContractContextHeader(segments: string[]) {
  return (
    segments[0] === "records" &&
    (segments.length === 1 || (segments.length === 2 && Boolean(segments[1])))
  );
}
