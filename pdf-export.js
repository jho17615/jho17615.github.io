const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.emulateMediaType('screen');

  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // PDF용 페이지 준비
  await page.evaluate(() => {
    // 사이드바 숨기기
    const sidebar = document.querySelector('#mySidebar');
    if (sidebar) sidebar.style.display = 'none';

    // 오버레이 숨기기
    const overlay = document.querySelector('#myOverlay');
    if (overlay) overlay.style.display = 'none';

    // 메인 콘텐츠 마진 제거
    const main = document.querySelector('.w3-main');
    if (main) main.style.marginLeft = '0';

    // 포트폴리오 카드 전체 표시 (페이지네이션 우회)
    document.querySelectorAll('.portfolio-row > div').forEach(el => {
      el.style.display = 'flex';
    });

    // 페이지네이션 숨기기
    const pagination = document.querySelector('.w3-center.w3-padding-32');
    if (pagination) pagination.style.display = 'none';

    // 필터 버튼 숨기기
    const filterBar = document.querySelector('.w3-section.w3-bottombar');
    if (filterBar) filterBar.style.display = 'none';
  });

  await new Promise(r => setTimeout(r, 1500));

  await page.pdf({
    path: path.resolve(__dirname, 'Portfolio.pdf'),
    width: '1280px',
    printBackground: true,
    margin: { top: '24px', right: '24px', bottom: '24px', left: '24px' }
  });

  await browser.close();
  console.log('✅ Portfolio.pdf 생성 완료');
})();
