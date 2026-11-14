import { describe, expect, it } from "vitest";
import { parseRevisionReadRequest } from "./revision-bound-read";

describe("revision read negotiation", () => {
  it("keeps existing clients outside the snapshot protocol",()=>expect(parseRevisionReadRequest(new URLSearchParams("page=2&legacy=kept"),"records")).toBeNull());
  it.each([
    "readRevisionVersion=2", "expectedReadRevision="+"a".repeat(64),
    "readRevisionVersion=1&readRevisionVersion=1", "readRevisionVersion=1&unknown=1",
    "readRevisionVersion=1&page=2", "readRevisionVersion=1&page=0",
    "readRevisionVersion=1&expectedReadRevision=bad", "readRevisionVersion=1&search=a&search=b",
  ])("rejects incompatible or incomplete protocol: %s",query=>expect(()=>parseRevisionReadRequest(new URLSearchParams(query),"records")).toThrow());
  it("binds selection but permits the next page only with an explicit revision",()=>{
    const a=parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&page=1&pageSize=2&search=001"),"records")!;
    const b=parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&page=2&pageSize=2&search=001&expectedReadRevision="+"a".repeat(64)),"records")!;
    expect(a.selection).toEqual(b.selection);expect(a.entries).not.toEqual(b.entries);expect(a.selection).toContainEqual(["search","001"]);
  });
  it("binds exact batch IDs separately from its shared dataset selection",()=>{
    const a=parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&currentBatchVersion=1&subjectRecordIds=a&subjectRecordIds=b"),"state-update")!;
    const b=parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&currentBatchVersion=1&subjectRecordIds=c"),"state-update")!;
    expect(a.selection).toEqual(b.selection);expect(a.entries).not.toEqual(b.entries);
  });
  it("does not silently equate different filters, searches, identity or omitted values",()=>{
    const a=parseRevisionReadRequest(new URLSearchParams('readRevisionVersion=1&filters={"x":1}'),"panel")!;
    const b=parseRevisionReadRequest(new URLSearchParams('readRevisionVersion=1&filters={"x":2}'),"panel")!;
    expect(a.selection).not.toEqual(b.selection);
    expect(parseRevisionReadRequest(new URLSearchParams('readRevisionVersion=1&search='),"panel")!.selection).not.toEqual(parseRevisionReadRequest(new URLSearchParams('readRevisionVersion=1'),"panel")!.selection);
  });
});

describe("Attendance day page negotiation",()=>{
 it("requires a consistent read even on page one",()=>expect(()=>parseRevisionReadRequest(new URLSearchParams("daySnapshotVersion=1&page=1"),"attendance")).toThrow("La descarga del día requiere"));
 it("binds day/version/size but permits subsequent pages with the same selection",()=>{
  const first=parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&daySnapshotVersion=1&date=2026-11-12&page=1&pageSize=100"),"attendance")!;
  const second=parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&daySnapshotVersion=1&date=2026-11-12&page=2&pageSize=100&expectedReadRevision="+"a".repeat(64)),"attendance")!;expect(first.selection).toEqual(second.selection);expect(first.entries).not.toEqual(second.entries);
 });
 it("rejects a later day page without its revision",()=>expect(()=>parseRevisionReadRequest(new URLSearchParams("readRevisionVersion=1&daySnapshotVersion=1&page=2"),"attendance")).toThrow());
});
