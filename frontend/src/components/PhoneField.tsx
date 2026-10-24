import { useState } from 'react';
const codes=[['91','India'],['1','US / Canada'],['44','United Kingdom'],['971','UAE'],['61','Australia'],['49','Germany'],['33','France'],['65','Singapore'],['27','South Africa'],['81','Japan'],['86','China'],['966','Saudi Arabia']];
export default function PhoneField({value,disabled}:{value:string;disabled:boolean}) {
 const compact=value.replace(/[\s().-]/g,'');
 const matched=compact.startsWith('+')?[...codes].sort((a,b)=>b[0].length-a[0].length).find(([c])=>compact.startsWith(`+${c}`)):undefined;
 const [code,setCode]=useState(matched?.[0]||(value?'':'91'));
 return <div className="customer-phone-field"><label>Dial code<select name="dial_code" value={code} disabled={disabled} onChange={e=>setCode(e.target.value)}><option value="">Full international number</option>{codes.map(([c,name])=><option key={c} value={c}>{name} (+{c})</option>)}</select></label><label>Phone number<input name="phone" type="tel" autoComplete="tel-national" defaultValue={matched?compact.slice(matched[0].length+1):value} placeholder={code?'Number without country code':'+ country code and number'} maxLength={30} disabled={disabled}/></label><small>Other country? Choose “Full international number” and enter + followed by the country code and number. Format checks do not verify ownership.</small></div>;
}
