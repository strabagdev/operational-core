# PCORE-008.2C Field Editor Interactions

## Objective

PCORE-008.2C turns the field editor into an interactive, accessible, progressive workflow. The Prisma schema remains unchanged. The server keeps domain validation authority, while the client handles immediate UX feedback.

## Sheet Primitive

The editor uses a local `src/components/ui/sheet.tsx` built on `@radix-ui/react-dialog`. This provides focus trap, Escape support, focus restoration, overlay behavior, body scroll lock, associated title/description, keyboard navigation, and `aria-modal` through the primitive.

`@radix-ui/react-dialog` was added as the only new dependency because the project had Radix primitives but not Dialog.

## URL And Client State

The URL remains the source of truth for open state:

- `createField=1`
- `editField=<fieldId>`

Closing removes only editor params and preserves filters and unrelated params. The client owns transient editor state: dirty, pending, selected type, generated key, options, relation config, and client-side field errors.

## Progressive Form

`field-editor-form.tsx` is a client component using `useActionState` and `useFormStatus`. Changing the field type immediately shows or hides:

- options for `SELECT` and `MULTISELECT`;
- relation target and cardinality for `RELATION`;
- multiple-value behavior for compatible types;
- primary-field affordances for compatible types.

Simple fields can be created with only name and type. Advanced validation remains collapsed.

## Key Generation

Creation generates the internal key from the name with `normalizeFieldKey`. It updates while the key is untouched and stops once the user edits the key. Editing does not regenerate the key and warns about integrations/references.

Examples:

- `Nombre completo` -> `nombre_completo`
- `Fecha de ingreso` -> `fecha_de_ingreso`
- `N.º de contrato` -> `numero_de_contrato`

## Defaults

Creation defaults are centralized in `field-editor-state.ts`:

- active: true;
- required: false;
- unique: false;
- searchable: false unless first compatible primary suggestion applies;
- primary/show in list/search enabled only for the first compatible field when there is no primary;
- multiple enabled for `MULTISELECT` and `RELATION`.

Activating Campo principal visibly enables list display and search.

## SELECT And MULTISELECT

Creation and editing now use one editor submit for field plus options. Option rows support label, internal value, active state, add, remove new rows, and move up/down. Server-side creation is transactional, so a failing option does not leave a partial field.

Existing options are updated in place. Physical deletion is still not implemented. If a field already has values, internal option values are treated as immutable to avoid invalidating stored records.

## RELATION

Relation creation shows target entity and relation kind immediately. The server validates that the target entity belongs to the same contract. The relation config is saved with the field in one operation and unknown config properties are preserved on edit.

Type changes are blocked when existing `EntityValue` or `EntityRelation` rows exist.

## Errors, Pending, And Dirty State

New editor actions return structured state on failure:

- general message;
- `fieldErrors`;
- preserved submitted values.

Successful saves redirect to `successTo`, close the sheet, and show inline notices:

- `Campo creado correctamente.`
- `Cambios guardados.`

During submit, the primary button uses real pending state, prevents double submit, and disables cancel/close paths. Dirty close attempts open a Radix-based confirmation dialog with Seguir editando and Descartar cambios.

## List Actions

Field activation/deactivation from the list preserves the current path and returns inline feedback. The server blocks deactivating a primary field.

## Security

Server actions still require an authenticated user and reuse tenant-scoped helpers:

- contract authorization;
- entity type contract membership;
- field membership under entity type;
- relation target under the same contract;
- option membership under field.

Client ids are never trusted as authorization proof.

## Remaining Limitations

- Manual browser verification against Railway data was avoided to prevent demo-data mutation.
- Option physical deletion remains out of scope.
- Changing relation target/cardinality with existing relations is blocked through the same data-present type policy; no migration flow is implemented.
- Default-value controls for options are intentionally minimal in this package and can be refined later.

## PCORE-008.2D Acceptance Note

PCORE-008.2D added final hardening:

- `returnTo` and `successTo` now reject external/protocol-relative paths;
- option payloads are capped at 500 rows per submit;
- editor payload tests cover simple fields, option fields, relation payloads, duplicate options, and payload size;
- Next.js was patched to `16.2.12`;
- npm audit debt and the lack of a safe mutable database are documented in `docs/PCORE-008.2D-field-configuration-acceptance.md`.
