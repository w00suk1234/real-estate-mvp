import asyncio
import base64
from urllib.parse import urlparse


ALLOWED_NAVER_HOSTS = {
    "land.naver.com",
    "new.land.naver.com",
    "m.land.naver.com",
}


class PageFetchError(RuntimeError):
    pass


def assert_allowed_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise PageFetchError("http 또는 https URL만 사용할 수 있습니다.")
    if parsed.hostname not in ALLOWED_NAVER_HOSTS:
        raise PageFetchError("현재는 네이버 부동산 URL만 가져올 수 있습니다.")


async def auto_scroll(page, rounds: int = 6) -> None:
    for _ in range(rounds):
        await page.mouse.wheel(0, 900)
        await page.wait_for_timeout(450)


async def fetch_page_dom_snapshot(url: str) -> dict:
    assert_allowed_url(url)

    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise PageFetchError("Playwright가 설치되어 있지 않습니다.") from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = await browser.new_page(
            viewport={"width": 1440, "height": 1600},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=35000)
            await page.wait_for_timeout(2500)
            await close_common_popups(page)
            await auto_scroll(page)
            data = await page.evaluate(DOM_EXTRACT_SCRIPT)
            screenshot = await page.screenshot(full_page=True, type="png")
            data["screenshot_base64"] = base64.b64encode(screenshot).decode("ascii")
            return data
        except Exception as exc:
            raise PageFetchError(f"페이지 수집 실패: {exc}") from exc
        finally:
            await browser.close()


async def close_common_popups(page) -> None:
    selectors = [
        "button:has-text('닫기')",
        "button:has-text('확인')",
        "button[aria-label='닫기']",
        ".btn_close",
        ".popup_close",
    ]
    for selector in selectors:
        try:
            element = await page.query_selector(selector)
            if element:
                await element.click(timeout=1000)
                await page.wait_for_timeout(300)
        except Exception:
            continue


DOM_EXTRACT_SCRIPT = """
() => {
  const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
  const absoluteUrl = (value) => {
    if (!value) return '';
    try { return new URL(value, location.href).toString(); } catch { return ''; }
  };

  const meta = {};
  document.querySelectorAll('meta[property], meta[name]').forEach((node) => {
    const key = node.getAttribute('property') || node.getAttribute('name');
    const value = node.getAttribute('content');
    if (key && value) meta[key] = value;
  });

  const pairs = [];
  document.querySelectorAll('table tr').forEach((row) => {
    const cells = Array.from(row.querySelectorAll('th,td')).map((cell) => normalize(cell.innerText));
    if (cells.length >= 2) pairs.push({ key: cells[0], value: cells.slice(1).join(' ') });
  });

  document.querySelectorAll('dl').forEach((dl) => {
    const dts = Array.from(dl.querySelectorAll('dt'));
    const dds = Array.from(dl.querySelectorAll('dd'));
    dts.forEach((dt, idx) => {
      const key = normalize(dt.innerText);
      const value = normalize(dds[idx]?.innerText);
      if (key && value) pairs.push({ key, value });
    });
  });

  document.querySelectorAll('li, .info, .item, .detail, .detail_box').forEach((node) => {
    const text = normalize(node.innerText);
    if (!text || text.length > 180) return;
    const parts = text.split(/[:：]/);
    if (parts.length >= 2) {
      pairs.push({ key: normalize(parts[0]), value: normalize(parts.slice(1).join(':')) });
    }
  });

  const images = [];
  document.querySelectorAll('img').forEach((img) => {
    const src = absoluteUrl(img.currentSrc || img.src || img.getAttribute('data-src'));
    if (!src) return;
    images.push({
      url: src,
      alt: normalize(img.alt),
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0,
      source: 'img'
    });
  });

  document.querySelectorAll('[style]').forEach((node) => {
    const style = node.getAttribute('style') || '';
    const match = style.match(/url\\(["']?(.*?)["']?\\)/);
    const src = absoluteUrl(match?.[1]);
    if (src) images.push({ url: src, alt: normalize(node.innerText), width: 0, height: 0, source: 'background' });
  });

  const uniqueImages = Array.from(new Map(images.map((item) => [item.url, item])).values())
    .filter((item) => !/sprite|blank|logo|favicon/i.test(item.url))
    .slice(0, 40);

  return {
    title: normalize(document.querySelector('h1')?.innerText || meta['og:title'] || document.title),
    pageTitle: normalize(document.title),
    meta,
    pairs,
    images: uniqueImages,
    url: location.href
  };
}
"""


def run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()
