const puppeteer = require('puppeteer');
const pptxgen = require('pptxgenjs');
const path = require('path');

// deviceScaleFactor: 2 → 2배 해상도 스크린샷 → 글자 선명
const DSF = 2;
const SLIDE_W_CSS = 1280;   // CSS 픽셀
const SLIDE_H_CSS = 720;
const SLIDE_W_IN = SLIDE_W_CSS / 96;  // 13.333 인치 (LAYOUT_WIDE 폭)
const SLIDE_H_IN = SLIDE_H_CSS / 96;  // 7.5 인치
const VIEW_H_CSS = 2000;

/* PNG pHYs 청크 삽입 — PowerPoint가 올바른 물리 크기로 렌더링 */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function embedDpi(buf, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const insertAt = 33; // PNG sig(8) + IHDR chunk(25)
  const type = Buffer.from('pHYs', 'ascii');
  const data = Buffer.allocUnsafe(9);
  data.writeUInt32BE(ppm, 0); data.writeUInt32BE(ppm, 4); data.writeUInt8(1, 8);
  const crc = crc32(Buffer.concat([type, data]));
  const chunk = Buffer.allocUnsafe(21);
  chunk.writeUInt32BE(9, 0); type.copy(chunk, 4); data.copy(chunk, 8); chunk.writeUInt32BE(crc, 17);
  return Buffer.concat([buf.slice(0, insertAt), chunk, buf.slice(insertAt)]);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: SLIDE_W_CSS, height: VIEW_H_CSS, deviceScaleFactor: DSF });
  await page.emulateMediaType('screen');

  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });

  await page.evaluate(() => {
    document.body.classList.add('slide-export');
    document.querySelectorAll('details').forEach(el => { el.open = true; });
    // 네비게이션 바 숨기기 (fixed 위치라 스크린샷에 겹침)
    const nav = document.querySelector('nav');
    if (nav) nav.style.display = 'none';
  });
  await new Promise(r => setTimeout(r, 2500));

  const totalH = await page.evaluate(() => document.body.scrollHeight);

  const sections = await page.evaluate(() => {
    const items = [];
    const pageH = document.body.scrollHeight;

    ['.hero', '.about-section', '.skills-section',
     '.experience-section', '.education-section', '.awards-section'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      items.push({ top: Math.round(r.top), height: Math.ceil(r.height) });
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
  prs.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 인치

  let slideNum = 1;
  for (const sec of sections) {
    if (sec.height < 10) continue;

    const maxScroll = Math.max(0, totalH - VIEW_H_CSS);
    const scrollTo = Math.min(sec.top, maxScroll);
    await page.evaluate(y => window.scrollTo(0, y), scrollTo);
    await new Promise(r => setTimeout(r, 300));

    // CSS 픽셀로 캡처, 실제 이미지는 DSF배 크기
    const capturedH_css = sec.height;
    const physW = SLIDE_W_CSS * DSF;   // 2560
    const physH = capturedH_css * DSF;

    const imgBuf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: sec.top, width: SLIDE_W_CSS, height: capturedH_css }
    });

    let w, h, x, y, dpi;
    const imgAR = SLIDE_W_CSS / capturedH_css;
    const slideAR = SLIDE_W_IN / SLIDE_H_IN; // 1.778

    if (imgAR >= slideAR) {
      // 가로가 넓은 섹션 → 폭 기준 맞추고 세로 가운데
      w = SLIDE_W_IN;
      h = SLIDE_W_IN * capturedH_css / SLIDE_W_CSS;
      x = 0;
      y = (SLIDE_H_IN - h) / 2;
      dpi = physW / SLIDE_W_IN;          // = 192
    } else {
      // 세로가 긴 섹션 → 높이 기준 맞추고 가로 가운데
      h = SLIDE_H_IN;
      w = SLIDE_H_IN * SLIDE_W_CSS / capturedH_css;
      x = (SLIDE_W_IN - w) / 2;
      y = 0;
      dpi = physH / SLIDE_H_IN;
    }

    const imgWithDpi = embedDpi(imgBuf, Math.round(dpi));
    const imgBase64 = imgWithDpi.toString('base64');

    const slide = prs.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: 'image/png;base64,' + imgBase64, x, y, w, h });

    console.log(`슬라이드 ${slideNum}  ${physW}×${physH}px @ ${Math.round(dpi)}DPI → ${w.toFixed(2)}″×${h.toFixed(2)}″`);
    slideNum++;
  }

  await prs.writeFile({ fileName: path.resolve(__dirname, 'Portfolio.pptx') });
  await browser.close();
  console.log(`\n✅ Portfolio.pptx 완료 — 총 ${slideNum - 1}슬라이드`);
})();
