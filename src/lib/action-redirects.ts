export function safeAppRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://operational-core.local");

    if (url.origin !== "https://operational-core.local") {
      return fallback;
    }

    if (!url.pathname.startsWith("/app/")) {
      return fallback;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function withActionMessage(
  path: string,
  key: "error" | "notice",
  message: string,
) {
  const url = new URL(path, "https://operational-core.local");

  url.searchParams.set(key, message);

  return `${url.pathname}${url.search}`;
}
