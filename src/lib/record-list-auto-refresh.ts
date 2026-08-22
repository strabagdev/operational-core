export const recordListAutoRefreshIntervalMs = 30_000;

type RefreshResult = Promise<void> | void;
type IntervalId = unknown;

export type RecordListAutoRefreshController = {
  dispose: () => void;
  refreshNow: () => void;
};

type BrowserEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export function createRecordListAutoRefreshController({
  clearIntervalFn = (id) => clearInterval(id as ReturnType<typeof setInterval>),
  focusTarget = window,
  getVisibilityState = () => document.visibilityState,
  refresh,
  setIntervalFn = setInterval,
  setRefreshing,
  visibilityTarget = document,
}: {
  clearIntervalFn?: (id: IntervalId) => void;
  focusTarget?: BrowserEventTarget;
  getVisibilityState?: () => DocumentVisibilityState;
  refresh: () => RefreshResult;
  setIntervalFn?: (callback: () => void, delay: number) => IntervalId;
  setRefreshing?: (refreshing: boolean) => void;
  visibilityTarget?: BrowserEventTarget;
}): RecordListAutoRefreshController {
  let disposed = false;
  let refreshInFlight = false;
  const intervalId = setIntervalFn(() => {
    refreshIfVisible();
  }, recordListAutoRefreshIntervalMs);

  function isVisible() {
    return getVisibilityState() === "visible";
  }

  function refreshIfVisible() {
    if (isVisible()) {
      refreshNow();
    }
  }

  function refreshNow() {
    if (disposed || refreshInFlight) {
      return;
    }

    refreshInFlight = true;
    setRefreshing?.(true);

    Promise.resolve()
      .then(refresh)
      .finally(() => {
        refreshInFlight = false;
        if (!disposed) {
          setRefreshing?.(false);
        }
      });
  }

  function handleVisibilityChange() {
    refreshIfVisible();
  }

  function handleFocus() {
    refreshIfVisible();
  }

  visibilityTarget.addEventListener("visibilitychange", handleVisibilityChange);
  focusTarget.addEventListener("focus", handleFocus);

  return {
    dispose() {
      disposed = true;
      clearIntervalFn(intervalId);
      visibilityTarget.removeEventListener("visibilitychange", handleVisibilityChange);
      focusTarget.removeEventListener("focus", handleFocus);
    },
    refreshNow,
  };
}
