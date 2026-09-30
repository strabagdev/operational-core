export const ENTITY_IMPORT_LIMITS = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxRows: 5000,
} as const;

// Server Actions receive multipart metadata in addition to the file bytes.
export const ENTITY_IMPORT_ACTION_BODY_SIZE_LIMIT_BYTES = 6 * 1024 * 1024;
