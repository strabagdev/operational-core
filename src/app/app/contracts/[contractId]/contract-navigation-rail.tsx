"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { Activity, ClipboardList, Settings, TableProperties } from "lucide-react";

import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isContractNavigationItemActive } from "@/lib/contract-layout-navigation";

const icons = {
  Actividad: Activity,
  Configuración: Settings,
  Registros: TableProperties,
  Resumen: ClipboardList,
} as const;

type NavigationItem = {
  href: string;
  label: keyof typeof icons;
};

export function ContractNavigationRail({
  contractCode,
  contractName,
  navigation,
}: {
  contractCode: string;
  contractName: string;
  navigation: NavigationItem[];
}) {
  const pathname = usePathname();
  const mainItems = navigation.filter((item) => item.label !== "Configuración");
  const secondaryItems = navigation.filter((item) => item.label === "Configuración");

  return (
    <aside className="sticky top-0 hidden h-screen w-[60px] shrink-0 border-r border-border px-2 py-4 md:flex md:flex-col md:items-center">
      <TooltipLink
        ariaLabel={`Operational Core, ${contractName}`}
        className="h-10 w-10 font-semibold"
        href="/app"
        label={`${contractName} · ${contractCode}`}
      >
        OC
      </TooltipLink>

      <nav aria-label="Navegación del contrato" className="mt-8 flex flex-1 flex-col items-center">
        <div className="flex flex-1 flex-col gap-2">
          {mainItems.map((item) => (
            <NavigationRailLink
              active={isContractNavigationItemActive({
                exact: item.label === "Resumen",
                href: item.href,
                pathname,
              })}
              item={item}
              key={item.href}
            />
          ))}
        </div>
        <div className="grid gap-2">
          {secondaryItems.map((item) => (
            <NavigationRailLink
              active={isContractNavigationItemActive({
                exact: item.label === "Resumen",
                href: item.href,
                pathname,
              })}
              item={item}
              key={item.href}
            />
          ))}
          <ThemeToggleButton />
        </div>
      </nav>
    </aside>
  );
}

function NavigationRailLink({
  active,
  item,
}: {
  active: boolean;
  item: NavigationItem;
}) {
  const Icon = icons[item.label];

  return (
    <TooltipLink
      active={active}
      ariaCurrent={active ? "page" : undefined}
      ariaLabel={item.label}
      href={item.href}
      label={item.label}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </TooltipLink>
  );
}

function TooltipLink({
  active,
  ariaCurrent,
  ariaLabel,
  children,
  className,
  href,
  label,
}: {
  active?: boolean;
  ariaCurrent?: "page";
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  href: string;
  label: string;
}) {
  return (
    <Button
      asChild
      className={cn(
        "group relative h-10 w-10 px-0",
        active
          ? "border border-border bg-accent shadow-sm before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-foreground"
          : "border border-transparent",
        className,
      )}
      variant="ghost"
    >
      <Link aria-current={ariaCurrent} aria-label={ariaLabel} href={href}>
        {children}
        <span
          className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          role="tooltip"
        >
          {label}
        </span>
      </Link>
    </Button>
  );
}
