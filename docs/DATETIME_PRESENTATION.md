# Presentación de DATETIME en Core

Los listados y detalles genéricos de registros presentan DATETIME con fecha, hora,
minutos y segundos, seguidos de la zona explícita **UTC**. Ejemplo sintético:
`21-01-2026, 14:23:45 UTC`. No dependen de la zona del servidor o navegador.

DATE conserva su presentación de fecha sola, sin conversión de zona. Un DATETIME
vacío sigue vacío: no se completa desde auditoría, creación en servidor o medianoche.

Ambas pantallas reutilizan `deserializeEntityValue` de `src/lib/entity-records.ts`.
El DATETIME mantiene íntegros sus milisegundos en almacenamiento; esta presentación
los omite, sin redondear ni modificar el instante. El detalle utiliza el mismo formato.

Core no infiere la zona de un workflow al presentar genéricamente una entidad: una
entidad puede participar en varias experiencias con zonas distintas. Attendance/PANEL
conservan su presentación IANA configurada. Por ejemplo, `21:10:07 UTC` y `18:10:07
America/Santiago` pueden corresponder al mismo instante, según la fecha y el offset.

Este ajuste es exclusivamente de lectura/presentación. No modifica formularios,
parsers, exportación DATETIME de Excel (continúa ISO), API, consultas, ordenamiento,
DATE operativo, captura, auditoría, datos, sincronización ni configuraciones.
No incorpora nombres/IDs de entidades o contratos al código.
