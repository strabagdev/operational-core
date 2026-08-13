import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContractNavigationItemActive } from "./contract-layout-navigation";

const railSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/contract-navigation-rail.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/layout.tsx", import.meta.url),
  "utf8",
);

describe("contract layout navigation", () => {
  it("keeps every existing contract navigation route", () => {
    expect(layoutSource).toContain("Resumen");
    expect(layoutSource).toContain("Registros");
    expect(layoutSource).toContain("Actividad");
    expect(layoutSource).toContain("Configuración");
    expect(layoutSource).toContain("/records");
    expect(layoutSource).toContain("/activity");
    expect(layoutSource).toContain("/settings");
  });

  it("uses a compact desktop rail with accessible icon links", () => {
    expect(railSource).toContain("w-[60px]");
    expect(railSource).toContain("sticky top-0");
    expect(railSource).toContain("h-screen");
    expect(railSource).toContain("ThemeToggleButton");
    expect(railSource).toContain("UserMenu");
    expect(railSource).toContain('aria-label={ariaLabel}');
    expect(railSource).toContain('aria-hidden="true"');
    expect(railSource).toContain('role="tooltip"');
    expect(railSource).toContain("group-hover:opacity-100");
    expect(railSource).toContain("group-focus-visible:opacity-100");
  });

  it("marks nested routes as active for the matching section", () => {
    expect(isContractNavigationItemActive({
      href: "/app/contracts/contract_1/records",
      pathname: "/app/contracts/contract_1/records/entity_1",
    })).toBe(true);
    expect(isContractNavigationItemActive({
      href: "/app/contracts/contract_1/activity",
      pathname: "/app/contracts/contract_1/records",
    })).toBe(false);
    expect(isContractNavigationItemActive({
      exact: true,
      href: "/app/contracts/contract_1",
      pathname: "/app/contracts/contract_1/records",
    })).toBe(false);
  });

  it("does not rely only on icon color for active navigation", () => {
    expect(railSource).toContain("bg-accent");
    expect(railSource).toContain("before:bg-foreground");
    expect(railSource).toContain('aria-current={ariaCurrent}');
  });

  it("keeps desktop rail navigation pinned to the top instead of vertically centering it", () => {
    expect(railSource).toContain('className="mt-8 flex flex-1 flex-col items-center"');
    expect(railSource).toContain('className="flex flex-1 flex-col gap-2"');
    expect(railSource).not.toContain("justify-center gap-2");
  });

  it("keeps theme and user controls in the lower rail area", () => {
    expect(railSource).toContain('className="grid gap-2 border-t border-border pt-2"');
    expect(railSource).toContain("<ThemeToggleButton />");
    expect(railSource).toContain("contentSide=\"right\"");
    expect(railSource).toContain("userEmail");
    expect(railSource).toContain("userImage");
    expect(railSource).toContain("userName");
  });

  it("keeps the theme toggle and user menu available on mobile", () => {
    expect(layoutSource).toContain("ThemeToggleButton");
    expect(layoutSource).toContain("<UserMenu");
    expect(layoutSource).toContain("md:hidden");
    expect(layoutSource).toContain("tooltipClassName");
  });

  it("moves the desktop user menu out of the header and into the rail", () => {
    expect(layoutSource).toContain("userEmail={session.user.email}");
    expect(layoutSource).toContain("userImage={session.user.image}");
    expect(layoutSource).toContain("userName={session.user.name}");
    expect(layoutSource).toContain('className="md:hidden"');
  });
});
