import { describe, expect, it, vi } from "vitest";

import {
  createRecordListAutoRefreshController,
  recordListAutoRefreshIntervalMs,
} from "./record-list-auto-refresh";

function createEventTarget() {
  const listeners = new Map<string, Set<() => void>>();

  return {
    addEventListener: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listeners.get(event) ?? new Set());
      listeners.get(event)?.add(listener);
    }),
    dispatch(event: string) {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
    removeEventListener: vi.fn((event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function createTargets() {
  const target = createEventTarget();

  return {
    focusTarget: target,
    visibilityTarget: target,
  };
}

describe("record list auto refresh", () => {
  it("uses a 30 second polling interval", () => {
    expect(recordListAutoRefreshIntervalMs).toBe(30_000);
  });

  it("refreshes from the timer while the document is visible", async () => {
    const refresh = vi.fn();
    const setIntervalFn = vi.fn();

    createRecordListAutoRefreshController({
      getVisibilityState: () => "visible",
      refresh,
      setIntervalFn,
      ...createTargets(),
    });

    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 30_000);
    setIntervalFn.mock.calls[0]?.[0]();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh from the timer while the document is hidden", async () => {
    const refresh = vi.fn();
    const setIntervalFn = vi.fn();

    createRecordListAutoRefreshController({
      getVisibilityState: () => "hidden",
      refresh,
      setIntervalFn,
      ...createTargets(),
    });

    setIntervalFn.mock.calls[0]?.[0]();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when visibility returns to visible", async () => {
    let visibility: DocumentVisibilityState = "hidden";
    const target = createEventTarget();
    const refresh = vi.fn();

    createRecordListAutoRefreshController({
      getVisibilityState: () => visibility,
      refresh,
      focusTarget: createEventTarget(),
      visibilityTarget: target,
    });

    target.dispatch("visibilitychange");
    visibility = "visible";
    target.dispatch("visibilitychange");
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on focus while visible", async () => {
    const target = createEventTarget();
    const refresh = vi.fn();

    createRecordListAutoRefreshController({
      getVisibilityState: () => "visible",
      refresh,
      focusTarget: target,
      visibilityTarget: createEventTarget(),
    });

    target.dispatch("focus");
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate concurrent refreshes", async () => {
    const firstRefresh = deferred();
    const refresh = vi.fn(() => firstRefresh.promise);
    const setRefreshing = vi.fn();

    const controller = createRecordListAutoRefreshController({
      getVisibilityState: () => "visible",
      refresh,
      setRefreshing,
      ...createTargets(),
    });

    controller.refreshNow();
    controller.refreshNow();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setRefreshing).toHaveBeenLastCalledWith(true);

    firstRefresh.resolve();
    await firstRefresh.promise;
    await Promise.resolve();
    await Promise.resolve();

    controller.refreshNow();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(setRefreshing).toHaveBeenLastCalledWith(true);
  });

  it("supports manual refresh", async () => {
    const refresh = vi.fn();

    const controller = createRecordListAutoRefreshController({
      getVisibilityState: () => "visible",
      refresh,
      ...createTargets(),
    });

    controller.refreshNow();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cleans up timers and listeners", () => {
    const target = createEventTarget();
    const clearIntervalFn = vi.fn();
    const intervalId = 123;

    const controller = createRecordListAutoRefreshController({
      clearIntervalFn,
      focusTarget: target,
      refresh: vi.fn(),
      setIntervalFn: vi.fn(() => intervalId),
      visibilityTarget: target,
    });

    expect(target.listenerCount("visibilitychange")).toBe(1);
    expect(target.listenerCount("focus")).toBe(1);

    controller.dispose();

    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId);
    expect(target.listenerCount("visibilitychange")).toBe(0);
    expect(target.listenerCount("focus")).toBe(0);
  });
});
