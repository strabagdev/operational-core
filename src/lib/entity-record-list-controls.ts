export type RecordListQueryParams = Record<string, string | undefined>;

export function buildRecordListHref({
  basePath,
  pageSize,
  query,
  searchParams,
}: {
  basePath: string;
  pageSize?: string;
  query?: string;
  searchParams: RecordListQueryParams;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      params.set(key, value);
    }
  }

  params.delete("page");

  const normalizedQuery = query?.trim() ?? "";

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  } else {
    params.delete("q");
  }

  if (pageSize) {
    params.set("pageSize", pageSize);
  }

  const queryString = params.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}
