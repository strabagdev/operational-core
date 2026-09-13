import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  IconPicker,
  IconPickerGlyph,
  getIconPickerFormValue,
  getIconPickerLabel,
  getIconPickerOptions,
} from "./icon-picker";

describe("IconPicker", () => {
  it("renders the selected icon label and submitted value in the closed control", () => {
    const html = renderToStaticMarkup(
      <IconPicker
        label="Seleccionar icono de experiencia"
        onIconChange={() => undefined}
        selectedIcon="warehouse"
      />,
    );

    expect(html).toContain("Seleccionar icono de experiencia");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Bodega");
    expect(html).toContain('name="icon"');
    expect(html).toContain('value="warehouse"');
    expect(html).toContain("lucide-warehouse");
  });

  it("renders real SVG elements for known icons", () => {
    const options = getIconPickerOptions("").filter((option) => option.icon).slice(0, 6);

    for (const option of options) {
      const html = renderToStaticMarkup(<IconPickerGlyph icon={option.icon} />);

      expect(html).toContain("<svg");
      expect(html).toContain("h-4 w-4");
      expect(html).toContain("shrink-0");
      expect(html).not.toContain("width:0");
      expect(html).not.toContain("height:0");
      expect(html).not.toContain("opacity:0");
      expect(html).not.toContain("display:none");
    }
  });

  it("changes the visible SVG when the selected value changes", () => {
    const warehouse = renderToStaticMarkup(<IconPickerGlyph icon="warehouse" />);
    const folder = renderToStaticMarkup(<IconPickerGlyph icon="folder" />);

    expect(warehouse).toContain("lucide-warehouse");
    expect(folder).toContain("lucide-folder");
    expect(warehouse).not.toEqual(folder);
  });

  it("represents no icon clearly without persisting a misleading value", () => {
    const html = renderToStaticMarkup(
      <IconPicker
        onIconChange={() => undefined}
        selectedIcon={null}
      />,
    );

    expect(html).toContain("Sin icono");
    expect(html).toContain('value=""');
    expect(html).toContain("lucide-slash");
  });

  it("exposes icon options with icon keys and readable labels", () => {
    expect(getIconPickerOptions("")).toEqual(expect.arrayContaining([
      { icon: null, key: "none", label: "Sin icono" },
      { icon: "warehouse", key: "warehouse", label: "Bodega" },
      { icon: "folder", key: "folder", label: "Carpeta" },
    ]));
    expect(getIconPickerOptions("car")).toEqual([
      { icon: null, key: "none", label: "Sin icono" },
      { icon: "folder", key: "folder", label: "Carpeta" },
    ]);
  });

  it("keeps list semantics, search and option selection behavior in the component source", () => {
    const source = String(IconPicker);

    expect(source).toContain("role");
    expect(source).toContain("listbox");
    expect(source).toContain("option");
    expect(source).toContain("setOpen(false)");
    expect(source).toContain("setQuery(\"\")");
    expect(source).toContain("onKeyDown");
  });

  it("maps selection values without changing persisted identifiers", () => {
    expect(getIconPickerFormValue("clipboard-check")).toBe("clipboard-check");
    expect(getIconPickerFormValue(null)).toBe("");
    expect(getIconPickerLabel("clipboard-check")).toBe("Checklist");
    expect(getIconPickerLabel(null)).toBe("Sin icono");
  });

  it("preserves unknown legacy values in a controlled state", () => {
    const html = renderToStaticMarkup(
      <IconPicker
        onIconChange={() => undefined}
        selectedIcon="legacy-custom-icon"
      />,
    );

    expect(html).toContain("Ícono desconocido: legacy-custom-icon");
    expect(html).toContain('value="legacy-custom-icon"');
  });
});
