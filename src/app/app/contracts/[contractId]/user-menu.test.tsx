import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UserMenu, UserMenuIdentity } from "./user-menu";

describe("contract user menu", () => {
  it("renders a single user trigger", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        email="admin@operational-core.local"
        image={null}
        name="Daniel Silva"
      />,
    );

    expect(html.match(/Abrir menú de usuario/g)).toHaveLength(1);
    expect(html).toContain("DS");
    expect(html).not.toContain("Cerrar sesión");
    expect(html).not.toContain("/api/logout");
  });

  it("renders the user name and email used by the menu content", () => {
    const html = renderToStaticMarkup(
      <UserMenuIdentity
        email="admin@operational-core.local"
        name="Daniel Silva"
      />,
    );

    expect(html).toContain("Daniel Silva");
    expect(html).toContain("admin@operational-core.local");
  });

  it("keeps the logout form inside the dropdown instead of the layout header", () => {
    const menuSource = readFileSync(
      new URL("./user-menu.tsx", import.meta.url),
      "utf8",
    );
    const layoutSource = readFileSync(
      new URL("./layout.tsx", import.meta.url),
      "utf8",
    );

    expect(menuSource).toContain("<DropdownMenuContent");
    expect(menuSource).toContain("<UserMenuContentItems");
    expect(menuSource).toContain("<ContractLogoutForm />");
    expect(layoutSource).toContain("<UserMenu");
    expect(layoutSource).not.toContain("<ContractLogoutForm");
  });
});
