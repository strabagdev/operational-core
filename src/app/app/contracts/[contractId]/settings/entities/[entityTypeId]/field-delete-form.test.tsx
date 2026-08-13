import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FieldDeleteForm } from "./field-delete-form";

describe("field delete form", () => {
  it("shows the permanent delete action for unused fields", () => {
    const html = renderToStaticMarkup(
      <FieldDeleteForm
        action={() => {}}
        canDelete
        fieldName="Número de serie"
        returnTo="/app/contracts/contract_1/settings/entities/entity_1"
      />,
    );

    expect(html).toContain("Eliminar definitivamente");
    expect(html).toContain('name="returnTo"');
  });

  it("explains why used fields cannot be permanently deleted", () => {
    const html = renderToStaticMarkup(
      <FieldDeleteForm
        action={() => {}}
        blockedMessage="No puedes eliminar este campo porque Tiene valores históricos asociados. Puedes desactivarlo para que deje de estar disponible en nuevos registros."
        canDelete={false}
        fieldName="Número de serie"
        returnTo="/app/contracts/contract_1/settings/entities/entity_1"
      />,
    );

    expect(html).toContain("Eliminar definitivamente");
    expect(html).toContain("Tiene valores históricos asociados.");
    expect(html).toContain("Puedes desactivarlo");
  });
});
