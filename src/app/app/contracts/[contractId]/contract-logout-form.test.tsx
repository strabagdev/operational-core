import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContractLogoutForm } from "./contract-logout-form";

describe("contract logout form", () => {
  it("renders a direct submit button inside a form", () => {
    const html = renderToStaticMarkup(
      <ContractLogoutForm />,
    );

    expect(html).toContain('<form action="/api/logout" method="post"');
    expect(html).toContain("Cerrar sesión");
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("pointer-events-none");
    expect(html).toContain("hover:bg-accent");
  });
});
