import {PERMIT_CATEGORIES,PERMIT_STATUSES,type PermitFilters} from '../../../shared/permit';
import {useI18n} from '../i18n';
export function PermitFiltersControl({value,onChange}:{value:PermitFilters;onChange:(value:PermitFilters)=>void}) {
 const {t}=useI18n();
 const selectClass='mt-1 w-full min-w-0 rounded-xl border border-line bg-night px-3 py-2 text-sm text-ink focus:outline-air-2';
 return <fieldset className="grid min-w-0 grid-cols-2 gap-2">
  <legend className="sr-only">{t('filters.legend')}</legend>
  <label className="min-w-0 text-xs text-muted">{t('filters.category')}
   <select className={selectClass} value={value.category??''} onChange={e=>onChange({...value,category:(e.target.value||undefined) as PermitFilters['category']})}>
    <option value="">{t('filters.allCategories')}</option>
    {PERMIT_CATEGORIES.map(category=><option key={category} value={category}>{t(`category.${category}`)}</option>)}
   </select>
  </label>
  <label className="min-w-0 text-xs text-muted">{t('filters.status')}
   <select className={selectClass} value={value.status??''} onChange={e=>onChange({...value,status:(e.target.value||undefined) as PermitFilters['status']})}>
    <option value="">{t('filters.allStatuses')}</option>
    {PERMIT_STATUSES.map(status=><option key={status} value={status}>{t(`status.${status}`)}</option>)}
   </select>
  </label>
 </fieldset>;
}
