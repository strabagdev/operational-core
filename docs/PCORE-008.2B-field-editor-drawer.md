# PCORE-008.2B Field Editor Drawer

## Objective

PCORE-008.2B replaces the temporary inline create/edit forms from PCORE-008.2A with a progressive field editor drawer. The domain model, server actions, validation parsers, and `EntityField.config` structure remain unchanged.

## Drawer Architecture

The entity field list remains server-rendered. Opening the editor is controlled by query params:

- `createField=1`
- `editField=<fieldId>`

This package originally rendered an accessible visual `role="dialog"` panel with a right-side layout on desktop and full-width layout on small screens.

PCORE-008.2C replaced the manual visual dialog with a Radix Dialog-based Sheet primitive in `src/components/ui/sheet.tsx`, preserving the same URL-driven drawer workflow while adding real focus trap, Escape handling, scroll lock, and focus restoration.

## Query Params

Opening or closing the drawer preserves field-list filters:

- `fieldQ`
- `fieldType`
- `fieldState`
- `fieldUse`

If `createField` and `editField` are both present, edit mode wins. Closing removes only editor params.

## Sections

The drawer groups the field form into progressive sections:

- Información básica;
- Comportamiento;
- Presentación;
- Validaciones;
- Relación, when the current field type is `RELATION`;
- Opciones, when editing a `SELECT` or `MULTISELECT` field.

Validations are collapsed by default because they are advanced configuration.

## Creation

Creation starts from name and type, with the internal key moved under advanced configuration. The current server action is reused. On success, the drawer closes and a notice is shown. On error, the drawer remains open through the preserved `returnTo` URL.

## Editing

Editing preloads existing field values, validation config, display config, relation config, and options. The existing server action preserves unknown config properties through the central merge helper.

## SELECT And MULTISELECT

Option editing is available inside the drawer when editing an existing option field. Options can be added, updated, activated, and deactivated. Physical deletion is still out of scope.

PCORE-008.2C adds creation and editing of options in the same editor submit, with transactional server persistence.

## RELATION

Relation fields expose product-language controls:

- Entidad relacionada;
- Una relación;
- Varias relaciones.

The server remains the source of truth for target validation and config preservation.

## Errors And Feedback

Server actions accept `returnTo` and `successTo` paths. Errors redirect back to the open drawer with a friendly message. Successful create/update closes the drawer and adds an inline notice.

## Responsive And Accessibility

The drawer uses a full-width panel on small screens and a constrained right-side panel on desktop. It includes a title, description, visible close action, overlay close link, and text labels for controls and badges.

## Superseded By PCORE-008.2C

PCORE-008.2C closes the main interaction debt from this package:

- real Sheet/Dialog primitive;
- pending button state;
- dirty-state close confirmation;
- dynamic type-specific sections in create mode;
- SELECT/MULTISELECT creation with options in one logical operation;
- RELATION creation with target and cardinality in one logical operation.
