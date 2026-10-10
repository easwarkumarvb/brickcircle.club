import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const mock=fs.readFileSync(path.resolve('tests/isolated/fixtures/supabase-browser-mock.js'),'utf8');
const liveImages=process.env.BC_LANDING_LIVE_IMAGES==='1';
const evidence=process.env.BC_LANDING_QA_DIR;
const ids=['42143-1','42141-1','10283-1','21309-1','10214-1','10276-1'];

for(const width of [320,360,390,768,1440]){
  for(const enlarged of [false,true]){
    test(`landing pairings at ${width}px${enlarged?' with 200% text':''}`,async({page})=>{
      test.setTimeout(60000);
      await page.setViewportSize({width,height:900});
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
        if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();
        if(liveImages&&['images.brickset.com','images.weserv.nl'].includes(url.hostname))return route.continue();
        return route.abort('blockedbyclient');
      });
      const errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto('/?isolated=signed-out#home');
      await expect(page.locator('.bc-showcase-card')).toHaveCount(2);
      expect(await page.locator('img[data-set-image]').evaluateAll(images=>images.map(image=>(image as HTMLElement).dataset.setImage))).toEqual(ids);
      expect(await page.locator('.bc-landing-showcase').evaluate(el=>Array.from(el.children).slice(0,3).map(child=>child.className))).toEqual(['bc-showcase-card own','bc-showcase-link','bc-showcase-card want']);
      await expect(page.locator('.bc-story')).toContainText('Another collector owns Saturn V and wants your Discovery');
      await expect(page.locator('.bc-example-match')).toContainText('The other collector owns Colosseum and wants your Tower Bridge');
      if(liveImages){
        for(const image of await page.locator('img[data-set-image]').all()){
          await image.scrollIntoViewIfNeeded();
          await expect(image).toBeVisible();
          await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth),{timeout:20000}).toBeGreaterThan(100);
          expect(await image.evaluate(el=>getComputedStyle(el).objectFit)).toBe('contain');
        }
      }
      if(enlarged){
        // Double each computed font size, including px-based brand overrides.
        await page.evaluate(()=>{
          const nodes=Array.from(document.querySelectorAll<HTMLElement>('.bc-main *'));
          const sizes=nodes.map(el=>parseFloat(getComputedStyle(el).fontSize));
          nodes.forEach((el,i)=>el.style.setProperty('font-size',`${sizes[i]*2}px`,'important'));
        });
      }
      const layout=await page.evaluate(()=>{
        const own=document.querySelector('.bc-showcase-card.own')!,bar=document.querySelector('.bc-showcase-link')!,want=document.querySelector('.bc-showcase-card.want')!;
        const a=own.getBoundingClientRect(),b=bar.getBoundingClientRect(),c=want.getBoundingClientRect();
        const selectors='.bc-landing-hero,.bc-showcase-card,.bc-showcase-link,.bc-story-flow article,.bc-example-sets article';
        return {
          gapBefore:b.top-a.bottom,gapAfter:c.top-b.bottom,
          centered:Math.abs((b.left+b.right)/2-(a.left+a.right)/2)<1,
          position:getComputedStyle(bar).position,rotation:getComputedStyle(own).transform,
          overflow:document.documentElement.scrollWidth>innerWidth,
          clipped:Array.from(document.querySelectorAll<HTMLElement>(selectors)).filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.className)
        };
      });
      expect(layout.gapBefore).toBeGreaterThanOrEqual(16);
      expect(layout.gapAfter).toBeGreaterThanOrEqual(16);
      expect(layout.centered).toBe(true);
      expect(layout.position).toBe('static');
      expect(layout.rotation).toBe('none');
      expect(layout.overflow).toBe(false);
      expect(layout.clipped).toEqual([]);
      expect(errors).toEqual([]);
      const accessibility=await new AxeBuilder({page}).include('.bc-main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(accessibility.violations).toEqual([]);
      await page.locator('.bc-example-match').scrollIntoViewIfNeeded();
      const exampleAccessibility=await new AxeBuilder({page}).include('.bc-example-match').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(exampleAccessibility.violations).toEqual([]);
      if(evidence&&liveImages){
        fs.mkdirSync(evidence,{recursive:true});
        await page.evaluate(()=>scrollTo(0,0));
        const name=`landing-${width}${enlarged?'-text-200':''}`;
        // Fixed navigation otherwise lands across stitched content in full-page/element captures.
        // Layout and accessibility assertions above run with normal navigation visible.
        const style='.bc-mobile-nav{visibility:hidden!important}';
        await page.screenshot({path:path.join(evidence,`${name}.png`),fullPage:true,style});
        await page.locator('.bc-landing-hero').screenshot({path:path.join(evidence,`${name}-hero.png`),style});
        fs.writeFileSync(path.join(evidence,`${name}.json`),JSON.stringify({width,enlarged,liveImages,ids,layout,axeViolations:accessibility.violations},null,2)+'\n');
      }
    });
  }
}
