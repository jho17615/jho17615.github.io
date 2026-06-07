const puppeteer = require('puppeteer');
const pptxgen = require('pptxgenjs');
const path = require('path');

// 96 DPI 기준: 1280px = 13.333인치, 720px = 7.5인치
// LAYOUT_WIDE(13.333×7.5인치)를 사용하면 96 DPI 스크린샷이 자연 크기로 정확히 맞음
const SLIDE_W = 1280;
const SLIDE_H = 720;
const DPI = 96;
const SLIDE_W_IN = SLIDE_W / DPI;  // 13.333... 인치
const SLIDE_H_IN = SLIDE_H / DPI;  // 7.5 인치
const VIEW_H = 2000;

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: SLIDE_W, height: VIEW_H, deviceScaleFactor: 1 });
  await page.emulateMediaType('screen');

  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });

  await page.evaluate(() => {
    document.body.classList.add('slide-export');
    document.querySelectorAll('details').forEach(el => { el.open = true; });
    document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => { el.style.display = ''; });
    document.querySelectorAll('.collapsed, .hidden, .hide').forEach(el => { el.classList.remove('collapsed', 'hidden', 'hide'); });
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

  const prs = new pptxgen();
  // LAYOUT_WIDE = 13.333×7.5인치 = 96DPI에서 정확히 1280×720px
  // → 스크린샷의 자연 크기와 슬라이드 크기가 일치하여 PowerPoint 클리핑 방지
  prs.layout = 'LAYOUT_WIDE';

  let slideNum = 1;
  for (const sec of sections) {
    if (sec.height < 10) continue;

    const maxScroll = Math.max(0, totalH - VIEW_H);
    const scrollTo = Math.min(sec.top, maxScroll);

    await page.evaluate(y => window.scrollTo(0, y), scrollTo);
    await new Promise(r => setTimeout(r, 300));

    // 720px 초과 섹션은 720px로 캡처 (자연 크기 = 7.5인치 = SLIDE_H_IN)
    const capturedH = Math.min(sec.height, SLIDE_H);

    const imgBuf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: sec.top, width: SLIDE_W, height: capturedH }
    });
    const imgBase64 = imgBuf.toString('base64');

    const slide = prs.addSlide();
    slide.background = { color: 'FFFFFF' };

    // 이미지를 96DPI 자연 크기(= 인치)로 배치 → 슬라이드 크기와 정확히 일치
    const h = capturedH / DPI;          // 자연 높이 (인치)
    const y = (SLIDE_H_IN - h) / 2;     // 세로 가운데 정렬

    slide.addImage({
      data: 'image/png;base64,' + imgBase64,
      x: 0,
      y: Math.max(0, y),
      w: SLIDE_W_IN,
      h
    });

    console.log(`슬라이드 ${slideNum} (y=${sec.top} h=${sec.height}→${capturedH}px / ${h.toFixed(2)}인치)`);
    slideNum++;
  }

  await prs.writeFile({ fileName: path.resolve(__dirname, 'Portfolio.pptx') });
  await browser.close();
  console.log(`✅ Portfolio.pptx 완료 — 총 ${slideNum - 1}슬라이드`);
})();
