# Attendance: política configurable de repetición

Implementación local del 16-11-2026. Sin activación ni cambios de configuraciones existentes.

`AppView.type=WORKFLOW`, `workflowKey=attendance` conserva sus roles configurados y adapta el motor STATE_UPDATE. La propiedad opcional `config.repetitionPolicy` admite:

| Valor | Comportamiento |
| --- | --- |
| Ausente o `ONE_PER_DAY` | Persona + DATE, update-current; UNCHANGED idéntico, CONFLICT ante cambios, overwrite/base explícitos. |
| `MULTIPLE_WITH_WARNING` | Un evento independiente por intención nueva; si ya hay registros, Core exige `repetitionAcknowledged=true`. |
| `MULTIPLE` | Un evento independiente por intención nueva, sin advertencia. |

El editor ofrece las tres opciones. Leer configuraciones antiguas no agrega ni cambia propiedades persistidas. No se ejecutan reparaciones, cambios de cardinalidad, migraciones ni modificaciones de registros históricos.

## Contrato y escrituras

Client conserva POST `workflow/state-update` para el modo anterior. Las políticas múltiples utilizan exclusivamente POST `workflow/state-update/repetition`, una entrada que delega en el mismo handler y motor STATE_UPDATE. Un Core anterior responde 404/405 a esa ruta y no puede interpretar el comando como update-current. No existe fallback al endpoint antiguo. El POST legacy `workflow/attendance` conserva su comportamiento para uno por día y rechaza políticas múltiples con `ATTENDANCE_REPETITION_COMMAND_REQUIRED`, antes de reservar la clave o modificar registros.

Para múltiples: `clientRequestId` no vacío y `repetitionPolicy` exacta son obligatorios. La política se toma de la definición autenticada, nunca del body. Un comando anterior no se convierte silenciosamente en un alta múltiple; discrepancias devuelven `ATTENDANCE_POLICY_CHANGED`.

Un alta no lleva `targetRecordId`. Siempre crea una fila, valores, relaciones y auditoría nuevos; la respuesta idempotente se persiste en la misma transacción. Repetir clave y payload devuelve el mismo resultado; otra clave es otra intención. Cambiar el payload conservando la clave sigue rechazado.

Una edición múltiple lleva `targetRecordId`, `overwrite=true` y `expectedUpdatedAt`. El lookup exige simultáneamente destino, sujeto, DATE y ese ID. Si no existe, devuelve `ATTENDANCE_RECORD_UNAVAILABLE`; nunca cae en creación ni elige otro registro. Una base obsoleta genera conflicto incluso si el contenido propuesto ya coincide. La corrección conserva el ID.

Se reutiliza el bloqueo PostgreSQL transaccional existente por identidad configurada. La clave persona/fecha de ONE_PER_DAY no cambia. Múltiples usa la misma exclusión para comprobar advertencia, crear y editar; los reintentos concurrentes conservan la idempotencia y auditoría. La autorización relee bajo el bloqueo compartido del destino la política activa y sus roles; un cambio concurrente rechaza el comando capturado. No hay restricción UNIQUE ni tablas nuevas.

Las experiencias activas con la misma identidad física no pueden mezclar unicidad diaria y eventos múltiples. Editor y escritor rechazan esa incompatibilidad. Distintas políticas múltiples pueden compartir destino si sus roles son compatibles. El modo predeterminado conserva la coexistencia histórica con escritores STATE_UPDATE genéricos; no se convierte esta política optativa en una restricción retroactiva sobre destinos existentes. Activar múltiples sí comprueba esos escritores para rechazar un update-current incompatible. La vuelta de múltiple a uno por día se rechaza cuando hay duplicados persona/fecha, bajo el bloqueo exclusivo del destino: no se elimina ni colapsa el historial.

Esto conserva el límite preexistente: la unicidad es cooperativa entre los workflows que toman el lock. Para aislar editor/importador/API genérica se usa la política optativa de escritores existente; este cambio no la activa ni modifica. Destinos protegidos mantienen validación de capacidades relation-context-v1, permisos, contexto obligatorio y fingerprint.

## Lecturas y hora

GET Attendance añade `repetitionPolicy` y `items[].dailyRecordCount`, calculado sobre todos los registros coincidentes, sin el límite de latest. Para políticas múltiples y consulta explícita de una persona añade `dailyRecords`, con IDs, versiones, estados y contextos de cada evento del día. Latest y el snapshot diario paginado siguen conservando todos sus eventos; la página no se acredita como cobertura completa.

GET STATE_UPDATE añade `workflow.repetitionPolicy` cuando representa Attendance. Client verifica esta compatibilidad autenticada antes de enviar comandos múltiples, para que un Core anterior no los interprete como update-current. La relectura se comparte sólo dentro del mismo sync run/scope; no usa TTL.

La fecha configurada sigue siendo DATE, sin calendario operacional nuevo. `eventOccurredAt` es hora UTC de captura del dispositivo, opcional, validada y protegida por el hash idempotente. Se conserva en metadata del evento de auditoría de creación y se devuelve en las lecturas múltiples. `createdAt`/`updatedAt` de Core siguen siendo tiempos del servidor; la hora del dispositivo no autoriza nada ni participa en la unicidad. Editar no cambia la hora de captura original. Registros anteriores sin esa metadata usan su createdAt como referencia; no se rellenan datos históricos.

## Compatibilidad y operación

Publicar primero Core compatible, luego Client; sólo después configurar una experiencia por decisión explícita. Nada se activa por defecto. Preparar online la definición, sujetos y catálogos actualizados antes de capturar offline con una política nueva. Comandos offline anteriores mantienen su payload/base/clave; una política incompatible exige revisión y no se reinterpreta automáticamente.

No retroceder Core a una versión que ignore estas propiedades mientras existan experiencias múltiples o intenciones nuevas pendientes. La comprobación Client impide el envío a un servidor detectado como incompatible, y la ruta exclusiva impide ejecutar update-current si la versión cambia después del GET. El rechazo conserva la intención, pero no garantiza disponibilidad ante backends incompatibles. Preferir mantener Core compatible y desactivar nuevas capturas; no borrar colas ni restaurar bases. Client antiguo no puede sincronizar los comandos múltiples: conservarlo para destinos ONE_PER_DAY o actualizarlo.

No incluye cambios para Observación. Los adaptadores existentes se reutilizan para conservar los campos configurados durante la edición.

## Revisión de compatibilidad — 17-11-2026

Ausencia de política y ONE_PER_DAY son equivalentes también en el hash idempotente: una repetición del mismo comando tras actualizar Core no cambia de identidad por explicitar el valor predeterminado. Client omite ese valor redundante en el wire de ONE; no reescribe pendientes. Múltiples conserva su política en el hash y en la ruta exclusiva. Una ruta no soportada produce error recuperable mediante revisión/reintento explícito con Core compatible, nunca un segundo envío por el endpoint legacy.

El punto de entrada exclusivo sólo acepta MULTIPLE/MULTIPLE_WITH_WARNING y delega autenticación, permisos, transacción, lock, auditoría e idempotencia al handler existente. No crea un motor ni una tabla nueva. Los clientes anteriores siguen operando sobre ONE y son rechazados antes de mutar si la experiencia cambió a múltiples. No se habilitó ninguna política en esta revisión.
