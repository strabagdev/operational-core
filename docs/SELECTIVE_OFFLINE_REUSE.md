# Oferta optativa de omisión — piloto local, 13-11-2026

Extiende únicamente la negociación V2 con storagePolicyVersion=2. No hay migraciones nuevas,
escritores, cambios en datos, autorización, auditoría o idempotencia. V1 y policy1 V2 conservan
JSON y concesiones false. root mode/shadow y false globales no conceden omisión.

La oferta negotiation.selectiveReuse contiene version1, policy attendance-runtime-v1, enabled y
AppView IDs Attendance activas/asignadas del mismo snapshot autorizado. Su concesión exige mes,
tracking íntegro, dependencias, versiones y expectativas compatibles, y opt-in servidor exacto:
OPCO_OFFLINE_REUSE_POLICY=attendance-runtime-v1 y OPCO_OFFLINE_REUSE_CONTRACT_IDS=lista de IDs.
Por defecto apagado; sin wildcard ni valores vacíos. No se activó en producción.

Sólo con esa oferta enabled son true negotiation.reuseAllowed/clientMaySkipReads y false
compatibilityOnly. coverageCertified/localReceiptVerified/storageIdentityVerified permanecen false:
el Client debe verificar recibo completo, handle/sesión, integridad y consumo atómico en su lectura.
No es una autorización de escritura ni una certificación de colecciones por metadata. Los sellos
de lectura de negocio continúan v1 en sombra; no cambian consultas, resultados o paginación.

Nonce/versions/petición/scope/revisiones/epoch/definiciones conservan sus comprobaciones. Sin oferta,
Core anterior, error o discrepancia se requiere el flujo autorizado ordinario;401/403 nunca autorizan
un fallback más amplio. El Client limita este piloto a Attendance mensual; catálogos y otros
consumidores descargan normalmente. No se ha creado un gate genérico para todos los workflows.

La política requiere servidor y Client compatibles. Para rollback, apagar el opt-in, mantener
V1/policy1 y descargas normales, sin borrar almacenamiento local ni restaurar producción. La
migración de revisiones anterior y su política de epoch/restore/DDL conservan sus límites. No hay
publicación ni configuración productiva autorizadas en este lote.
