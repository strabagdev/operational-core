import { slugify } from "./format";

export function normalizeOrganizationSlug(value: string) {
  return slugify(value);
}
