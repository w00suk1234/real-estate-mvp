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
        raise PageFetchError("Only http or https URLs are supported.")
    if parsed.hostname not in ALLOWED_NAVER_HOSTS:
        raise PageFetchError("Only Naver Land URLs are supported for now.")


async def auto_scroll(page, rounds: int = 6) -> None:
    for _ in range(rounds):
        await page.mouse.wheel(0, 900)
        await page.wait_for_timeout(450)


async def fetch_page_dom_snapshot(url: str) -> dict:
    assert_allowed_url(url)

    try:
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise PageFetchError("Playwright is not installed.") from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 1600},
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        try:
            try:
                await page.goto(url, wait_until="commit", timeout=45000)
            except PlaywrightTimeoutError as exc:
                raise PageFetchError(
                    "Naver Land did not respond in time. Try an individual listing detail URL, "
                    "or try again after a moment."
                ) from exc

            # Naver Land is a heavy SPA. The initial response can be enough for
            # basic extraction even when full DOMContentLoaded is delayed.
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
            except PlaywrightTimeoutError:
                pass

            try:
                await page.wait_for_selector("body", timeout=15000)
            except PlaywrightTimeoutError as exc:
                raise PageFetchError("The page body was not available for extraction.") from exc

            await page.wait_for_timeout(2500)
            await close_common_popups(page)
            await auto_scroll(page)
            data = await page.evaluate(DOM_EXTRACT_SCRIPT)
            screenshot = await page.screenshot(full_page=True, type="png")
            data["screenshot_base64"] = base64.b64encode(screenshot).decode("ascii")
            return data
        except PageFetchError:
            raise
        except Exception as exc:
            raise PageFetchError(f"Page extraction failed: {exc}") from exc
        finally:
            await context.close()
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

  document.querySelectorAll('li, .info, .item, .detail, .detail_box, [class*=detail], [class*=info]').forEach((node) => {
    const text = normalize(node.innerText);
    if (!text || text.length > 220) return;
    const parts = text.split(/[:：]/);
    if (parts.length >= 2) {
      pairs.push({ key: normalize(parts[0]), value: normalize(parts.slice(1).join(':')) });
    }
  });

  const images = [];
  const pushImage = (url, alt, source, width = 0, height = 0) => {
    const absolute = absoluteUrl(url);
    if (!absolute) return;
    images.push({ url: absolute, alt: normalize(alt), width, height, source });
  };

  pushImage(meta['og:image'], 'og:image', 'meta');

  document.querySelectorAll('img').forEach((img) => {
    pushImage(
      img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'),
      img.alt,
      'img',
      img.naturalWidth || img.width || 0,
      img.naturalHeight || img.height || 0
    );
  });

  document.querySelectorAll('[style]').forEach((node) => {
    const style = node.getAttribute('style') || '';
    const match = style.match(/url\\(["']?(.*?)["']?\\)/);
    pushImage(match?.[1], node.innerText, 'background');
  });

  const uniqueImages = Array.from(new Map(images.map((item) => [item.url, item])).values())
    .filter((item) => !/sprite|blank|logo|favicon|map/i.test(item.url))
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
