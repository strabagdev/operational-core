import { describe,expect,it,vi } from "vitest";
vi.mock("./prisma",()=>({prisma:{}}));
import { offlineManifestHash,parseOfflineManifestRequest } from "./offline-manifest";
describe("shadow manifest contract",()=>{
 it("hashes objects canonically but retains configured array ordering and string identities",()=>{
  expect(offlineManifestHash({b:2,a:["0001","a"]})).toBe(offlineManifestHash({a:["0001","a"],b:2}));
  expect(offlineManifestHash(["0001","a"])).not.toBe(offlineManifestHash(["a","0001"]));
  expect(offlineManifestHash("0001")).not.toBe(offlineManifestHash(1));
 });
 it("uses explicit date/month and canonical experience IDs without inferring a context",()=>{
  expect(parseOfflineManifestRequest(new URLSearchParams())).toEqual({version:1,appViewIds:[]});
  expect(parseOfflineManifestRequest(new URLSearchParams("version=1&date=2028-02-29&month=2028-02&appViewId=b&appViewId=a"))).toEqual({version:1,date:"2028-02-29",month:"2028-02",appViewIds:["a","b"]});
 });
 it.each(["version=2","date=2026-02-29","date=2026-11-31","date=bad","date=0000-01-01","month=0000-01","month=2026-13","month=2026-1","date=2026-11-11&month=2026-10","date=2026-11-11&date=2026-11-12","search=private","appViewId=a&appViewId=a","appViewId=%20a"])("rejects incompatible or ambiguous query %s",query=>{
  expect(()=>parseOfflineManifestRequest(new URLSearchParams(query))).toThrow();
 });
});
