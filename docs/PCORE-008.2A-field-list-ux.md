# PCORE-008.2A Field List UX

## Problem

The entity field settings screen rendered full create and edit forms inline. This made the screen hard to scan and forced users to confront every technical option before understanding the fields already configured.

## Visual Hierarchy

The field settings screen now prioritizes a compact field list. Each field row summarizes:

- field name;
- optional description;
- friendly type label and internal identifier;
- behavior badges;
- usage badges;
- active/inactive state;
- contextual actions.

Create and edit forms remain available, but they are collapsed by default until the future drawer work in PCORE-008.2B.

## Badges

Behavior badges appear only when relevant:

- Principal
- Obligatorio
- No permite repetidos
- Valor predeterminado
- Formato validado
- Permite varios

Usage badges appear only when relevant:

- En listado
- En búsquedas
- Una relación / Varias relaciones
- Opciones configuradas by count
- Soporte limitado for file/image fields

The UI avoids negative badges such as "No obligatorio".

## Filters

The field list supports filtering by:

- text search over name, internal identifier, and description;
- field type;
- active/inactive state;
- usage: primary, list, search, validations, relation, options.

Filters are resolved during the server render and preserve a simple URL state.

## Actions

The primary visible action is Editar. Secondary actions are grouped in a menu:

- Subir
- Bajar
- Activar / Desactivar

The existing server actions are reused.

## Responsive

Rows are built as compact cards rather than a wide table. Badges wrap naturally, filters collapse into a vertical grid on narrow screens, and actions remain text-labeled.

## Future Drawer Boundary

PCORE-008.2A intentionally does not implement the full drawer editor. The collapsed forms are a transitional bridge so PCORE-008.2B can replace them with a progressive editor without changing the server-side configuration model again.
