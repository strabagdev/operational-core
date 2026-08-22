import { describe, expect, it, vi } from "vitest";

import {
  createRecordListNewRecordHighlighter,
  recordListNewRecordHighlightMs,
} from "./record-list-new-record-highlights";

function createHighlightState() {
  let highlightedIds = new Set<string>();
  const setHighlightedIds = vi.fn((update: Set<string> | ((current: Set<string>) => Set<string>)) => {
    highlightedIds = update instanceof Set ? update : update(highlightedIds);
  });

  return {
    get ids() {
      return highlightedIds;
    },
    setHighlightedIds,
  };
}

describe("record list new record highlights", () => {
  it("does not highlight the first render snapshot", () => {
    const state = createHighlightState();
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
    });

    const newIds = highlighter.observe(["record_1", "record_2"]);

    expect(newIds).toEqual([]);
    expect(state.ids.size).toBe(0);
    expect(state.setHighlightedIds).not.toHaveBeenCalled();
  });

  it("does not highlight when a refresh returns the same record set", () => {
    const state = createHighlightState();
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
    });

    highlighter.observe(["record_1", "record_2"]);
    const newIds = highlighter.observe(["record_2", "record_1"]);

    expect(newIds).toEqual([]);
    expect(state.ids.size).toBe(0);
  });

  it("highlights one new record", () => {
    const state = createHighlightState();
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
    });

    highlighter.observe(["record_1"]);
    const newIds = highlighter.observe(["record_2", "record_1"]);

    expect(newIds).toEqual(["record_2"]);
    expect([...state.ids]).toEqual(["record_2"]);
  });

  it("highlights multiple new records", () => {
    const state = createHighlightState();
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
    });

    highlighter.observe(["record_1"]);
    const newIds = highlighter.observe(["record_3", "record_2", "record_1"]);

    expect(newIds).toEqual(["record_3", "record_2"]);
    expect(state.ids).toEqual(new Set(["record_3", "record_2"]));
  });

  it("does not highlight a record that was already seen", () => {
    const state = createHighlightState();
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
    });

    highlighter.observe(["record_1"]);
    highlighter.observe(["record_2", "record_1"]);
    const newIds = highlighter.observe(["record_1", "record_2"]);

    expect(newIds).toEqual([]);
  });

  it("does not animate highlights when reduced motion is requested", () => {
    const state = createHighlightState();
    const setTimeoutFn = vi.fn();
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => true,
      setHighlightedIds: state.setHighlightedIds,
      setTimeoutFn,
    });

    highlighter.observe(["record_1"]);
    const newIds = highlighter.observe(["record_2", "record_1"]);

    expect(newIds).toEqual(["record_2"]);
    expect(state.ids.size).toBe(0);
    expect(setTimeoutFn).not.toHaveBeenCalled();
  });

  it("clears highlights after the configured duration", () => {
    const state = createHighlightState();
    const timers: Array<() => void> = [];
    const highlighter = createRecordListNewRecordHighlighter({
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
      setTimeoutFn: vi.fn((callback: () => void, delay: number) => {
        expect(delay).toBe(recordListNewRecordHighlightMs);
        timers.push(callback);
        return timers.length;
      }),
    });

    highlighter.observe(["record_1"]);
    highlighter.observe(["record_2", "record_1"]);

    expect(state.ids).toEqual(new Set(["record_2"]));

    timers[0]?.();

    expect(state.ids.size).toBe(0);
  });

  it("cleans up highlight timers", () => {
    const state = createHighlightState();
    const clearTimeoutFn = vi.fn();
    const highlighter = createRecordListNewRecordHighlighter({
      clearTimeoutFn,
      getReducedMotion: () => false,
      setHighlightedIds: state.setHighlightedIds,
      setTimeoutFn: vi.fn(() => "timer_1"),
    });

    highlighter.observe(["record_1"]);
    highlighter.observe(["record_2", "record_1"]);
    highlighter.dispose();

    expect(clearTimeoutFn).toHaveBeenCalledWith("timer_1");
  });
});
