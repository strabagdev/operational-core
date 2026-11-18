import { describe, expect, it } from "vitest";
import { groupPanelRecords, panelCountFields } from "./panel-dataset-options";
import { parseAppViewConfig } from "./app-views";
import { panelFixtureConfig } from "../test/panel-local-fixture";
const record = (id: string, target: string | null, displayName = "Igual") => ({ id, outgoingRelations: target ? [{ sourceFieldId: "ref", targetRecordId: target, targetRecord: { displayName } }] : [] });
describe("Generic PANEL relation groups and inverse count descriptors", () => {
  it("groups identity, never matching labels, and preserves equivalent source records", () => {
    const a=record("r1","one"), b=record("r2","one"), c=record("r3","two");
    expect(groupPanelRecords([a,b,c],"ref").map(group=>[group.relationRecordId,group.count,group.recordIds])).toEqual([["one",2,["r1","r2"]],["two",1,["r3"]]]);
    expect(groupPanelRecords([a,a],"ref")[0].count).toBe(1);
  });
  it("does not invent a shared identity for unrelated rows or silently expand a broken ONE", () => {
    expect(groupPanelRecords([record("r1",null),record("r2",null)],"ref")).toHaveLength(2);
    expect(()=>groupPanelRecords([{...record("r1","one"),outgoingRelations:[...record("r1","one").outgoingRelations,...record("r1","two").outgoingRelations]}],"ref")).toThrow("PANEL_GROUP_RELATION_INVALID");
  });
  it("exposes only the configured count and difference fields, without rewriting initial values", () => {
    const dataset={relationCounts:[{id:"usage",label:"Uso",sourceEntityTypeId:"events",relationFieldId:"resource",difference:{fieldId:"initial",label:"Restante",emptyLabel:"Sin cantidad definida"}}]};
    const before=JSON.stringify(dataset);expect(panelCountFields(dataset)).toEqual([{id:"count:usage",name:"Uso",type:"INTEGER",emptyLabel:undefined},{id:"difference:usage",name:"Restante",type:"DECIMAL",emptyLabel:"Sin cantidad definida"}]);expect(JSON.stringify(dataset)).toBe(before);
  });
  it("preserves all additive descriptors and rejects incomplete or date-filtered historical counts", () => {
    const cfg=panelFixtureConfig();expect(parseAppViewConfig({type:"PANEL",config:cfg})).toMatchObject({datasets:[{groupBy:cfg.datasets[0].groupBy},{relationCounts:cfg.datasets[1].relationCounts}]});
    for(const invalid of [{...cfg.datasets[1].relationCounts![0],sourceEntityTypeId:""},{...cfg.datasets[1].relationCounts![0],filters:[{type:"PANEL_FILTER",filterId:"day",fieldId:"date",operator:"EQ"}]}])expect(()=>parseAppViewConfig({type:"PANEL",config:{...cfg,datasets:[{...cfg.datasets[1],relationCounts:[invalid]}]}})).toThrow();
  });
});
