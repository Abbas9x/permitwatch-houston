import type {Permit} from './permit.js';

/** A lifecycle status alone never establishes a comment period. Compare listed deadlines in Houston time. */
export function shouldCheckOfficialRecord(permit: Pick<Permit,'category'|'permitStatus'|'commentDeadline'>, now=new Date()): boolean {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(type:string)=>parts.find(p=>p.type===type)!.value;
 const today=`${get('year')}-${get('month')}-${get('day')}`;
 const deadline=permit.commentDeadline;
 if(deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline<today;
 const authorization=permit.category==='wastewater_permit'||permit.category==='solid_waste_permit';
 const knownNonpending=permit.permitStatus!==undefined&&permit.permitStatus!=='pending';
 return authorization||knownNonpending;
}
