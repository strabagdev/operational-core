import {describe,it,expect} from "vitest";
import {parseWorkflowWriteCommand,parseWorkflowWritePolicy} from "./workflow-write-policy";
describe("versioned opt-in workflow policy contracts",()=>{
 it("keeps absent policy and absent command as legacy",()=>{expect(parseWorkflowWritePolicy(undefined)).toBeUndefined();expect(parseWorkflowWritePolicy(null)).toBeUndefined();expect(parseWorkflowWriteCommand(undefined)).toBeUndefined();});
 it("normalizes only an explicit list of stable authorized ids",()=>{expect(parseWorkflowWritePolicy({version:1,mode:"workflow-only",acceptNewCommands:false,allowedAppViewIds:["view-b","view-a","view-a"]})).toEqual({version:1,mode:"workflow-only",acceptNewCommands:false,allowedAppViewIds:["view-a","view-b"]});});
 it.each([{version:2,mode:"workflow-only",acceptNewCommands:false,allowedAppViewIds:["view"]},{version:1,mode:"workflow-only",acceptNewCommands:false,allowedAppViewIds:[]},{version:1,mode:"workflow-only",acceptNewCommands:false,allowedAppViewIds:["view"],tenant:"not-a-policy"}])("rejects unsupported policies without inferring defaults",value=>{expect(()=>parseWorkflowWritePolicy(value)).toThrow();});
 it.each([{version:2,configurationFingerprint:"a".repeat(64),capabilities:["relation-context-v1"]},{version:1,configurationFingerprint:"a".repeat(64),capabilities:[]},{version:1,configurationFingerprint:"a".repeat(64),capabilities:["relation-context-v1"],authorization:true},null])("rejects incompatible capabilities and forged semantic fields",value=>{expect(()=>parseWorkflowWriteCommand(value)).toThrow();});
});
