import { expect, test } from '@playwright/test';

test.beforeEach(async ({page})=>{
  // Exercise the real MapLibre canvas, ring geometry, worker, and marker controls without tile-network variability.
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#102036'}}]})}));
});

test('search, map markers, permit details, templates, refresh and repeat search',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/'))requests.push(request.url());});
  await page.goto('/');
  const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});
  await search.fill('77020');await search.press('Enter');
  await expect(page.getByRole('heading',{name:'Concrete batch plants near ZIP 77020'})).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.pw-marker')).toHaveCount(3);
  await page.locator('.pw-marker[data-plant-id="sample-001"]').click({force:true});
  const panel=page.getByRole('dialog');await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading',{name:'[SAMPLE] Fictional Ready-Mix #1',exact:true})).toBeVisible();
  await expect(panel.getByRole('link',{name:'View official notice',exact:true})).toHaveAttribute('href',/tceq/);
  await panel.getByRole('checkbox',{name:'Dust and particulate matter',exact:true}).check({force:true});
  await panel.getByRole('button',{name:'Draft my comment',exact:true}).click();
  const draft=panel.getByRole('textbox',{name:'Comment',exact:true});await expect(draft).toHaveValue(/SAMPLE-100001/);
  await draft.fill('Edited draft for review.');await expect(draft).toHaveValue('Edited draft for review.');
  await expect(panel.getByText(/Template built from the permit data/)).toBeVisible();
  await page.reload();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close permit details',exact:true}).click();
  await search.fill('77494');await search.press('Enter');
  await expect(page.getByText('No permitted concrete batch plants within 3 miles in our dataset.',{exact:true})).toBeVisible();
  await expect(page.locator('.pw-marker')).toHaveCount(0);
  await expect(page.locator('header a')).toHaveCount(2);
  expect(requests.every(url=>/\/api\/(?:search\?|geocode\/suggest\?|permits\/[A-Za-z0-9._-]+(?:\/comment-draft)?$)/.test(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('invalid input, address suggestions, upstream errors and malformed server responses',async({page})=>{
  await page.goto('/');const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});
  await search.fill('7702');await search.press('Enter');await expect(page.getByRole('alert')).toContainText('ZIP codes have exactly 5 digits');
  await search.fill('Calhoun');await expect(page.getByRole('option',{name:/4800 Calhoun/})).toBeVisible();
  await page.getByRole('option',{name:/4800 Calhoun/}).click();await expect(page.getByRole('heading',{name:/Concrete batch plants near 4800 Calhoun/})).toBeVisible();
  await page.goto('/?q=unfindable+street');await expect(page.getByRole('alert').filter({hasText:/address lookup service is not responding/})).toBeVisible();
  await page.route('**/api/search?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'unavailable',message:'Search is temporarily unavailable. Please retry.'}})}));
  await page.goto('/?q=77020');await expect(page.getByRole('alert').filter({hasText:'Search is temporarily unavailable'})).toBeVisible();
  await page.unroute('**/api/search?**');
  await page.route('**/api/search?**',route=>route.fulfill({status:200,contentType:'text/html',body:'<html>Invalid gateway response</html>'}));
  await page.goto('/?q=77020');await expect(page.getByRole('alert').filter({hasText:'Something went wrong'})).toBeVisible();
});

test('mobile details tolerate missing optional data and direct navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?q=77051&permit=sample-005');
  const panel=page.getByRole('dialog');await expect(panel).toBeVisible();
  await expect(panel.getByText('This notice does not list a comment deadline. Notice issued September 30, 2026.',{exact:false})).toBeVisible();
  await expect(panel.getByRole('link',{name:'Not listed in notice – check TCEQ',exact:true}).first()).toBeVisible();
  await expect(panel.getByRole('heading',{name:'Ask about this permit'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Close permit details',exact:true}).click();
  await expect(panel).not.toBeVisible();expect(errors).toEqual([]);
});


test('distance slider synchronizes the map, results, capacity and shared URL', async ({page}) => {
  const searches: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/search?')) searches.push(request.url()); });
  await page.goto('/?q=77020');
  const slider = page.getByRole('slider', {name:'Search distance'});
  await expect(slider).toHaveValue('3');
  await expect(page.locator('.pw-ring-label')).toHaveCount(1);
  await slider.focus();await slider.press('End');
  await expect(slider).toHaveValue('10');
  await expect(page).toHaveURL(/radius=10/);
  await expect(page.locator('.pw-marker')).toHaveCount(4);
  await expect(page.locator('.pw-ring-label')).toHaveText('10 mi');
  await expect(page.getByRole('region',{name:'Your area at a glance'})).toContainText('750 cubic yards/hour');
  await page.locator('.pw-marker[data-plant-id="sample-001"]').click({force:true});
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close permit details',exact:true}).click();
  await slider.focus();await slider.press('Home');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('.pw-marker')).toHaveCount(1);
  await expect(page.locator('.pw-ring-label')).toHaveText('1 mi');
  await expect.poll(async () => {
    const map = await page.locator('.maplibregl-map').boundingBox();
    const you = await page.locator('.pw-you').boundingBox();
    if (!map || !you) return Infinity;
    return Math.abs(you.x + you.width / 2 - (map.x + map.width / 2));
  }).toBeLessThan(5); // Detail-panel camera padding must not offset the resized boundary.

  await expect(page.getByRole('region',{name:'Your area at a glance'})).toContainText('250 cubic yards/hour');
  await expect(page.getByText('1 plant within 1 mile',{exact:true})).toBeVisible();
  expect(searches).toHaveLength(1); // Moving the distance does not repeat geocoding/search requests.
  await page.reload();await expect(slider).toHaveValue('1');
  await expect(page.locator('.pw-marker')).toHaveCount(1);
  const search = page.getByRole('combobox',{name:'Houston address or ZIP code'});
  await search.fill('77494');await search.press('Enter');
  await expect(slider).toHaveValue('1');
  await expect(page.getByText('No permitted concrete batch plants within 1 mile in our dataset.',{exact:true})).toBeVisible();
});

test('mobile distance slider supports touch input, direct links and Spanish labels', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?q=77020&radius=10&permit=sample-001');
  const slider = page.getByRole('slider',{name:'Search distance'});
  await expect(slider).toHaveValue('10');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close permit details',exact:true}).click();
  await slider.fill('1');
  await expect(page.locator('.pw-marker')).toHaveCount(1);
  await page.getByRole('button',{name:'Cambiar a español'}).click();
  await expect(page.getByRole('slider',{name:'Distancia de búsqueda'})).toHaveValue('1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
