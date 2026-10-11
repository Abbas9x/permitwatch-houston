import type {PermitCategory} from '../../../shared/permit';
/** Category symbols are independent of application-type colors and work in both appearances. */
export const CATEGORY_SYMBOLS: Record<PermitCategory,string> = {
  concrete_batch_plant: '▲', air_permit: '■', wastewater_permit: '◆', solid_waste_permit: '●',
};
