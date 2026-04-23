const APP_URL = "https://real-estate-mvp-production.up.railway.app";
const NAVER_LAND_URL = "https://new.land.naver.com/";

function isNaverLandUrl(url) {
  return /^https:\/\/(new\.)?land\.naver\.com\//i.test(url || "");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setError(message) {
  document.getElementById("error").textContent = message || "";
}

async function renderCurrentUrl() {
  const tab = await getActiveTab();
  const url = tab?.url || "";
  const urlBox = document.getElementById("current-url");
  urlBox.textContent = url || "현재 탭 URL을 읽을 수 없습니다.";
  if (!isNaverLandUrl(url)) {
    setError("네이버 부동산 매물 페이지에서 실행하면 바로 가져올 수 있습니다.");
  }
}

document.getElementById("send").addEventListener("click", async () => {
  const tab = await getActiveTab();
  const currentUrl = tab?.url || "";

  if (!isNaverLandUrl(currentUrl)) {
    setError("네이버 부동산 페이지에서 실행해주세요.");
    return;
  }

  const targetUrl = `${APP_URL}/?import_url=${encodeURIComponent(currentUrl)}`;
  await chrome.tabs.create({ url: targetUrl });
});

document.getElementById("open-naver").addEventListener("click", async () => {
  await chrome.tabs.create({ url: NAVER_LAND_URL });
});

renderCurrentUrl();
