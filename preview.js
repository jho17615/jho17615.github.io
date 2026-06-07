const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SLIDE_W = 1280;
const SLIDE_H = 720;
const VIEW_H = 2000;

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: SLIDE_W, height: VIEW_H, deviceScaleFactor: 1 });
  await page.emulateMediaType('screen');

  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });

  await page.addStyleTag({
    content: `nav { display: none !important; } body { padding-top: 0 !important; margin-top: 0 !important; }`
  });

  await page.evaluate(() => {
    document.body.classList.add('slide-export');
    document.querySelectorAll('details').forEach(el => { el.open = true; });
    document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => { el.style.display = ''; });
    document.querySelectorAll('.collapsed, .hidden, .hide').forEach(el => { el.classList.remove('collapsed', 'hidden', 'hide'); });
    ['.education-section', '.experience-section', '.awards-section'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.display = ''; el.style.visibility = 'visible'; el.style.opacity = '1';
      });
    });
  });

  await new Promise(r => setTimeout(r, 2500));

  const totalH = await page.evaluate(() => document.body.scrollHeight);

  const sections = await page.evaluate(() => {
    const items = [];
    const pageH = document.body.scrollHeight;
    ['.hero', '.about-section', '.skills-section',
     '.experience-section', '.education-section',
     '.awards-section'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      items.push({ top: Math.round(rect.top), height: Math.ceil(rect.height) });
    });
    // contact 섹션은 footer까지 포함해서 페이지 끝까지 캡처
    const contactEl = document.querySelector('.contact-section');
    if (contactEl) {
      const top = Math.round(contactEl.getBoundingClientRect().top);
      items.push({ top, height: pageH - top });
    }
    const ps = document.querySelector('.projects-section');
    if (ps) {
      const pItems = Array.from(ps.querySelectorAll('.project-item'));
      if (pItems.length > 0) {
        const secTop = Math.round(ps.getBoundingClientRect().top);
        const firstBottom = Math.round(pItems[0].getBoundingClientRect().bottom);
        items.push({ top: secTop, height: firstBottom - secTop });
        for (let i = 1; i < pItems.length; i++) {
          const r = pItems[i].getBoundingClientRect();
          items.push({ top: Math.round(r.top), height: Math.ceil(r.height) });
        }
      }
    }
    return items.sort((a, b) => a.top - b.top);
  });

  const outDir = path.resolve(__dirname, 'preview_slides');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  fs.readdirSync(outDir).forEach(f => fs.unlinkSync(path.join(outDir, f)));

  let i = 1;
  for (const sec of sections) {
    if (sec.height < 10) continue;
    const maxScroll = Math.max(0, totalH - VIEW_H);
    const scrollTo = Math.min(sec.top, maxScroll);

    await page.evaluate(y => window.scrollTo(0, y), scrollTo);
    await new Promise(r => setTimeout(r, 200));

    await page.screenshot({
      path: path.join(outDir, `slide_${i}.png`),
      clip: { x: 0, y: sec.top, width: SLIDE_W, height: sec.height }
    });
    console.log(`slide_${i}.png (y=${sec.top} h=${sec.height})`);
    i++;
  }

  await browser.close();
  console.log(`✅ 총 ${i - 1}장 저장 → preview_slides/`);
})();
