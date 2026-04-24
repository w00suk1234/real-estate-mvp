import { useEffect, useMemo, useRef, useState } from "react";
import { importNaverListing } from "../../api";
import { useAuth } from "../../auth/AuthContext";

const NAVER_LAND_URL = "https://new.land.naver.com/";
const EXTENSION_DOWNLOAD_URL = "/downloads/real-estate-mvp-extension.zip";

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractNaverLandUrl(value) {
  const trimmed = normalize(value);
  const match = trimmed.match(/https?:\/\/(?:new\.)?land\.naver\.com[^\s"'<>)]*/i);
  return match?.[0] || trimmed;
}

function firstRegex(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return "";
}

function findByAliases(table, aliases) {
  for (const [key, value] of Object.entries(table)) {
    if (aliases.some((alias) => key.includes(alias))) return normalize(value);
  }
  return "";
}

function makePairTable(snapshot) {
  const table = {};
  for (const pair of snapshot?.pairs || []) {
    const key = normalize(pair.key);
    const value = normalize(pair.value);
    if (key && value && !table[key]) table[key] = value;
  }
  return table;
}

function cleanNumber(value) {
  const match = String(value || "").match(/[\d,.]+/);
  return match ? match[0].replaceAll(",", "") : "";
}

function moneyToManwon(value) {
  const text = normalize(value).replaceAll(",", "");
  const eokMatch = text.match(/([\d.]+)\s*억/);
  if (eokMatch) {
    const eok = Number(eokMatch[1]) || 0;
    const afterEok = text.slice(eokMatch.index + eokMatch[0].length);
    const restMatch = afterEok.match(/([\d.]+)/);
    return String(Math.round(eok * 10000 + (Number(restMatch?.[1]) || 0)));
  }
  return cleanNumber(text);
}

function normalizeAddress(value) {
  const text = normalize(value);
  if (!text) return "";

  const addressMatch = text.match(/((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{6,80})/);
  return normalize(addressMatch?.[1] || text.slice(0, 80));
}

function extractPrice(text, table, parsed) {
  return (
    normalize(parsed?.price_text) ||
    findByAliases(table, ["가격", "매매가", "전세가", "보증금", "월세", "매매", "전세"]) ||
    firstRegex(text, [
      /(월세\s*[\d,.]+(?:억)?(?:\s*\/\s*[\d,.]+)?)/,
      /(보증금\s*[\d,.]+(?:억)?(?:\s*\/\s*[\d,.]+)?)/,
      /(전세\s*[\d,.]+(?:억)?)/,
      /(매매\s*[\d,.]+(?:억)?)/,
      /(\d+억\s*\d*[\d,.]*\s*\/\s*\d+[\d,.]*)/,
    ])
  );
}

function extractArea(text, table, parsed) {
  const areaText =
    normalize(parsed?.area_text) ||
    findByAliases(table, ["계약면적", "공급면적", "전용면적", "면적"]) ||
    firstRegex(text, [
      /((?:공급|계약|전용)\s*[\d,.]+\s*(?:㎡|m²|m2)[^\n]{0,24})/,
      /(([\d,.]+\s*(?:㎡|m²|m2)\s*\/\s*[\d,.]+\s*(?:㎡|m²|m2)))/,
    ]);

  return {
    areaText,
    supplyArea:
      cleanNumber(parsed?.supply_area) ||
      firstRegex(areaText, [/(?:공급|계약)\s*([\d,.]+)/]) ||
      firstRegex(text, [/(?:공급|계약)면적\s*([\d,.]+)/]),
    exclusiveArea:
      cleanNumber(parsed?.exclusive_area) ||
      firstRegex(areaText, [/전용\s*([\d,.]+)/]) ||
      firstRegex(text, [/전용(?:면적)?\s*([\d,.]+)/]),
  };
}

function pickTitle(text, table, parsed) {
  const direct =
    normalize(parsed?.title) ||
    findByAliases(table, ["매물명", "단지명", "건물명", "매물", "상호"]);
  if (direct) return direct;

  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => normalize(line))
    .filter(Boolean)
    .filter((line) => line.length >= 2 && line.length <= 40)
    .filter((line) => !/[/:]/.test(line))
    .filter((line) => !/(네이버|로그인|회원가입|필터|지도|목록|바로가기|메일|알림|프로필|pay)/i.test(line));

  return lines[0] || "네이버 매물 초안";
}

function buildLocalDraftFromSnapshot(snapshot) {
  const parsed = snapshot?.parsed_fields || {};
  const table = makePairTable(snapshot);
  const text = normalize(snapshot?.focused_text || snapshot?.visible_text);

  const title = pickTitle(text, table, parsed);
  const priceText = extractPrice(text, table, parsed);
  const dealType =
    normalize(parsed?.deal_type) ||
    (priceText.includes("전세") ? "전세" : priceText.includes("매매") ? "매매" : "월세");

  const deposit =
    normalize(parsed?.deposit) ||
    (dealType === "월세" ? moneyToManwon(priceText.split("/")[0]) : moneyToManwon(priceText));
  const monthlyRent =
    normalize(parsed?.monthly_rent) ||
    (dealType === "월세" ? moneyToManwon(priceText.split("/")[1] || "") : "");

  const address = normalizeAddress(
    normalize(parsed?.address) ||
      findByAliases(table, ["주소", "소재지", "위치"]) ||
      firstRegex(text, [
        /((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{6,80})/,
      ])
  );

  const { areaText, supplyArea, exclusiveArea } = extractArea(text, table, parsed);
  const floor =
    normalize(parsed?.floor) ||
    findByAliases(table, ["층수", "해당층", "층"]) ||
    firstRegex(text, [/(\d+\s*층\s*\/\s*\d+\s*층|\d+\s*층|저층|중층|고층)/]);
  const parking =
    normalize(parsed?.parking) ||
    findByAliases(table, ["주차", "주차가능여부"]) ||
    firstRegex(text, [/(주차\s*(?:가능|불가|무료|유료|[\d,]+대))/]);
  const elevator = normalize(parsed?.elevator) || findByAliases(table, ["엘리베이터", "승강기"]);

  const images = (snapshot?.images || [])
    .filter((image) => !isBadImageCandidate(image))
    .slice(0, 10)
    .map((image, index) => ({
      ...image,
      alt: "",
      category: index === 0 ? "대표 후보" : "매물 사진 후보",
      confidence: image.confidence || 0.6,
    }));

  const description = [
    "네이버 화면에서 가져온 정보를 바탕으로 만든 소개서 초안입니다.",
    priceText ? `가격: ${priceText}` : "",
    address ? `주소: ${address}` : "",
    areaText ? `면적: ${areaText}` : "",
    floor ? `층수: ${floor}` : "",
    parking ? `주차: ${parking}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fieldMapping = {
    title,
    deal_type: dealType,
    address,
    supply_area: cleanNumber(supplyArea),
    exclusive_area: cleanNumber(exclusiveArea),
    floor,
    deposit,
    monthly_rent: monthlyRent,
    elevator: /없음/.test(elevator) ? "무" : elevator ? "유" : "",
    parking_count: cleanNumber(parking),
    description,
  };

  const warnings = [];
  if (!priceText) warnings.push("가격을 읽지 못했습니다. 네이버 매물 상세 패널이 충분히 열려 있는지 확인해 주세요.");
  if (!address) warnings.push("주소를 읽지 못했습니다. 상세 정보 패널에서 주소가 보이는지 먼저 확인해 주세요.");
  if (!areaText && !supplyArea && !exclusiveArea) warnings.push("면적을 읽지 못했습니다. 공급면적이나 전용면적이 보이는 상태에서 다시 가져와 주세요.");
  if (images.length === 0) warnings.push("사진을 찾지 못했습니다. 네이버 사진 탭을 연 상태에서 다시 가져오면 더 잘 잡힙니다.");

  return {
    brochure_title: title,
    summary_points: [address, priceText, areaText, floor].filter(Boolean),
    description,
    field_mapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([, value]) => normalize(value))
    ),
    recommended_images: images,
    warnings,
    source: "extension-local",
  };
}

function makeCoverage(draft) {
  const fields = draft?.field_mapping || {};
  const images = draft?.recommended_images || [];
  return [
    { key: "title", label: "매물명", ok: Boolean(fields.title), value: fields.title },
    {
      key: "price",
      label: "가격",
      ok: Boolean(fields.deposit || fields.monthly_rent),
      value: fields.monthly_rent ? `${fields.deposit}/${fields.monthly_rent}` : fields.deposit,
    },
    { key: "address", label: "주소", ok: Boolean(fields.address), value: fields.address },
    {
      key: "area",
      label: "면적",
      ok: Boolean(fields.supply_area || fields.exclusive_area),
      value: fields.exclusive_area || fields.supply_area,
    },
    { key: "floor", label: "층수", ok: Boolean(fields.floor), value: fields.floor },
    { key: "images", label: "사진", ok: images.length > 0, value: images.length ? `${images.length}장` : "" },
  ];
}

function NaverImportPanel({ initialUrl = "", initialSnapshot = null, onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState("extension");
  const [extensionPathCopied, setExtensionPathCopied] = useState(false);
  const [handledSnapshotKey, setHandledSnapshotKey] = useState("");
  const { isAuthenticated } = useAuth();
  const helpRef = useRef(null);

  const activeDraft = result?.brochure_draft || localDraft;
  const images = activeDraft?.recommended_images || [];
  const coverage = useMemo(() => makeCoverage(activeDraft), [activeDraft]);

  const snapshotStats = useMemo(() => {
    if (!initialSnapshot?.listing_url) return null;
    return {
      pairs: initialSnapshot.pairs?.length || 0,
      images: initialSnapshot.images?.length || 0,
      textLength: (initialSnapshot.focused_text || initialSnapshot.visible_text || "").length,
      parsed: Object.values(initialSnapshot.parsed_fields || {}).filter(Boolean).length,
    };
  }, [initialSnapshot]);

  useEffect(() => {
    if (!initialUrl) return;
    setListingUrl(extractNaverLandUrl(initialUrl));
    setError("");
  }, [initialUrl]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!helpRef.current?.contains(event.target)) {
        setHelpOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!initialSnapshot?.listing_url) return;

    const snapshotKey = [
      initialSnapshot.listing_url,
      initialSnapshot.received_at || "",
      initialSnapshot.focused_text?.length || initialSnapshot.visible_text?.length || 0,
      initialSnapshot.images?.length || 0,
      initialSnapshot.pairs?.length || 0,
    ].join(":");

    if (handledSnapshotKey === snapshotKey) return;

    const fallbackDraft = buildLocalDraftFromSnapshot(initialSnapshot);
    setHandledSnapshotKey(snapshotKey);
    setListingUrl(extractNaverLandUrl(initialSnapshot.listing_url));
    setLocalDraft(fallbackDraft);
    setResult(null);
    setError("");
    setStatus("?꾩옱 ?ㅼ씠踰??붾㈃?먯꽌 ?쎌? 媛믪쓣 ?뺤젣?댁꽌 諛섏쁺?덉뒿?덈떎. ?쒕쾭媛 ?ㅼ떆 湲곸뼱?ㅻ뒗 諛⑹떇? ?먮룞?쇰줈 ??뼱?곗? ?딆뒿?덈떎.");
    onApplyDraft?.(fallbackDraft);
  }, [initialSnapshot, handledSnapshotKey, onApplyDraft]);

  const openNaverLand = () => {
    window.open(NAVER_LAND_URL, "_blank", "noopener,noreferrer");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setListingUrl(extractNaverLandUrl(text));
      setError("");
    } catch {
      setError("釉뚮씪?곗?媛 ?대┰蹂대뱶 ?쎄린瑜?留됱븯?듬땲?? 蹂듭궗??URL??吏곸젒 遺숈뿬?ｌ뼱 二쇱꽭??");
    }
  };

  const handleUrlImport = async () => {
    if (!isAuthenticated) {
      setError("URL 媛?몄삤湲곕뒗 濡쒓렇?????ъ슜?????덉뒿?덈떎.");
      return;
    }

    const normalizedUrl = extractNaverLandUrl(listingUrl);
    if (!normalizedUrl) {
      setError("?ㅼ씠踰?遺?숈궛 留ㅻЪ URL???낅젰?댁＜?몄슂.");
      return;
    }

    if (!normalizedUrl.includes("land.naver.com")) {
      setError("?꾩옱???ㅼ씠踰?遺?숈궛 URL留?媛?몄삱 ???덉뒿?덈떎.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setListingUrl(normalizedUrl);
      const data = await importNaverListing(normalizedUrl);
      setResult(data);
      setLocalDraft(null);
      if (data?.brochure_draft) onApplyDraft?.(data.brochure_draft);
    } catch (err) {
      console.error(err);
      setError(
        `${err.message || "URL 媛?몄삤湲?以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎."} ??諛⑹떇? ?쒕쾭媛 ?ㅼ씠踰꾨? ?ㅼ떆 ?щ뒗 ?덈퉬 湲곕뒫?대씪 ?ㅽ뙣?????덉뒿?덈떎. ?ㅼ씠踰??붾㈃??'?낅Т?대줈 媛?몄삤湲? 踰꾪듉??異붿쿇?⑸땲??`
      );
    } finally {
      setLoading(false);
    }
  };

  const copyExtensionsPath = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions/");
      setExtensionPathCopied(true);
      window.setTimeout(() => setExtensionPathCopied(false), 1800);
    } catch {
      setExtensionPathCopied(false);
    }
  };

  return (
    <section className="panel import-panel">
      <div className="panel-head import-panel-head">
        <div>
          <h3>?ㅼ씠踰?留ㅻЪ ???뚭컻??珥덉븞</h3>
        </div>
        <div className="import-head-actions" ref={helpRef}>
          <button
            type="button"
            className="import-help-trigger"
            onClick={() => {
              setHelpTab("extension");
              setHelpOpen((prev) => !prev);
            }}
            aria-label="네이버 매물 가져오기 안내"
            aria-expanded={helpOpen}
          >
            i
          </button>

          {helpOpen && (
            <div className="import-help-popover">
              <strong>처음 쓰는 분 가이드</strong>
              <div className="import-help-tabs">
                <button
                  type="button"
                  className={`import-help-tab ${helpTab === "extension" ? "active" : ""}`}
                  onClick={() => setHelpTab("extension")}
                >
                  크롬 확장 설정
                </button>
                <button
                  type="button"
                  className={`import-help-tab ${helpTab === "usage" ? "active" : ""}`}
                  onClick={() => setHelpTab("usage")}
                >
                  사용 방법
                </button>
              </div>
              <div className="import-help-body">
                {helpTab === "extension" ? (
                  <>
                    <div className="import-help-actions">
                      <a
                        className="import-help-download"
                        href={EXTENSION_DOWNLOAD_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        확장 ZIP 다운로드
                      </a>
                      <button
                        type="button"
                        className="import-help-copy"
                        onClick={copyExtensionsPath}
                      >
                        {extensionPathCopied ? "주소 복사됨" : "chrome://extensions 복사"}
                      </button>
                    </div>

                    <div className="import-help-section">
                      <span className="import-help-kicker">먼저 알아둘 점</span>
                      <p>
                        웹앱에서는 <code>chrome://extensions</code> 주소를 바로 열지 못할 수 있습니다.
                        그래서 위 버튼으로 주소를 복사한 뒤, 크롬 주소창에 붙여넣는 방식이 가장 안정적입니다.
                      </p>
                    </div>

                    <div className="import-help-section">
                      <span className="import-help-kicker">처음 한 번만</span>
                      <ol className="import-help-list import-help-list-clean">
                        <li>위에서 확장 ZIP을 내려받습니다.</li>
                        <li>내려받은 ZIP 파일의 압축을 풉니다.</li>
                        <li><code>chrome://extensions</code> 주소를 복사해서 크롬 주소창에 붙여넣고 이동합니다.</li>
                        <li>오른쪽 위 개발자 모드를 켭니다.</li>
                        <li>왼쪽 위 압축해제된 확장 프로그램 로드를 누릅니다.</li>
                        <li>압축을 푼 폴더 안에 있는 <code>chrome-extension</code> 폴더를 선택합니다.</li>
                        <li>설치가 끝나면 네이버 부동산 탭을 새로고침합니다.</li>
                      </ol>
                    </div>

                    <div className="import-help-section">
                      <span className="import-help-kicker">설치 후 확인</span>
                      <ul className="import-help-list import-help-bullets">
                        <li>확장 목록에 업무툴 확장이 보여야 합니다.</li>
                        <li>네이버 화면 오른쪽 아래에 업무툴로 가져오기 버튼이 보여야 합니다.</li>
                        <li>버튼이 안 보이면 확장을 새로고침하고 네이버 탭도 다시 새로고침합니다.</li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="import-help-section">
                      <span className="import-help-kicker">사용 순서</span>
                      <ol className="import-help-list import-help-list-clean">
                        <li>네이버 부동산에서 실제 매물 하나를 클릭합니다.</li>
                        <li>가격, 면적, 사진 등 상세 정보가 보이게 둡니다.</li>
                        <li>오른쪽 아래 업무툴로 가져오기 버튼을 누릅니다.</li>
                        <li>우리 앱으로 돌아와 자동으로 채워진 값을 검토한 뒤 저장합니다.</li>
                      </ol>
                    </div>

                    <div className="import-help-section">
                      <span className="import-help-kicker">버튼이 안 보일 때</span>
                      <ul className="import-help-list import-help-bullets">
                        <li>크롬 확장을 아직 설치하지 않았거나 꺼져 있는 경우</li>
                        <li>확장을 설치한 뒤 네이버 탭을 다시 새로고침하지 않은 경우</li>
                        <li>매물 상세 패널이 충분히 열려 있지 않은 경우</li>
                      </ul>
                    </div>

                    <p className="import-help-footnote">
                      가격이나 면적이 비어 있으면 네이버 쪽 상세 패널이 충분히 열려 있는지 먼저 확인해 주세요.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {snapshotStats && (
        <div className="import-debug-box">
          <strong>정제 수집 결과</strong>
          <span>필드 {snapshotStats.parsed}개</span>
          <span>표 후보 {snapshotStats.pairs}개</span>
          <span>이미지 후보 {snapshotStats.images}개</span>
          <span>화면 텍스트 {snapshotStats.textLength.toLocaleString()}자</span>
        </div>
      )}

      {activeDraft && (
        <div className="import-coverage-grid">
          {coverage.map((item) => (
            <div
              key={item.key}
              className={`coverage-item ${item.ok ? "ok" : "missing"}`}
              title={item.value || "鍮꾩뼱 ?덉쓬"}
            >
              <span>{item.label}</span>
              <strong>{item.ok ? "?쎌쓬" : "鍮꾩뼱 ?덉쓬"}</strong>
            </div>
          ))}
        </div>
      )}

      {status && <div className="import-alert success">{status}</div>}

      <details className="url-fallback-box">
        <summary>URL濡?媛?몄삤湲??덈퉬 湲곕뒫</summary>
        <p>
          URL 諛⑹떇? ?쒕쾭媛 ?ㅼ씠踰꾨? ?ㅼ떆 ?댁뼱???댁꽌 timeout???????덉뒿?덈떎. ?ㅼ젣 ?쒕퉬???먮쫫?
          ?ㅼ씠踰??붾㈃???낅Т??踰꾪듉?낅땲??
        </p>
        <div className="import-quick-actions">
          <button type="button" className="secondary-btn" onClick={openNaverLand}>
            ?ㅼ씠踰?遺?숈궛 ?닿린
          </button>
          <button type="button" className="secondary-btn" onClick={pasteFromClipboard}>
            蹂듭궗??URL 遺숈뿬?ｊ린
          </button>
        </div>
        <div className="import-row">
          <input
            className="import-url-input"
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            placeholder="https://new.land.naver.com/..."
          />
          <button
            type="button"
            className="cta-btn import-btn"
            onClick={handleUrlImport}
            disabled={loading}
          >
            {loading ? "불러오는 중..." : "URL로 가져오기"}
          </button>
        </div>
      </details>

      {error && <div className="import-alert danger">{error}</div>}

      {activeDraft && (
        <div className="import-result">
          <div className="import-result-top">
            <div>
              <strong>{activeDraft.brochure_title}</strong>
              <p>{activeDraft.summary_points?.join(" 쨌 ") || "?쎌? 媛믪쓣 諛뷀깢?쇰줈 珥덉븞??留뚮뱾?덉뒿?덈떎."}</p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onApplyDraft?.(activeDraft)}
            >
              ?ㅼ떆 諛섏쁺
            </button>
          </div>

          {activeDraft.warnings?.length > 0 && (
            <div className="import-alert">
              {activeDraft.warnings.slice(0, 4).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="import-image-strip">
              {images.slice(0, 8).map((image, index) => (
                <a
                  key={`${image.url}-${index}`}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="import-image-item"
                >
                  <span>{image.category || `?대?吏 ${index + 1}`}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default NaverImportPanel;



