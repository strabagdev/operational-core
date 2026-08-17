import type { ComponentProps } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { ContractLogoutForm } from "./contract-logout-form";

function getInitials(name?: string | null, email?: string | null) {
  const source = name || email || "User";
  const parts = source.split(/[.@\s_-]+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  email,
  name,
  image,
  contentAlign = "end",
  contentSide,
  triggerClassName,
}: {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  contentAlign?: ComponentProps<typeof DropdownMenuContent>["align"];
  contentSide?: ComponentProps<typeof DropdownMenuContent>["side"];
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Menú de usuario"
          className={cn("h-10 w-10 px-0", triggerClassName)}
          variant="ghost"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage alt={name ?? "Usuario"} src={image ?? ""} />
            <AvatarFallback>
              {getInitials(name, email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={contentAlign} side={contentSide}>
        <UserMenuContentItems email={email} name={name} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenuContentItems({
  email,
  name,
}: {
  email?: string | null;
  name?: string | null;
}) {
  return (
    <>
      <DropdownMenuLabel>
        <UserMenuIdentity email={email} name={name} />
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <ContractLogoutForm />
    </>
  );
}

export function UserMenuIdentity({
  email,
  name,
}: {
  email?: string | null;
  name?: string | null;
}) {
  return (
    <div className="grid gap-1">
      <span>{name ?? "Usuario"}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {email}
      </span>
    </div>
  );
}
