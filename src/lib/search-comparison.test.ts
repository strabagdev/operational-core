import { Prisma } from "@prisma/client";
import { describe,expect,it } from "vitest";
import { configuredComparisonSql,workflowSearchMetadata,workflowSearchPredicate,workflowSubjectsSql } from "./workflow-search-comparison";
import { parseSearchComparison,normalizeSearchComparison,searchComparisonMatches,verifyWorkflowSearchComparison,workflowRecordMatches, type SearchComparison } from "./search-comparison";
const policy:SearchComparison={version:1,ignoreCase:true,ignoreCharacters:[".","-"],ignoreWhitespace:true,match:"exact"};
const field={id:"code-id",key:"code",type:"TEXT",isActive:true,searchable:true,multiple:false,config:{searchComparison:policy,display:{primary:true}}};
describe("versioned comparison without business-specific identifiers",()=>{
 it.each([
  ["00.123-K","00123k",true],["00.123-K","0123k",false],[" Ab\tC. D- ","abcd",true],["Ñ ÁÉÍÓÚ Ü Σ ς ẞ","ñáéíóúüσσß",true],["İ","i",false],["ß","ss",false],["é","e\u0301",false],["A\u00a0B\u2003C","abc",true],
 ])("normalizes both operands and retains scalar identity: %s",(value,query,expected)=>expect(searchComparisonMatches(value,query,policy)).toBe(expected));
 it("uses explicit exact/contains and literal scalar characters including SQL/regex symbols",()=>{
  expect(searchComparisonMatches("x00123kz","00123K",policy)).toBe(false);
  expect(searchComparisonMatches("x00123kz","00123K",{...policy,match:"contains"})).toBe(true);
  expect(searchComparisonMatches("ab","AB",{...policy,ignoreCase:false})).toBe(false);
  expect(searchComparisonMatches("a b","ab",{...policy,ignoreWhitespace:false})).toBe(false);
  const literals={...policy,ignoreCharacters:["[","]","%","_","\\","'","😀"]};expect(normalizeSearchComparison("[A]%_\\'😀",literals)).toBe("a");
  expect(searchComparisonMatches(null,"text",policy)).toBe(false);
  expect(()=>searchComparisonMatches(undefined,"text",policy)).toThrow();
 });
 it.each([null,{...policy,version:2},{...policy,ignoreCharacters:["ab"]},{...policy,ignoreCharacters:["\u0000"]},{...policy,ignoreCharacters:Array(33).fill(".")},{...policy,match:"regex"},{...policy,extra:true}])("rejects unsupported rules rather than silently using defaults",value=>expect(()=>parseSearchComparison(value)).toThrow());
 it("distinguishes absent policy, canonical duplicates and fingerprint mismatches",()=>{
  expect(parseSearchComparison(undefined)).toBeNull();expect(parseSearchComparison({...policy,ignoreCharacters:["-",".","-"]})?.ignoreCharacters).toEqual(["-","."]);
  const metadata=workflowSearchMetadata([field],"source","state-update","00123K",field.id);expect(verifyWorkflowSearchComparison(metadata)).toEqual(metadata);
  expect(()=>verifyWorkflowSearchComparison({...metadata,fingerprint:"stale"})).toThrow();expect(()=>verifyWorkflowSearchComparison(metadata,"another-source")).toThrow();
 });
 it("combines global field predicates without using the configured primary display as a partial-match bypass",()=>{
  const fields=[field,{id:"name-id",key:"name",type:"TEXT",isActive:true,searchable:true,config:null}];const m=workflowSearchMetadata(fields,"source","state-update","00123k");
  expect(workflowRecordMatches({displayName:"00.123-K",values:{code:"00.123-K",name:"Other"}},"00123k",m)).toBe(true);
  expect(workflowRecordMatches({displayName:"00.123-K",values:{code:"00.123-K",name:"Other"}},"0012",m)).toBe(false);
  expect(workflowRecordMatches({displayName:"00.123-K",values:{code:"00.123-K",name:"Other matching name"}},"matching",m)).toBe(true);
  expect(workflowRecordMatches({displayName:"00.123-K",values:{code:"00.123-K",name:"Other"}},"---",m)).toBe(false);
  expect(()=>workflowSearchMetadata(fields,"source","state-update","---",field.id)).toThrow(/vacío/);
  const sql=workflowSubjectsSql(m,"00123k");expect(sql.sql).toContain('LIMIT ? OFFSET ?');expect(sql.values.at(-2)).toBe(20);
  expect(workflowSearchPredicate(m,"---").sql).not.toContain('translate('); // empty configured branch omitted; legacy name still participates
 });
 it("keeps legacy unconfigured behavior and makes literals parameters rather than SQL",()=>{
  const m=workflowSearchMetadata([{...field,config:null}],"source","attendance","Name");expect(m.fields[0].policy).toBeNull();
  expect(workflowRecordMatches({displayName:"Name",values:{}},"name",m)).toBe(true);
  const sql=configuredComparisonSql(Prisma.sql`x`,"%' OR 1=1 --",{...policy,match:"contains"});
  expect(sql.sql).not.toContain("OR 1=1");expect(sql.values.some(v=>typeof v==="string"&&v.includes("or1=1"))).toBe(true);
 });
});
