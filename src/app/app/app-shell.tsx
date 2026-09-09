import Link from "next/link";
import { Building2, Home } from "lucide-react";

import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { UserMenu } from "./contracts/[contractId]/user-menu";

type AppShellNavigationItem = {
  href: string;
  label: string;
  icon: "contracts" | "home";
};

const appShellIcons = {
  contracts: Building2,
  home: Home,
} as const;

export function AuthenticatedAppShell({
  children,
  navigation = [{ href: "/app", icon: "home", label: "Inicio" }],
  title = "Operational Core",
  userEmail,
  userImage,
  userName,
}: {
  children: React.ReactNode;
  navigation?: AppShellNavigationItem[];
  title?: string;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[60px] shrink-0 border-r border-border px-2 py-4 md:flex md:flex-col md:items-center">
        <TooltipLink
          ariaLabel={title}
          className="h-10 w-10 font-semibold"
          href="/app"
          label={title}
        >
          OC
        </TooltipLink>

        <nav aria-label="Navegación principal" className="mt-8 flex flex-1 flex-col items-center">
          <div className="flex flex-1 flex-col gap-2">
            {navigation.map((item) => (
              <NavigationRailLink item={item} key={item.href} />
            ))}
          </div>
          <div className="grid gap-2 border-t border-border pt-2">
            <ThemeToggleButton />
            <UserMenu
              contentAlign="end"
              contentSide="right"
              email={userEmail}
              image={userImage}
              name={userName}
            />
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Button asChild className="h-10 w-10 px-0 font-semibold md:hidden" variant="ghost">
            <Link aria-label={title} href="/app">
              OC
            </Link>
          </Button>
          <nav aria-label="Navegación principal" className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {navigation.map((item) => (
              <Button asChild key={item.href} size="sm" variant="outline">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggleButton
              className="shrink-0 border border-border"
              tooltipClassName="left-auto right-0 top-[calc(100%+0.5rem)] translate-y-0"
            />
            <UserMenu
              email={userEmail}
              image={userImage}
              name={userName}
            />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavigationRailLink({ item }: { item: AppShellNavigationItem }) {
  const Icon = appShellIcons[item.icon];

  return (
    <TooltipLink
      ariaLabel={item.label}
      href={item.href}
      label={item.label}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </TooltipLink>
  );
}

function TooltipLink({
  ariaLabel,
  children,
  className,
  href,
  label,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  href: string;
  label: string;
}) {
  return (
    <Button
      asChild
      className={cn("group relative h-10 w-10 border border-transparent px-0", className)}
      variant="ghost"
    >
      <Link aria-label={ariaLabel} href={href}>
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
