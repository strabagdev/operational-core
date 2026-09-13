import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActionGroup,
  ActionMessage,
  EmptyState,
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "./admin-ui";

describe("admin visual primitives", () => {
  it("renders a page header with title, description and actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        actions={<a href="/new">Crear</a>}
        description="Descripción de la pantalla"
        title="Entidades"
      />,
    );

    expect(html).toContain("Entidades");
    expect(html).toContain("Descripción de la pantalla");
    expect(html).toContain('data-action-group="true"');
    expect(html).toContain('href="/new"');
  });

  it("keeps summary card actions in the card header without external positioning", () => {
    const html = renderToStaticMarkup(
      <SummaryCard
        actions={<button aria-label="Editar">Editar</button>}
        badges={<StatusBadge variant="info">Panel</StatusBadge>}
        description="slug-muy-largo-que-debe-ajustarse-sin-desbordar"
        metadata={[{ label: "Orden", value: 1 }]}
        title="Título largo"
      />,
    );

    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-header="true"');
    expect(html).toContain('data-summary-card-actions="true"');
    expect(html).toContain("min-w-0 flex-1");
    expect(html).toContain("flex shrink-0 flex-wrap items-center gap-2");
    expect(html).toContain('aria-label="Editar"');
    expect(html).not.toContain("absolute");
    expect(html).not.toMatch(/\b(?:translate-x|translate-y|left-full|right-full)\b/);
  });

  it("renders status badge text and variant", () => {
    const html = renderToStaticMarkup(<StatusBadge variant="active">Activa</StatusBadge>);

    expect(html).toContain("Activa");
    expect(html).toContain('data-status-badge="active"');
    expect(html).toContain("emerald");
  });

  it("allows action groups to wrap responsively", () => {
    const html = renderToStaticMarkup(
      <ActionGroup>
        <button>Uno</button>
        <button>Dos</button>
      </ActionGroup>,
    );

    expect(html).toContain("flex-wrap");
    expect(html).toContain("shrink-0");
    expect(html).toContain("Uno");
    expect(html).toContain("Dos");
  });

  it("renders action messages with accessible status and error roles", () => {
    expect(renderToStaticMarkup(<ActionMessage variant="success">Guardado</ActionMessage>)).toContain('role="status"');
    expect(renderToStaticMarkup(<ActionMessage variant="error">Error</ActionMessage>)).toContain('role="alert"');
  });

  it("renders an empty state with an optional action", () => {
    const html = renderToStaticMarkup(
      <EmptyState action={<a href="/create">Crear</a>} description="Aún no hay datos" title="Sin entidades" />,
    );

    expect(html).toContain('data-empty-state="true"');
    expect(html).toContain("Sin entidades");
    expect(html).toContain("Aún no hay datos");
    expect(html).toContain('href="/create"');
  });
});
