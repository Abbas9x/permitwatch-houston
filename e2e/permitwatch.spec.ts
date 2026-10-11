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
  await expect(page.getByRole('heading',{name:'Environmental permits near ZIP 77020'})).toBeVisible();
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
  await expect(page.getByText('No matching permits within 3 miles in our dataset.',{exact:true})).toBeVisible();
  await expect(page.locator('.pw-marker')).toHaveCount(0);
  await expect(page.locator('header a')).toHaveCount(1);
  expect(requests.every(url=>/\/api\/(?:search\?|geocode\/suggest\?|permits\/[A-Za-z0-9._-]+(?:\/comment-draft)?$)/.test(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('invalid input, address suggestions, upstream errors and malformed server responses',async({page})=>{
  await page.goto('/');const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});
  await search.fill('7702');await search.press('Enter');await expect(page.getByRole('alert')).toContainText('ZIP codes have exactly 5 digits');
  await search.fill('Calhoun');await expect(page.getByRole('option',{name:/4800 Calhoun/})).toBeVisible();
  await page.getByRole('option',{name:/4800 Calhoun/}).click();await expect(page.getByRole('heading',{name:/Environmental permits near 4800 Calhoun/})).toBeVisible();
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
  await expect(panel.getByText(/current public-comment period is not established/)).toBeVisible();
  await expect(panel.getByText('September 30, 2026',{exact:true})).toBeVisible();
  await expect(panel.getByRole('link',{name:'Not listed in source – check official record',exact:true}).first()).toBeVisible();
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
  await expect(page.getByText('1 permit within 1 mile',{exact:true})).toBeVisible();
  expect(searches).toHaveLength(1); // Moving the distance does not repeat geocoding/search requests.
  await page.reload();await expect(slider).toHaveValue('1');
  await expect(page.locator('.pw-marker')).toHaveCount(1);
  const search = page.getByRole('combobox',{name:'Houston address or ZIP code'});
  await search.fill('77494');await search.press('Enter');
  await expect(slider).toHaveValue('1');
  await expect(page.getByText('No matching permits within 1 mile in our dataset.',{exact:true})).toBeVisible();
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

test('appearance switch preserves search, map controls, and preference on refresh', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/?q=77020&radius=5');
  await expect(page.locator('.pw-ring-label')).toHaveText('5 mi');
  await page.mouse.move(1100,650);
  await page.mouse.down();
  await page.mouse.move(1250,750,{steps:12});
  await page.mouse.up();
  await page.waitForTimeout(700); // Allow the map's pan inertia to settle.
  const panned = await page.locator('.pw-you').boundingBox();
  await page.getByRole('button',{name:'Switch to light mode',exact:true}).click();
  await page.waitForTimeout(700); // Wait for the new style's layers to be restored.
  const themed = await page.locator('.pw-you').boundingBox();
  expect(Math.hypot(themed!.x-panned!.x, themed!.y-panned!.y)).toBeLessThan(5);
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('html')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('.pw-ring-label')).toHaveText('5 mi');
  await expect(page.getByRole('slider',{name:'Search distance'})).toHaveValue('5');
  await expect(page.locator('header a')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('.pw-marker')).toHaveCount(3);
  await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('html')).toHaveCSS('background-color','rgb(0, 0, 0)');
  await page.getByRole('slider',{name:'Search distance'}).fill('1');
  await expect(page.locator('.pw-marker')).toHaveCount(1);
  await expect(page.locator('.pw-ring-label')).toHaveText('1 mi');
  expect(errors).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Earth canvas continues into the searched location in both appearances', async ({page}) => {
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'hardwareConcurrency',{value:8});
    Object.defineProperty(navigator,'deviceMemory',{value:8});
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/');
  const canvas=page.locator('.pw-earth .maplibregl-canvas');
  await expect(canvas).toBeVisible({timeout:15000});
  const earth=await canvas.elementHandle();
  await page.getByRole('button',{name:'Switch to light mode',exact:true}).click();
  await expect(canvas).toBeVisible({timeout:15000});
  const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});
  await search.fill('77020');await search.press('Enter');
  await expect(page.locator('.pw-ring-label')).toHaveText('3 mi');
  expect(await earth!.evaluate(element=>element===document.querySelector('.maplibregl-canvas'))).toBe(true);
  await expect(page.locator('.pw-marker')).toHaveCount(3);
  await expect(page.locator('.pw-earth-handoff')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('landing globe keeps its scale without clipping the canvas top', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {value:8});
    Object.defineProperty(navigator, 'deviceMemory', {value:8});
  });
  await page.goto('/');
  const canvas = page.locator('.pw-earth .maplibregl-canvas');
  await expect(canvas).toBeVisible({timeout:15000});
  for (const viewport of [{width:1440,height:960}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const scene = await page.locator('.pw-earth').boundingBox();
      const bounds = await canvas.boundingBox();
      if (!scene || !bounds) return false;
      return bounds.y >= scene.y
        && Math.abs(bounds.width - scene.width) < 1
        && Math.abs(bounds.height - scene.height) < 1;
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('failed globe searches release the parked canvas and allow retry', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {value:8});
    Object.defineProperty(navigator, 'deviceMemory', {value:8});
  });
  await page.route('**/api/search?**', route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'unavailable',message:'Search is temporarily unavailable. Please retry.'}})}));
  await page.goto('/');
  await expect(page.locator('.pw-earth .maplibregl-canvas')).toBeVisible({timeout:15000});
  const search = page.getByRole('combobox', {name:'Houston address or ZIP code'});
  await search.fill('77020');await search.press('Enter');
  await expect(page.getByRole('alert').filter({hasText:'Search is temporarily unavailable'})).toBeVisible();
  await expect(page.locator('.pw-earth-handoff')).toHaveCount(0);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.unroute('**/api/search?**');
  await page.getByRole('button', {name:'Try again',exact:true}).click();
  await expect(page.locator('.pw-ring-label')).toHaveText('3 mi');
});

test('browser Back during an animated search restores an usable landing page',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.route('**/api/search?**',async route=>{
  await new Promise(resolve=>setTimeout(resolve,1000));
  await route.continue().catch(()=>{});
 });
 await page.goto('/');
 const search=page.getByRole('combobox',{name:'Houston address or ZIP code'});
 await search.fill('77020');await search.press('Enter');
 await expect(page).toHaveURL(/q=77020/);
 await page.goBack();
 await expect(page).toHaveURL('http://127.0.0.1:8790/');
 await expect(page.getByTestId('map-transition')).toHaveCount(0);
 await expect(search).toBeVisible();
 await page.unroute('**/api/search?**');
 await search.fill('77020');await search.press('Enter');
 await expect(page.getByRole('heading',{name:'Environmental permits near ZIP 77020'})).toBeVisible();
 await expect(page.getByTestId('map-transition')).toHaveCount(0);
});
