"use client";

import { useSelectedLayoutSegments } from "next/navigation";

import { UserMenu } from "./user-menu";

export function ContractContextHeader({
  contractCode,
  contractName,
  organizationName,
  userEmail,
  userImage,
  userName,
}: {
  contractCode: string;
  contractName: string;
  organizationName: string;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
}) {
  const segments = useSelectedLayoutSegments();

  if (shouldHideContractContextHeader(segments)) {
    return null;
  }

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 md:block md:px-6 md:py-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">{contractName}</div>
        <div className="truncate text-sm text-muted-foreground">
          {contractCode} · {organizationName}
        </div>
      </div>

      <div className="md:hidden">
        <UserMenu
          email={userEmail}
          image={userImage}
          name={userName}
        />
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
