import nextConfig from "../../next.config";
import { describe, expect, it } from "vitest";

import {
  ENTITY_IMPORT_ACTION_BODY_SIZE_LIMIT_BYTES,
  ENTITY_IMPORT_LIMITS,
} from "./entity-import-limits";

describe("entity import transport limits", () => {
  it("allows the maximum xlsx plus multipart request overhead", () => {
    expect(ENTITY_IMPORT_ACTION_BODY_SIZE_LIMIT_BYTES).toBeGreaterThan(
      ENTITY_IMPORT_LIMITS.maxFileSizeBytes + 20 * 1024,
    );
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(
      ENTITY_IMPORT_ACTION_BODY_SIZE_LIMIT_BYTES,
    );
  });
});
