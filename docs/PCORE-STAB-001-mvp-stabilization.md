# PCORE-STAB-001 - MVP Stabilization

## Objetivo

Congelar nuevas funcionalidades y estabilizar Operational Core hasta dejarlo listo como MVP confiable.

Reglas de la fase:

- No implementar features nuevas.
- No expandir alcance.
- No refactorizar arquitectura sin evidencia.
- No hacer commit ni push durante la fase.
- No usar Playwright ni agent-browser.
- No usar `migrate reset`, `db push` ni truncar tablas.
- Usar datos temporales identificables con `_STAB_TEST` cuando se requieran pruebas mutantes.

## Principio De Validacion

Cada flujo debe verificarse de extremo a extremo:

```text
accion del usuario -> request -> validacion -> persistencia -> respuesta -> UI resultante -> recarga -> persistencia confirmada
```

Lint, tests y build son necesarios, pero no suficientes para cerrar esta fase.

## Estado Inicial

Fecha de inicio: 2026-08-11.

Estado observado:

- Worktree con cambios pendientes previos a esta fase.
- Logout superior bajo investigacion activa.
- `AGENTS.md` aparece modificado tras levantar el dev server local; no se revierte automaticamente.
- No se ha hecho commit ni push.

## Matriz

| Area | Caso | Resultado | Evidencia | Correccion |
| --- | --- | --- | --- | --- |
| Auth y navegacion | Login correcto | PASS PARCIAL | Confirmado durante desarrollo y por el usuario; servidor Auth.js activo y rutas protegidas cubiertas por tests. | - |
| Auth y navegacion | Login incorrecto | PASS PARCIAL | Flujo de credenciales mantiene error sin autenticar; no se rehizo Bloque 1 en cierre final. | - |
| Auth y navegacion | Sesion persiste tras recarga | PASS PARCIAL | Confirmado manualmente durante desarrollo; Auth.js conserva sesion por cookie propia estable. | Cookie propia de Operational Core. |
| Auth y navegacion | Abrir `/login` autenticado | PASS PARCIAL | Proxy/Auth route policy cubre redireccion de rutas segun sesion; no se re-ejecuto navegador en cierre final. | - |
| Auth y navegacion | Logout desde boton superior | PASS PARCIAL | Usuario confirmo que login/logout y menu de usuario funcionan; componente restaurado con formulario HTML `POST /api/logout` dentro del dropdown. | Se elimino dependencia de Server Action para logout. |
| Auth y navegacion | Logout elimina sesion | PASS | `POST /api/logout` por curl responde `303` a `/login` y expira `operational-core.session-token`, `__Secure-operational-core.session-token`, callback y csrf propios. | Ruta `src/app/api/logout/route.ts`. |
| Auth y navegacion | `/app` tras logout redirige a login | PASS | Verificado por curl contra flujo Auth.js signout: `/api/auth/session` -> `null`; `/app` -> `307 /login?callbackUrl=%2Fapp`. | - |
| Auth y navegacion | Back/forward | PASS PARCIAL | Navegacion principal usable confirmada manualmente durante desarrollo; ciclos completos back/forward quedan como verificacion visual manual. | - |
| Auth y navegacion | Cookies local/secure | PASS | Tests `auth-cookies` cubren variantes local y secure, incluyendo limpieza de logout. | `src/lib/auth-cookies.test.ts`. |
| Auth y navegacion | Ausencia de redirect loops | PASS PARCIAL | No se observaron loops en verificaciones HTTP/manuales; proxy redirige `/app` sin sesion a `/login?callbackUrl=%2Fapp`. | - |
| Auth y navegacion | Reinicio servidor con `AUTH_SECRET` estable | PASS PARCIAL | Documentado como requisito operacional; no se imprime ni versiona el secreto. | `docs/DEVELOPMENT.md`. |
| Contratos | Listar | PASS | `getContractAdministration` filtra por membresias ADMIN; busqueda por nombre/codigo cubierta por query Prisma. Filtro `ALL` corregido y testeado. | `parseContractAdministrationStatus` conserva `ALL`. |
| Contratos | Crear | PASS PARCIAL | Servidor cubre organizacion autorizada, codigo duplicado, trim y auditoria `CONTRACT_CREATED`. Interaccion abrir/cancelar/X/Escape queda BLOCKED sin browser. | - |
| Contratos | Editar | PASS PARCIAL | Servidor cubre cambios nombre/codigo/status, no permite mover organizacion por payload, y audita `CONTRACT_UPDATED`/`CONTRACT_STATUS_CHANGED`. Interaccion Sheet queda BLOCKED sin browser. | - |
| Contratos | Guardar y cerrar Sheet | PASS PARCIAL | `successTo={closeHref}` elimina params de modal y agrega notice en success; errores redirigen a `returnTo` manteniendo modal abierto. Verificacion visual real BLOCKED sin browser. | Mensajes `error`/`notice` mutuamente excluyentes. |
| Contratos | Cancelar | PASS PARCIAL | `closeHref` remueve params de modal y conserva filtros; cierre dirty muestra confirmacion local. Ciclos visuales reales BLOCKED sin browser. | - |
| Contratos | Archivar | PASS PARCIAL | Servidor cambia a `ARCHIVED`, audita `CONTRACT_ARCHIVED`, y success cierra modal. Confirmacion visual real BLOCKED sin browser. | Links limpian mensajes obsoletos. |
| Contratos | Restaurar | PASS | Servidor restaura `ARCHIVED` a `ACTIVE` y audita `CONTRACT_RESTORED`; selector operacional solo expone ACTIVE. | - |
| Contratos | Eliminar contrato archivado con confirmacion | PASS | Solo `ARCHIVED`, confirmacion exacta `ELIMINAR <CODIGO>`, transaccion unica y borrado de dependencias reales testeados. | - |
| Contratos | ACTIVE visible en operacion | PASS | `getUserContracts` filtra `status: ACTIVE`; test de selector. | - |
| Contratos | INACTIVE/ARCHIVED fuera de operacion | PASS | `getAuthorizedContract` exige `status: ACTIVE`, por lo tanto rutas operativas rechazan no activos. | Test agregado. |
| Contratos | Contrato de otra organizacion rechazado | PASS | Creacion con `organizationId` ajeno rechaza; contractId ajeno retorna null bajo membresia ADMIN requerida. | - |
| Contratos | UI sin overlays bloqueantes | BLOCKED | La consigna exige 20 ciclos reales con abrir/cerrar/Escape/overlay/click; no se puede afirmar PASS sin browser y el usuario prohibio Playwright/agent-browser. | Sin evidencia de codigo de overlays persistentes; queda prueba manual pendiente. |
| Entidades y campos | Crear/editar EntityType | PASS PARCIAL | Servidor valida contrato activo/autorizado, EntityType del contrato, create sin campos implicitos y update nombre/descripcion. Flujos visuales volver/cancelar quedan BLOCKED sin browser. | - |
| Entidades y campos | Field types completos | PASS | Los 16 tipos reales aparecen en selector, tienen label/descripcion y parser acepta payloads. Tests agregados confirman create/update persistiendo cada `EntityFieldType`. | - |
| Entidades y campos | Type persistence en editor | PASS | `initialType = defaultValues?.type ?? "TEXT"`; create usa TEXT por defecto y edit usa `field.type` real. Tests cubren no caer a TEXT. | - |
| Entidades y campos | Required | PASS | Una sola fuente visible `required`; persiste true/false y merge mantiene `validation.required`. | Tests existentes. |
| Entidades y campos | Unique | PASS PARCIAL | Parser/servidor persisten `isUnique` sin tocar required/search/display/config. Reapertura visual BLOCKED sin browser. | - |
| Entidades y campos | Searchable | PASS PARCIAL | Parser/servidor persisten `searchable`; primary puede activar searchable segun regla actual de UI. Reapertura visual BLOCKED sin browser. | - |
| Entidades y campos | Primary | PASS | Tipos compatibles definidos y validados; incompatible rechaza; un nuevo primary desmarca anteriores; displayName usa primary y SELECT usa label. | - |
| Entidades y campos | Show in list | PASS | `showInList` persiste en config; primary se excluye de columnas duplicadas; orden usa `sortOrder`, no `display.listOrder`. | - |
| Entidades y campos | Sort order | PASS PARCIAL | `EntityField.sortOrder` es fuente oficial en config/listado/display; reorder servidor cubierto. Subir/bajar visual y recarga manual BLOCKED sin browser. | - |
| Entidades y campos | MONEY | PASS | CLP default, USD/EUR/UF soportados, valores grandes guardan Decimal, cambio moneda no convierte valores y merge conserva validation/display/custom. | - |
| Entidades y campos | DATE/DATETIME | PASS PARCIAL | DATE usa helper date-only para valores de registro y display evita drift; DATETIME mantiene semantica separada. Flujo UI/Excel completo queda para bloques/manual. | - |
| Entidades y campos | SELECT opciones | PASS | Opciones persisten, editan, ordenan, desactivan; eliminacion fisica solo sin uso; usadas se desactivan y labels historicos siguen visibles. | - |
| Entidades y campos | MULTISELECT opciones | PASS | Persistencia usa el mismo path de opciones; deteccion de uso consulta array JSON con `@>`; labels historicos desde json array cubiertos. | - |
| Entidades y campos | Pegar lista | PASS | Trim, lineas vacias, duplicados case-insensitive y limite central 500 cubiertos cliente/servidor. 501 rechaza sin truncar. | - |
| Entidades y campos | FieldOptions payload | PASS | Payload JSON estructurado `fieldOptionsPayload`; ids existentes preservados; ausencia no borra; eliminacion solo explicita. | - |
| Entidades y campos | RELATION | PASS PARCIAL | ONE/MANY, target y contrato del target validados; config merge conserva relacion. Creacion de records relacionados queda fuera de este bloque. | - |
| Entidades y campos | FILE/IMAGE | PASS PARCIAL | Aparecen en selector/listado con "Soporte limitado" y no requieren storage. Persistencia de valores no implementada por alcance actual. | - |
| Entidades y campos | Cambio de tipo | PASS | Campo sin datos puede cambiar; con EntityValue o EntityRelation se bloquea con mensaje claro. | - |
| Entidades y campos | Config merge | PASS | Tests cruzados cubren required, display, money.currency, relation, validation y config desconocida sin reemplazo accidental. | - |
| Entidades y campos | Sheet/UI overlays | BLOCKED | Abrir/cerrar/dirty/Escape/overlay/cambiar entre campos requiere interaccion real; no se uso browser por instruccion explicita. | - |
| Entidades y campos | Seguridad tenant | PASS | `getAuthorizedContract` + `getAuthorizedEntityType` filtran contrato activo, organizacion y EntityType; relation target y optionId ajenos se rechazan. | - |
| Entidades y campos | Performance | PASS PARCIAL | Revision estatica: solo monta `FieldEditorOverlay` para modo activo; opciones se incluyen con fields y usage se calcula para opciones del campo editado. Mediciones 5/20/50 reales BLOCKED sin browser/start. | - |
| Registros | Listado | PASS PARCIAL | Servidor carga records paginados, solo valores de columnas `showInList`, primary no duplica, sin status tecnico. Verificacion visual real BLOCKED sin browser. | - |
| Registros | Crear | PASS PARCIAL | Action success redirige a detalle canonico lectura; errores quedan en `/new` con valores/fieldErrors. Flujo visual real BLOCKED sin browser. | - |
| Registros | Guardar -> detalle lectura | PASS | Tests `records/actions` cubren create success -> `/records/[entityType]/[recordId]` sin modo edicion. | - |
| Registros | Editar desde listado -> edicion directa | PASS | Link de tabla usa `entityRecordEditPath(...)?edit=1`; test de rutas cubre entrada directa. | - |
| Registros | Guardar edicion -> lectura | PASS | Update success redirige a detalle sin `edit=1` con notice `Cambios guardados.`. | - |
| Registros | Cancelar | PASS | `entityRecordCancelEditPath` vuelve al detalle canonico sin query de edicion. | - |
| Registros | Error validacion -> permanece editando | PASS | Create/edit preservan `formValues`; edit error conserva `edit=1` y `fieldErrors`. | - |
| Registros | Eliminacion individual/masiva | PASS PARCIAL | Bulk delete permanente exige `ELIMINAR N REGISTROS`, borra relations/values/audit en transaccion y rechaza ids ajenos. Click/modal real BLOCKED sin browser. | - |
| Registros | Paginacion/busqueda/display/columnas | PASS | Busqueda DB-side por displayName/text/email/phone/url/select label; count + skip/take; pageSize 25/50/100 visible; columnas por `showInList`. | Selector `pageSize` agregado al filtro. |
| Tipos de datos | TEXT/TEXTAREA | PASS | Manual y Excel reutilizan `validateRecordValues`; trim, vacio opcional, required, min/max y regex cubiertos. | - |
| Tipos de datos | INTEGER | PASS | Manual y Excel comparten rango INT4; `2147483647` y `-2147483648` validos; `2147483648`, `5269808713` y `1.5` rechazados antes de Prisma. | Rango INT4 agregado al motor compartido. |
| Tipos de datos | DECIMAL/MONEY | PASS | DECIMAL no cae a INTEGER; MONEY grande usa Decimal, currency queda en config/display y no en `EntityValue`. | - |
| Tipos de datos | BOOLEAN | PASS | Manual envia `false` explicito; Excel acepta Verdadero/Falso/true/false/Si/No/1/0; Excel vacio opcional queda sin valor. | Hidden false en formulario y ausencia real queda vacia. |
| Tipos de datos | DATE/DATETIME | PASS PARCIAL | DATE sin drift manual/Excel; DATETIME usa ISO/Date y preserva hora segun `Date` runtime actual. Timezone DATETIME queda deuda documentada. | - |
| Tipos de datos | EMAIL/PHONE/URL | PASS | Manual y Excel pasan por el mismo motor; EMAIL/URL invalidos fallan antes de DB. | - |
| Tipos de datos | SELECT/MULTISELECT/RELATION | PASS PARCIAL | SELECT/MULTISELECT end-to-end por labels Excel -> values internos, json array y display labels; relation fuera de Excel por alcance. Flujo visual completo BLOCKED sin browser. | - |
| Excel | Plantilla | PASS | Una hoja, headers exactos por campos activos importables, `sortOrder`, sin RELATION/FILE/IMAGE/metadatos/IDs/versiones. | - |
| Excel | Validacion estructural | PASS | Correcto, faltante, extra, duplicado, vacio, no xlsx, >5MB, >5000 filas y formulas sin resultado cubiertos. | - |
| Excel | Importacion | PASS PARCIAL | 1/100/414/500 cubiertos por plan/persistencia batch; all-or-nothing y no escritura parcial cubiertos. Tiempos reales BLOCKED sin entorno de medicion. | - |
| Excel | Manual vs Excel equivalence | PASS | Fixture representativo TEXT/INTEGER/DECIMAL/MONEY/BOOLEAN/DATE/SELECT/MULTISELECT compara `EntityValue` normalizado campo por campo. | Test principal agregado. |
| Excel | DATA-IN invariant | PASS | Tests confirman importacion no llama writes de EntityType/EntityField/FieldOption ni muta config/sortOrder/type/options. | - |
| Auditoria | Creacion de EntityRecord | PASS | `createEntityRecord` valida contrato/EntityType autorizado, persiste record/values/relations y crea `RECORD_CREATED` dentro de la misma transaccion con `actorUserId` de sesion. | Tests de lifecycle y audit. |
| Auditoria | Edicion de EntityRecord y cambios de valores | PASS | `updateEntityRecord` calcula `AuditChange` con `fieldId`, `fieldName`, `oldValue`, `newValue`; `RECORD_UPDATED` solo se crea si hay cambios de valores. | Test `audit` para serializacion y changes. |
| Auditoria | Relaciones agregadas/removidas | PASS | `updateEntityRecord` crea `RELATION_ADDED`/`RELATION_REMOVED` en la misma transaccion cuando cambian relaciones. Targets se serializan con id/display/entityType. | Revision de `entity-records.ts` + tests de relation security. |
| Auditoria | Contratos creados/editados/estado/archivado/restauracion | PASS | `contract-admin` crea `CONTRACT_CREATED`, `CONTRACT_UPDATED`, `CONTRACT_STATUS_CHANGED`, `CONTRACT_ARCHIVED`, `CONTRACT_RESTORED` dentro de transaccion. | Tests `contract-admin`. |
| Auditoria | Eventos legacy de status tecnico de EntityRecord | PASS | No hay rutas actuales que creen `RECORD_ARCHIVED`, `RECORD_RESTORED` ni `RECORD_STATUS_CHANGED`; solo quedan labels/enum historicos sin uso operativo. | Busqueda estatica. |
| Auditoria | Excel import | PASS | Cada fila importada genera `RECORD_CREATED` y `AuditChange` en batch; todo se ejecuta en una sola transaccion y errores de auditoria se propagan. | Tests `entity-import` y `entity-import-persistence`. |
| Auditoria | Eliminacion fisica | PASS | Delete permanente de records/contract elimina auditoria asociada dentro de la misma transaccion. Decision documentada: eliminacion fisica destruye historial contractual asociado. | Tests `entity-record-bulk-actions` y `contract-admin`. |
| Auditoria | Historial y activity | PASS PARCIAL | `getRecordAuditHistory` y `getContractActivity` filtran por contrato autorizado, ordenan `createdAt desc` y paginan. Visual real de paginas queda BLOCKED sin browser. | Test `audit`. |
| Auditoria | Performance | PASS | Listados normales no incluyen audit history; auditoria se carga solo en detalle/activity o al escribir. | Test `entity-record-search`. |
| Multiempresa y seguridad | Tenant boundary base | PASS | `getAuthorizedContract` exige contrato ACTIVE y membership por organizacion; operaciones operativas encadenan Contract -> EntityType -> Field/Record/Option/Relation. | Revision + tests existentes. |
| Multiempresa y seguridad | Contratos | PASS | Admin requiere membership ADMIN; organizationId manipulado se rechaza; contrato ajeno o sin ADMIN retorna null; INACTIVE/ARCHIVED no son operativos. | Tests `contract-admin`, `contracts`, `contract-status`. |
| Multiempresa y seguridad | EntityType | PASS | `getAuthorizedEntityType` y `getAuthorizedRecordEntityType` validan `contractId` autorizado + `entityTypeId`; EntityType ajeno retorna null. | Tests de config/records. |
| Multiempresa y seguridad | EntityField | PASS | Mutaciones de field buscan el field dentro del EntityType autorizado antes de actualizar/desactivar/reordenar. | Tests `entity-config-persistence`. |
| Multiempresa y seguridad | FieldOption | PASS | Opciones se autorizan por campo correcto; optionId ajeno se rechaza; delete revalida SELECT/MULTISELECT y uso dentro de transaccion serializable. | Tests `field-option-usage` y `entity-config-persistence`. |
| Multiempresa y seguridad | EntityRecord y bulk ids | PASS | Record detail/update/delete validan EntityType autorizado; bulk delete verifica que todos los ids existan en el contexto antes de borrar. | Tests `entity-record-bulk-actions`. |
| Multiempresa y seguridad | Relaciones | PASS | TargetRecord debe existir en el mismo contrato y en el EntityType objetivo configurado; self relation se rechaza en edit. | Test `entity-record-lifecycle`. |
| Multiempresa y seguridad | Excel | PASS | Importacion obtiene contexto via EntityType autorizado; labels SELECT/MULTISELECT se resuelven dentro del field; no acepta IDs ni muta configuracion. | Tests `entity-import-persistence`. |
| Multiempresa y seguridad | Busqueda/count/paginacion | PASS | Busqueda DB-side incluye `entityTypeId`; `count` y `findMany` usan el mismo `where` autorizado. | Test `entity-record-search`. |
| Multiempresa y seguridad | Delete | PASS | Record delete revalida contract/entityType/ids; contract delete exige ADMIN, ARCHIVED y confirmacion exacta. | Tests de bulk records y contract delete. |
| Multiempresa y seguridad | Return URLs | PASS | `safeAppRedirectPath` rechaza externo, protocol-relative, `javascript:` por parser/origin y rutas fuera de `/app`. | Tests `action-redirects`. |
| UI/interaccion | Overlays, foco, pending, mobile/desktop | PASS CON DEUDA MENOR | Login/logout, menu de usuario y navegacion principal fueron confirmados manualmente; verificaciones visuales exhaustivas y mobile quedan manuales por prohibicion de browser automatizado. | Deuda aceptada. |
| Performance | Paginacion, payload, busqueda DB-side, N+1 | PASS CON DEUDA MENOR | Listado paginado server-side, default 50, opciones 25/50/100, payload reducido, busqueda DB-side y auditoria fuera de listado normal. Latencia local afectada por Railway remoto. | Sin nuevas optimizaciones en cierre. |

## Bugs Encontrados

| Bug | Estado | Evidencia | Correccion |
| --- | --- | --- | --- |
| Logout superior no dispara flujo confiable | EN CURSO | Usuario reporta que el boton no hace nada. Curl confirma `POST /api/logout` funcional. | Boton movido fuera de dropdown/portal y cambiado a formulario HTML normal `POST /api/logout`; pendiente click manual. |
| Contratos `status=ALL` listaba solo activos | CORREGIDO | `parseContractStatus` local no aceptaba `ALL` y devolvia `ACTIVE`; el filtro "Todos" no podia listar INACTIVE/ARCHIVED. | Estado centralizado en `parseContractAdministrationStatus`; tests `contract-status` y `contract-admin`. |
| Mensajes obsoletos en modales de contratos | CORREGIDO | Links de apertura podian conservar `error`/`notice` anteriores en query params. | Links de modal limpian mensajes; `withActionMessage` elimina el mensaje opuesto. |
| Editor de campos arrastraba notice viejo al abrir Sheet | CORREGIDO | `buildFieldEditorHref` preservaba `notice` tambien al abrir create/edit, dejando mensajes obsoletos detras del editor. | El helper conserva `notice` solo al cerrar; tests `field-editor-navigation`. |
| INTEGER de registros podia exceder INT4 antes de llegar a Prisma | CORREGIDO | `normalizeRawFieldValue` validaba formato entero, pero no rango PostgreSQL `-2147483648..2147483647`. | Validacion INT4 explicita y test para `5269808713`; MONEY sigue aceptando valores grandes como Decimal. |
| Listado de registros no exponia selector visible 25/50/100 | CORREGIDO | El servidor aceptaba `pageSize`, pero el formulario solo preservaba un hidden value. | Selector visible `25/50/100` agregado; busqueda/cambio de page size no conserva `page`. |
| Excel BOOLEAN vacio opcional importaba `false` | CORREGIDO | Excel sin celda y checkbox manual ausente eran indistinguibles; `validateRecordValues` empujaba BOOLEAN aunque fuera ausencia real. | El formulario manual envia `false` explicito; ausencia real queda vacia y Excel `No/false/0` sigue importando false. |

## Deuda Aceptada

- Semantica timezone de `DATETIME` requiere definicion mas explicita antes de ampliar integraciones.
- `FILE` e `IMAGE` tienen soporte limitado visible; no hay storage ni persistencia de archivos por alcance MVP.
- Excel no importa campos `RELATION`, `FILE` ni `IMAGE`.
- Verificaciones visuales exhaustivas, mobile, foco y ciclos de overlays quedan manuales porque no se uso browser automatizado.
- Performance de importacion Excel masiva no fue medida en entorno productivo real.
- `npm audit --omit=dev` mantiene findings vigentes en dependencias transitivas: `brace-expansion` high, `nanoid` high y `uuid` moderate via `exceljs`. No se aplico `npm audit fix` en cierre; `uuid` propone `--force` con cambio breaking de `exceljs`.

## Limitaciones

- No se usa Playwright ni agent-browser.
- La comprobacion visual exhaustiva requiere prueba manual del usuario o herramientas HTTP/DOM disponibles.
- Las pruebas mutantes deben usar datos `_STAB_TEST` y evitar datos reales.

## Smoke Tests

### Auth y navegacion

- `npm run test -- contract-logout-form logout auth-cookies auth-route-policy`: PASS.
- Login/logout/menu de usuario/navegacion principal: PASS PARCIAL por confirmacion manual del usuario durante estabilizacion.
- `POST /api/logout` local por curl: PASS, respuesta `303 See Other` a `/login`.
- `POST /api/logout` local por curl: PASS, envia `Set-Cookie` con `Max-Age=0` para cookies propias local/secure.
- `GET /api/auth/session` despues de Auth.js signout local: PASS, devuelve `null`.
- `GET /app` despues de Auth.js signout local: PASS, devuelve `307` a `/login?callbackUrl=%2Fapp`.
- Click manual del boton superior: PASS PARCIAL por confirmacion manual; ruta tecnica sigue siendo formulario HTML `POST /api/logout`.

### Contratos

- `npm run test -- contract-admin contract-status action-redirects contracts`: PASS, 12 archivos y 64 tests.
- Listado admin: PASS por revision de servidor y tests. Incluye busqueda por nombre/codigo y filtros ACTIVE/INACTIVE/ARCHIVED/ALL.
- Creacion: PASS servidor; BLOCKED interaccion real abrir/cancelar/X/Escape sin browser.
- Edicion: PASS servidor; BLOCKED interaccion real del Sheet sin browser.
- Sheet: PASS PARCIAL por URL `returnTo`/`successTo`, preservacion de filtros y cierre en success; BLOCKED ciclos visuales.
- Archivado: PASS servidor y navegacion; BLOCKED confirmacion visual real.
- Restauracion: PASS servidor.
- Eliminacion destructiva: PASS servidor; solo ARCHIVED, confirmacion exacta, autorizacion y dependencias cubiertas.
- Contrato activo operacional: PASS por `getUserContracts`.
- INACTIVE/ARCHIVED fuera de operacion: PASS por `getAuthorizedContract`.
- Autorizacion: PASS servidor para organizacion ajena, contractId ajeno y usuario sin ADMIN.
- Auditoria: PASS servidor para `CONTRACT_CREATED`, `CONTRACT_UPDATED`, `CONTRACT_STATUS_CHANGED`, `CONTRACT_ARCHIVED`, `CONTRACT_RESTORED`.
- Navegacion: PASS PARCIAL por helpers de query params; atras/adelante/reload real BLOCKED sin browser.
- Overlays/UI lock: BLOCKED para los 20 ciclos reales requeridos; no se uso browser por instruccion explicita.
- Performance: BLOCKED para medicion real en `dev` y `npm run start`; no se optimizo sin evidencia.

### Entidades y campos

- `npm run test -- entity-config-persistence field-editor-navigation entity-config-editor-input field-editor-state field-options-editor-state field-validation`: PASS, 6 archivos y 84 tests.
- `npm run test -- field-editor-form field-options-editor field-list-item field-list-ux entity-field-order entity-config-persistence entity-config-editor-input field-option-usage entity-record-display date-only money`: PASS, 12 archivos y 96 tests.
- EntityType: PASS PARCIAL por servidor/autorizacion; navegacion real BLOCKED sin browser.
- 16 tipos: PASS, selector/labels/parser/create/update cubiertos.
- Type persistence: PASS; edit usa `field.type` real y create default TEXT.
- Required/unique/searchable/primary/showInList: PASS/PASS PARCIAL segun cobertura servidor vs reapertura visual.
- Sort order: PASS PARCIAL; fuente oficial `EntityField.sortOrder`, visual real BLOCKED.
- MONEY: PASS para config y valores canonicos; no conversion al cambiar moneda.
- DATE/DATETIME: PASS PARCIAL; valores DATE sin drift cubiertos, flujos UI/Excel completos pendientes de bloques/manual.
- SELECT/MULTISELECT: PASS para persistencia, payload, delete/disable, uso en SELECT y array MULTISELECT.
- Bulk options: PASS, limite 500 centralizado.
- RELATION: PASS PARCIAL; config y seguridad cubiertas, records relacionados fuera de alcance.
- FILE/IMAGE: PASS PARCIAL como soporte limitado visible; sin storage por decision actual.
- Sheet/UI overlays: BLOCKED para ciclos reales.
- Performance 5/20/50: BLOCKED para medicion real; no se optimizo sin evidencia.

### Registros

- `npm run test -- field-validation entity-record-lifecycle entity-record-display entity-record-search entity-record-routes entity-record-bulk-actions entity-record-bulk-selection entity-record-pagination-ui record-form`: PASS, 9 archivos y 63 tests.
- Listado: PASS PARCIAL; servidor paginado, columnas `showInList`, labels SELECT/MULTISELECT, DATE y MONEY cubiertos; inspeccion visual BLOCKED.
- Creacion: PASS PARCIAL; success -> detalle lectura, error -> formulario con valores/errores.
- Edicion: PASS; listado abre `?edit=1`, guardar vuelve a detalle lectura y cancelar limpia edit.
- Detalle: PASS PARCIAL; display de campos, relaciones e historial por servidor/UI estatica; visual real BLOCKED.
- INTEGER: PASS; rango INT4 validado antes de Prisma con error de campo.
- MONEY: PASS; `5269808713` persiste como Decimal y vuelve al input limpio.
- DATE/DATETIME: PASS PARCIAL; DATE sin drift en listado/detalle/edit; DATETIME mantiene formatter actual.
- SELECT/MULTISELECT: PASS; value interno en DB, labels en display, opciones inactivas historicas visibles e invalidas rechazadas.
- Validaciones: PASS PARCIAL; required, unique, min/max, regex, email, URL y defaults cubiertos por helpers; UI real BLOCKED.
- DisplayName: PASS; primary define displayName, SELECT primary usa label, fallback existe y primary no duplica en listado.
- Busqueda: PASS; DB-side por displayName/text-like/searchable/SELECT labels, case-insensitive y paginada.
- Paginacion: PASS; count + skip/take, 25/50/100 y busqueda resetea pagina.
- Seleccion multiple: PASS PARCIAL; estado select one/many/all/indeterminate/clear cubierto; clicks reales BLOCKED.
- Eliminacion: PASS PARCIAL; bulk permanente atomico y sin huerfanos; dialog/click real BLOCKED.
- Relaciones: PASS PARCIAL; ONE/MANY, inversas y contrato ajeno por servidor; edicion visual BLOCKED.
- Auditoria: PASS PARCIAL; create/update/relation audit en transaccion; validaciones fallidas ocurren antes de transaction. Historial visual BLOCKED.
- Performance 10/50/400: BLOCKED para medicion real; revision confirma payload paginado y valores de columnas.

### Tipos de datos + Excel

- `npm run test -- entity-import entity-import-persistence field-validation record-form entity-record-display money date-only`: PASS, 7 archivos y 86 tests.
- Manual vs Excel: PASS para fixture TEXT/INTEGER/DECIMAL/MONEY/BOOLEAN/DATE/SELECT/MULTISELECT.
- TEXT/TEXTAREA: PASS por motor compartido de validacion.
- INTEGER: PASS; rango INT4 compartido manual/Excel.
- DECIMAL/MONEY: PASS; MONEY grande no usa INT4 y currency no se persiste en value.
- BOOLEAN: PASS; Excel vacio opcional queda sin value, valores falsos explicitos se guardan como false.
- DATE: PASS; fecha calendario sin drift.
- DATETIME: PASS PARCIAL; soportado con `Date`/ISO actual, timezone semantico queda deuda.
- EMAIL/PHONE/URL: PASS por motor compartido.
- SELECT/MULTISELECT: PASS; Excel resuelve labels activos a values internos y no muta opciones.
- Defaults: PASS; se aplican en create si celda/input vacio y no pisan `0`, `false` o valor explicito.
- UNIQUE/REQUIRED: PASS; duplicados intra-archivo/DB y required bloquean archivo sin registros parciales.
- Plantilla/estructura: PASS; sin RELATION/FILE/IMAGE ni metadata.
- Importacion batch: PASS PARCIAL; 414 filas cubiertas por batched writes. Tiempo real BLOCKED.
- DATA-IN invariant: PASS.

### Auditoria + seguridad multiempresa

- `npm run test -- audit entity-record-search entity-config-persistence entity-import-persistence entity-record-lifecycle field-option-usage entity-record-bulk-actions contract-admin action-redirects`: PASS.
- Eventos EntityRecord: PASS; create/update/relation events se crean con `actorUserId` server-side dentro de transaccion.
- Eventos contrato: PASS; create/update/status/archive/restore auditados por servidor ADMIN.
- Eventos legacy EntityRecord status: PASS; no hay productores actuales para `RECORD_ARCHIVED`, `RECORD_RESTORED`, `RECORD_STATUS_CHANGED`.
- AuditChange: PASS; `fieldId`, `fieldName`, before/after y serializacion estable de Decimal/DATE/SELECT/MULTISELECT cubiertos.
- Excel audit: PASS; plan batch crea AuditEvent/AuditChange por fila y rollback conserva all-or-nothing.
- Eliminacion fisica: PASS; records/contract eliminan auditoria asociada dentro de la misma transaccion. Se acepta que delete fisico destruye historial asociado.
- Activity/historial: PASS PARCIAL; scoping, orden y paginacion por servidor cubiertos; inspeccion visual real BLOCKED sin browser.
- Tenant boundary: PASS; contract ACTIVE + membership por organizacion como raiz y validacion encadenada para EntityType/Field/Option/Record/Relation.
- FieldOption: PASS; optionId ajeno al field se rechaza y delete revalida uso en SELECT/MULTISELECT dentro de transaccion serializable.
- Relaciones: PASS; targetRecord debe pertenecer al contrato y EntityType objetivo configurado.
- Excel security: PASS; importacion no acepta ids de usuario ni muta EntityType/EntityField/FieldOption.
- Busqueda/count: PASS; `count` y `findMany` comparten exactamente el mismo `where` autorizado.
- Return URLs: PASS; externo, protocol-relative, `javascript:` y rutas fuera de `/app` caen a fallback.

## Consolidacion Final

| Bloque | Resultado | Evidencia principal | Deuda |
| --- | --- | --- | --- |
| Bloque 1 - Auth/Navegacion | PASS CON DEUDA MENOR | Login/logout/menu/navegacion confirmados manualmente; endpoint logout y cookies cubiertos por curl/tests. | Verificacion visual exhaustiva manual. |
| Bloque 2 - Contratos | PASS CON DEUDA MENOR | Admin, estado, archivo/restauracion/delete y auditoria cubiertos por servidor/tests. | Ciclos visuales de Sheet manuales. |
| Bloque 3 - Entidades/Campos | PASS CON DEUDA MENOR | Tipos, opciones, relation config, field editor state y tenant guard cubiertos por tests. | FILE/IMAGE limitado; UI visual manual. |
| Bloque 4 - Registros | PASS CON DEUDA MENOR | Crear/editar/detalle/listado/busqueda/paginacion/bulk delete cubiertos por tests. | Clicks/modales reales manuales. |
| Bloques 5/6 - Tipos + Excel | PASS CON DEUDA MENOR | Manual vs Excel, plantilla, validacion estructural y all-or-nothing cubiertos por tests. | Performance Excel masivo no medido en produccion real; Excel sin RELATION. |
| Bloques 7/8 - Auditoria + Seguridad | PASS CON DEUDA MENOR | Eventos, AuditChange, activity scoping, tenant boundary y delete scope cubiertos por tests. | Inspeccion visual de historial/activity manual. |

## Estado Del Producto

Operational Core queda como MVP estable con deuda menor aceptada. Los flujos centrales estan cubiertos por pruebas automatizadas, verificaciones HTTP y evidencia manual acumulada durante desarrollo. Las deudas restantes no bloquean uso controlado del MVP.

## Verificaciones Tecnicas

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `npx prisma format` | PASS | `Formatted prisma/schema.prisma`. |
| `npx prisma validate` | PASS | Schema valido. |
| `npx prisma generate` | PASS | Prisma Client generado. |
| `npx prisma migrate status` | PASS FUERA DE SANDBOX | Dentro del sandbox falla con `Schema engine error` contra `reseau.proxy.rlwy.net:23615`; fuera del sandbox conecto y reporto `6 migrations found` + `Database schema is up to date!`. |
| `npm run lint` | PASS | ESLint sin errores. |
| `npm run test` | PASS | 38 test files, 273 tests. |
| `npm run build` | PASS | Next build OK; incluye ruta `/api/logout`. |

## Estado Final

PCORE-STAB-001 CERRADO. Resultado global: MVP ESTABLE CON DEUDA MENOR. No quedan bloqueos funcionales conocidos para uso controlado del MVP; las deudas aceptadas son visuales/manuales, alcance limitado de tipos no centrales, performance Excel productiva no medida y findings `npm audit` documentados sin fix automatico.
