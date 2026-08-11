import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}: {
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Abrir menú de usuario" size="icon" variant="ghost">
          <Avatar>
            <AvatarImage alt={name ?? "Usuario"} src={image ?? ""} />
            <AvatarFallback>
              {getInitials(name, email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
      <DropdownMenuItem asChild>
        <Link href="/app">Cambiar contrato</Link>
      </DropdownMenuItem>
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
