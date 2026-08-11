const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function utcParts(value: Date) {
  return {
    day: value.getUTCDate(),
    month: value.getUTCMonth() + 1,
    year: value.getUTCFullYear(),
  };
}

export function dateOnlyToUtcDate(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function dateOnlyInputValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    const parts = utcParts(value);

    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  const text = value.trim();
  const dateOnly = dateOnlyToUtcDate(text);

  if (dateOnly) {
    return text;
  }

  if (DATE_ONLY_PATTERN.test(text)) {
    return "";
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return dateOnlyInputValue(date);
}

export function formatDateOnly(value: Date | string | null | undefined) {
  const inputValue = dateOnlyInputValue(value);

  if (!inputValue) {
    return "";
  }

  const [year, month, day] = inputValue.split("-");

  return `${day}-${month}-${year}`;
}
