import {expect,test} from '@playwright/test';
import type {SearchResponse} from '../shared/api.js';
import {PERMIT_CATEGORIES} from '../shared/permit.js';

test.use({baseURL:'http://127.0.0.1:8791'});
const demo='5303 S Lake Houston Pkwy, Houston, TX';
const labels={concrete_batch_plant:'Concrete batch plant',air_permit:'Industrial air permit',wastewater_permit:'Wastewater discharge',solid_waste_permit:'Solid waste'};
test.beforeEach(async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#102036'}}]})}));
});

test('real four-category search, symbols, filters, clickable details and official provenance',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});
 await search.fill(demo);await search.press('Enter');
 await expect(page.getByRole('heading',{name:`Environmental permits near ${demo}`})).toBeVisible();
 await expect(page.locator('.pw-marker')).toHaveCount(18);
 await expect(page.locator('[data-plant-button]')).toHaveCount(18);
 expect(new Set(await page.locator('.pw-marker-core').allTextContents()).size).toBe(4);
 const counts=page.getByRole('list',{name:'Permits by category'});await expect(counts).toContainText('Concrete batch plant');await expect(counts).toContainText('Wastewater discharge');
 const category=page.getByRole('combobox',{name:'Permit category',exact:true});
 for(const value of PERMIT_CATEGORIES){
  await category.selectOption(value);await expect(page).toHaveURL(new RegExp(`category=${value}`));
  const body=await (await page.request.get(`/api/search?q=${encodeURIComponent(demo)}&lat=29.810683571296&lng=-95.213255154669&radius=3&category=${value}`)).json() as SearchResponse;
  await expect(page.locator('.pw-marker')).toHaveCount(body.plants.length);
  await expect(page.locator('[data-plant-button]')).toHaveCount(body.plants.length);
  const marker=page.locator('.pw-marker').first();await expect(marker).toHaveAttribute('data-category',value);await marker.click({force:true});
  const panel=page.getByRole('dialog');await expect(panel).toBeVisible();await expect(panel.getByText(labels[value],{exact:true}).first()).toBeVisible();
  const selected=new URL(page.url()).searchParams.get('permit');const permit=body.plants.find(p=>p.permit.id===selected)!.permit;
  await expect(panel.getByRole('heading',{name:permit.facilityName??permit.company,exact:true})).toBeVisible();
  await expect(panel.getByRole('link',{name:'View official source',exact:true})).toHaveAttribute('href',permit.sourceUrl);
  if(value==='wastewater_permit'||value==='solid_waste_permit'){
   await expect(panel.getByRole('heading',{name:'Check the official record'})).toBeVisible();
   await expect(panel.getByRole('link',{name:'Comment on TCEQ eComment'})).toHaveCount(0);
   await expect(panel.getByText('Max production',{exact:true})).toHaveCount(0);
  }
  await page.getByRole('button',{name:'Close permit details',exact:true}).click();
 }
 await page.getByRole('combobox',{name:'Permit status',exact:true}).selectOption('expired');
 await expect(page.locator('.pw-marker')).toHaveCount(0);await expect(page.getByText('No matching permits within 3 miles in our dataset.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Switch to light mode'}).click();
 await page.reload();await expect(category).toHaveValue('solid_waste_permit');await expect(page.getByRole('combobox',{name:'Permit status',exact:true})).toHaveValue('expired');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(errors).toEqual([]);
});

test('real filters preserve radius, refresh, another address and mobile Spanish controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/?q=${encodeURIComponent(demo)}&category=wastewater_permit&status=effective&radius=5`);
 const category=page.getByRole('combobox',{name:'Permit category',exact:true});const status=page.getByRole('combobox',{name:'Permit status',exact:true});
 await expect(category).toHaveValue('wastewater_permit');await expect(status).toHaveValue('effective');
 const slider=page.getByRole('slider',{name:'Search distance'});await expect(slider).toHaveValue('5');
 const before=await page.locator('[data-plant-button]').count();await slider.fill('1');await expect(page).toHaveURL(/radius=1/);await expect(page.locator('.pw-ring-label')).toHaveText('1 mi');
 await expect.poll(()=>page.locator('[data-plant-button]').count()).toBeLessThan(before);
 await page.reload();await expect(slider).toHaveValue('1');await expect(category).toHaveValue('wastewater_permit');
 const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});await search.fill('7015 Fairbanks N Houston Rd, Houston, TX');await search.press('Enter');
 await expect(page.getByRole('heading',{name:/Environmental permits near 7015/})).toBeVisible();await expect(category).toHaveValue('wastewater_permit');await expect(status).toHaveValue('effective');await expect(slider).toHaveValue('1');
 await page.getByRole('button',{name:'Cambiar a español'}).click();await expect(page.getByRole('combobox',{name:'Categoría del permiso',exact:true})).toHaveValue('wastewater_permit');await expect(page.getByRole('combobox',{name:'Estado del permiso',exact:true})).toHaveValue('effective');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('shared coordinates keep five real permits separately clickable and exclude the home marker from the count',async({page})=>{
 await page.goto('/?q=Shores+Edge&lat=30.0485548&lng=-95.5958742&radius=2');
 await expect(page.locator('.pw-marker')).toHaveCount(5);
 await expect(page.locator('[data-plant-button]')).toHaveCount(5);
 await expect(page.getByText('5 permits within 2 miles',{exact:true})).toBeVisible();
 await expect(page.locator('.pw-you')).toHaveCount(1);
 const first=page.locator('[data-plant-id="tceq-153154L001"]');const second=page.locator('[data-plant-id="tceq-74460L002"]');
 const a=await first.boundingBox();const b=await second.boundingBox();
 expect(Math.hypot(a!.x-b!.x,a!.y-b!.y)).toBeGreaterThanOrEqual(44);
 for(const marker of [first,second]){
  await marker.click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close permit details',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 await expect(page.locator('.pw-you svg')).toHaveCount(1);
});

test('an unknown historical permit still offers an editable concerns draft without claiming an open comment period',async({page})=>{
 await page.goto('/?q=Shores+Edge&lat=30.0485548&lng=-95.5958742&radius=2&permit=tceq-153154L001');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('link',{name:'Comment on TCEQ eComment',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('link',{name:'Report an environmental concern',exact:true})).toHaveAttribute('href','https://www.tceq.texas.gov/compliance/complaints/');
 await dialog.locator('label').filter({hasText:'Dust and particulate matter'}).click();
 await dialog.getByRole('textbox',{name:'Anything else you want to say? (optional)',exact:true}).fill('Please explain the current permit conditions.');
 await dialog.getByRole('button',{name:'Draft my concerns',exact:true}).click();
 const draft=dialog.getByRole('textbox',{name:'Concerns / request for information',exact:true});
 await expect(draft).toHaveValue(/153154L001/);
 await expect(draft).toHaveValue(/Please explain the current permit conditions/);
 await expect(draft).not.toHaveValue(/public record for this application/);
 await draft.fill('Edited concerns for review.');await expect(draft).toHaveValue('Edited concerns for review.');
});
