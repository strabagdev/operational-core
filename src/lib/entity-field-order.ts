export type OrderableEntityField = {
  id: string;
  sortOrder: number;
  createdAt?: Date | string | null;
};

export function orderEntityFields<T extends OrderableEntityField>(fields: T[]): T[] {
  return [...fields].sort(compareEntityFieldOrder);
}

export function compareEntityFieldOrder(
  left: OrderableEntityField,
  right: OrderableEntityField,
) {
  return (
    left.sortOrder - right.sortOrder ||
    compareCreatedAt(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function getReorderedEntityFieldUpdates<T extends OrderableEntityField>(
  fields: T[],
  fieldId: string,
  direction: "up" | "down",
) {
  const ordered = orderEntityFields(fields);
  const currentIndex = ordered.findIndex((field) => field.id === fieldId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
    return [];
  }

  const reordered = [...ordered];
  const [current] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, current);

  return reordered
    .map((field, index) => ({
      id: field.id,
      sortOrder: index + 1,
    }))
    .filter((update) => {
      const field = ordered.find((item) => item.id === update.id);

      return field?.sortOrder !== update.sortOrder;
    });
}

function compareCreatedAt(left?: Date | string | null, right?: Date | string | null) {
  const leftTime = toTime(left);
  const rightTime = toTime(right);

  if (leftTime === rightTime) {
    return 0;
  }

  return leftTime < rightTime ? -1 : 1;
}

function toTime(value?: Date | string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
