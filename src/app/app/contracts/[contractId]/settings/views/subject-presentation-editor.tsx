"use client";
import { subjectPresentationTypes, type SubjectPresentationConfig } from "@/lib/subject-presentation";
export function SubjectPresentationEditor({value,onChange,fields,errors}:{value:unknown;onChange:(value:unknown)=>void;fields:{id:string;name:string;type:string;isActive:boolean}[];errors?:string[]}) {
 const configured=value!==undefined;
 const raw=value&&typeof value==="object"?value as SubjectPresentationConfig:null;
 const editable=raw?.version===1&&Array.isArray(raw.titleFieldIds)&&Array.isArray(raw.secondaryFieldIds);
 const config=editable?raw:{version:1 as const,titleFieldIds:[],secondaryFieldIds:[]};
 const available=fields.filter(f=>f.isActive&&subjectPresentationTypes.has(f.type));
 const change=(key:"titleFieldIds"|"secondaryFieldIds",ids:string[])=>onChange({...config,[key]:ids});
 return <fieldset className="grid gap-3 rounded-md border border-border p-3"><legend>Presentación del sujeto</legend>
  <input type="hidden" name="subjectPresentation" value={value===undefined?"":JSON.stringify(value)}/>
  <label><input type="checkbox" checked={configured} onChange={e=>onChange(e.target.checked?{version:1,titleFieldIds:[],secondaryFieldIds:[]}:undefined)}/> Configurar título y datos secundarios para esta experiencia</label>
  <p className="text-xs text-muted-foreground">No cambia el campo principal, los datos, la búsqueda ni las preferencias de otras experiencias.</p>
  {configured&&!editable?<p role="alert">La configuración anterior no es compatible. Desactívala explícitamente para sustituirla; no se descartará al guardar.</p>:null}
  {configured&&editable?([['titleFieldIds','Título'],['secondaryFieldIds','Datos secundarios']] as const).map(([key,label])=><div key={key} className="grid gap-2"><span>{label}</span>
   {config[key].map((id,index)=><div key={id} className="flex flex-wrap items-center gap-2"><span>{available.find(f=>f.id===id)?.name??"Campo configurado no disponible"}</span>
    <button type="button" aria-label={`Subir ${label} ${index+1}`} disabled={!index} onClick={()=>{const ids=[...config[key]];[ids[index-1],ids[index]]=[ids[index],ids[index-1]];change(key,ids);}}>↑</button>
    <button type="button" aria-label={`Bajar ${label} ${index+1}`} disabled={index===config[key].length-1} onClick={()=>{const ids=[...config[key]];[ids[index+1],ids[index]]=[ids[index],ids[index+1]];change(key,ids);}}>↓</button>
    <button type="button" aria-label={`Quitar ${label} ${index+1}`} onClick={()=>change(key,config[key].filter((_,i)=>i!==index))}>Quitar</button></div>)}
   <label className="grid gap-1">Agregar a {label.toLowerCase()}<select aria-label={`Agregar a ${label.toLowerCase()}`} value="" className="h-10 rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2" onChange={e=>{if(e.target.value)change(key,[...config[key],e.target.value]);}}><option value="">Seleccionar campo</option>{available.filter(f=>!config[key].includes(f.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
  </div>):null}
  {errors?.map(error=><p role="alert" key={error}>{error}</p>)}
 </fieldset>;
}
