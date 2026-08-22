export const recordListNewRecordHighlightMs = 2_500;

type TimeoutId = unknown;
type HighlightUpdate = Set<string> | ((current: Set<string>) => Set<string>);
type HighlightSetter = (update: HighlightUpdate) => void;

export type RecordListNewRecordHighlighter = {
  dispose: () => void;
  observe: (recordIds: string[]) => string[];
};

export function createRecordListNewRecordHighlighter({
  clearTimeoutFn = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  highlightMs = recordListNewRecordHighlightMs,
  setHighlightedIds,
  setTimeoutFn = setTimeout,
}: {
  clearTimeoutFn?: (id: TimeoutId) => void;
  getReducedMotion?: () => boolean;
  highlightMs?: number;
  setHighlightedIds: HighlightSetter;
  setTimeoutFn?: (callback: () => void, delay: number) => TimeoutId;
}): RecordListNewRecordHighlighter {
  let initialized = false;
  const seenIds = new Set<string>();
  const timers = new Map<string, TimeoutId>();

  function scheduleClear(recordId: string) {
    const timer = setTimeoutFn(() => {
      timers.delete(recordId);
      setHighlightedIds((current) => {
        const next = new Set(current);
        next.delete(recordId);
        return next;
      });
    }, highlightMs);

    timers.set(recordId, timer);
  }

  return {
    dispose() {
      for (const timer of timers.values()) {
        clearTimeoutFn(timer);
      }
      timers.clear();
    },
    observe(recordIds) {
      if (!initialized) {
        for (const recordId of recordIds) {
          seenIds.add(recordId);
        }

        initialized = true;
        return [];
      }

      const newIds = recordIds.filter((recordId) => !seenIds.has(recordId));

      for (const recordId of recordIds) {
        seenIds.add(recordId);
      }

      if (newIds.length === 0 || getReducedMotion()) {
        return newIds;
      }

      setHighlightedIds((current) => {
        const next = new Set(current);

        for (const recordId of newIds) {
          next.add(recordId);
        }

        return next;
      });

      for (const recordId of newIds) {
        scheduleClear(recordId);
      }

      return newIds;
    },
  };
}
