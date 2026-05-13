import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { savePropertyAndBrochure } from "../services/supabaseRepository";
import { buildBriefing, buildPriceSummary, buildPriceWarning, getPriceStatus, resolveImageSource } from "../utils/brochure";
import { IMAGE_UPLOAD_LIMITS, validateImageFile } from "../utils/imageCompression";

const IMAGE_ACCEPT = IMAGE_UPLOAD_LIMITS.allowedTypes.join(",");

const QUICK_DESC_TAGS = [
  "역세권",
  "채광 우수",
  "즉시 입주 가능",
  "인테리어 우수",
  "주차 가능",
  "엘리베이터 있음",
  "대로변",
  "가시성 우수",
];

const FORM_SECTIONS = [
  ["basic", "기본정보"],
  ["photos", "사진"],
  ["price", "가격/주소"],
  ["details", "특징"],
  ["talking", "상담포인트"],
  ["contact", "소개서문구"],
];

function isImportedImage(image) {
  return Boolean(image?.imported && image?.url);
}

function getImageName(image, index) {
  if (!image) return "";
  if (isImportedImage(image)) return image.name || `가져온 이미지 ${index + 1}`;
  return image.name || `추가 사진 ${index + 1}`;
}

function getImageSizeLabel(image) {
  const size = Number(image?.size || image?.file?.size || 0);
  if (!size) return "";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function validateImageSelection(file) {
  try {
    validateImageFile(file);
    return { valid: true, message: "" };
  } catch (error) {
    return {
      valid: false,
      message: error?.message || "이미지 업로드에 실패했습니다. 파일 형식과 용량을 확인해 주세요.",
    };
  }
}

function createLocalImageItem(file) {
  return {
    file,
    name: file.name || "property-image",
    size: file.size || 0,
    type: file.type || "",
    uploadedAt: new Date().toISOString(),
    preview: typeof URL !== "undefined" ? URL.createObjectURL(file) : "",
  };
}

function PropertyForm({ form, setForm, mainImage, setMainImage, extraImages, setExtraImages, setResult, onCreated }) {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [imageNotice, setImageNotice] = useState("");

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMainImageChange = (files) => {
    const selected = files?.[0] || null;
    if (!selected) {
      setMainImage(null);
      setImageNotice("");
      return;
    }

    const validation = validateImageSelection(selected);
    if (!validation.valid) {
      setImageNotice("이미지 업로드에 실패했습니다. 파일 형식과 용량을 확인해 주세요. " + validation.message);
      return;
    }

    setMainImage(createLocalImageItem(selected));
    setImageNotice("이미지가 업로드되었습니다. 저장하면 소개서와 인쇄 화면에 함께 반영됩니다.");
  };

  const handleExtraImagesChange = (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const availableSlots = Math.max(0, IMAGE_UPLOAD_LIMITS.maxExtraImages - extraImages.length);
    if (availableSlots === 0) {
      setImageNotice("추가사진은 최대 " + IMAGE_UPLOAD_LIMITS.maxExtraImages + "장까지만 등록할 수 있습니다.");
      return;
    }

    const accepted = [];
    const rejected = [];
    selected.forEach((file) => {
      const validation = validateImageSelection(file);
      if (!validation.valid) rejected.push(file.name + ": " + validation.message);
      else if (accepted.length < availableSlots) accepted.push(createLocalImageItem(file));
    });

    if (accepted.length) {
      setExtraImages((prev) => [...prev, ...accepted].slice(0, IMAGE_UPLOAD_LIMITS.maxExtraImages));
    }

    const messages = [];
    if (accepted.length) messages.push("이미지가 업로드되었습니다. 저장하면 소개서와 인쇄 화면에 함께 반영됩니다.");
    if (selected.length > availableSlots) messages.push("남은 " + availableSlots + "장만 추가했습니다.");
    if (rejected.length) messages.push("이미지 업로드에 실패했습니다. 파일 형식과 용량을 확인해 주세요. " + rejected[0]);
    setImageNotice(messages.join(" "));
  };

  const removeMainImage = () => {
    setMainImage(null);
    setImageNotice("대표 이미지를 삭제했습니다.");
  };

  const removeExtraImage = (index) => {
    setExtraImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const moveExtraImageToMain = (index) => {
    setExtraImages((prev) => {
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      if (mainImage) next.unshift(mainImage);
      setMainImage(selected);
      return next.slice(0, 10);
    });
  };

  const appendQuickTag = (tag) => {
    setForm((prev) => {
      const current = String(prev.description || "").trim();
      return { ...prev, description: current ? `${current}, ${tag}` : tag };
    });
  };

  const saveDefaults = () => {
    const defaults = {
      template_type: form.template_type,
      deal_type: form.deal_type,
      price_unit: form.price_unit,
      supply_area_unit: form.supply_area_unit,
      exclusive_area_unit: form.exclusive_area_unit,
    };
    localStorage.setItem("briefing_default_settings", JSON.stringify(defaults));
    alert("기본 설정을 저장했습니다.");
  };

  const resetDefaults = () => {
    localStorage.removeItem("briefing_default_settings");
    alert("저장된 기본 설정을 삭제했습니다.");
  };

  const priceStatus = useMemo(() => getPriceStatus(form), [form]);
  const pricePreview = useMemo(() => buildPriceSummary({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const priceWarning = useMemo(() => buildPriceWarning({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const briefing = useMemo(() => buildBriefing({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const requiredStatus = useMemo(() => {
    const items = [
      { key: "title", label: "매물명", complete: Boolean(String(form.title || "").trim()) },
      { key: "deal", label: "거래유형", complete: Boolean(String(form.deal_type || "").trim()) },
      { key: "price", label: "금액", complete: priceStatus !== "missing" },
      { key: "address", label: "주소", complete: Boolean(String(form.address || "").trim()) },
      { key: "image", label: "사진", complete: Boolean(mainImage || extraImages.length > 0) },
      { key: "summary", label: "소개문구", complete: Boolean(String(form.description || form.recommended_use || "").trim()) },
    ];
    const missing = items.filter((item) => !item.complete).map((item) => item.label);
    return {
      total: items.length,
      complete: items.length - missing.length,
      missing,
      imageCount: (mainImage ? 1 : 0) + extraImages.length,
    };
  }, [extraImages.length, form.address, form.deal_type, form.description, form.recommended_use, form.title, mainImage, priceStatus]);

  const scrollToSection = (sectionId) => {
    document.getElementById(`briefing-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      alert("소개서를 저장하려면 먼저 로그인해 주세요.");
      return;
    }

    try {
      setLoading(true);
      if (mainImage || extraImages.length) {
        setImageNotice("이미지를 저장하는 중입니다...");
      }
      const payload = { ...form, price_status: priceStatus };
      const saved = await savePropertyAndBrochure({ form: payload, mainImage, extraImages, briefing });
      setResult({
        success: true,
        message: "소개서가 저장되었습니다.",
        ...saved,
        briefing,
        main_image_url: saved.main_image_url || "",
        extra_image_urls: saved.extra_image_urls || [],
        brochure_url: saved.brochure_url || "",
      });
      setMainImage(saved.main_image_url ? { url: saved.main_image_url, name: "대표 이미지", persisted: true } : null);
      setExtraImages((saved.extra_image_urls || []).map((url, index) => ({ url, name: `추가 이미지 ${index + 1}`, persisted: true })));
      if (saved.main_image_url || saved.extra_image_urls?.length) {
        setImageNotice("이미지가 업로드되었습니다.");
      }
      onCreated?.();
    } catch (error) {
      if (/storage|bucket|image|이미지|파일|mime/i.test(error?.message || "")) {
        setImageNotice("이미지 업로드에 실패했습니다. 파일 형식과 용량을 확인해 주세요.");
      }
      alert(error.message || "소개서 저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-card property-form-card compact-form-card">
      <div className="panel-head">
        <h3>매물 정보 입력</h3>
        <p>고객에게 전달할 사무실 / 상가 정보를 빠르게 정리합니다.</p>
      </div>

      <form className="profile-form property-form-density briefing-flow-form" onSubmit={handleSubmit}>
        <nav className="briefing-section-nav" aria-label="소개서 입력 섹션 바로가기">
          {FORM_SECTIONS.map(([id, label]) => (
            <button type="button" key={id} onClick={() => scrollToSection(id)}>
              {label}
            </button>
          ))}
        </nav>

        <section id="briefing-section-basic" className="briefing-form-section briefing-flow-section">
          <div className="briefing-section-head">
            <div>
              <strong>기본 정보</strong>
              <p>소개서 형식과 거래유형을 먼저 정합니다.</p>
            </div>
            <span>{form.template_type === "detail" ? "상세형" : "1페이지형"} · {form.deal_type || "거래유형 선택"}</span>
          </div>
          <div className="briefing-section-body">
            <label className="field wide-field"><span>매물명</span><input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="예: 역삼역 도보 5분 소형 사무실" /></label>
            <div className="field-grid">
              <label className="field">
                <span>소개서 템플릿</span>
                <select value={form.template_type} onChange={(event) => updateField("template_type", event.target.value)}>
                  <option value="1page">1페이지형</option>
                  <option value="detail">상세형</option>
                </select>
              </label>
              <label className="field">
                <span>거래 유형</span>
                <select value={form.deal_type} onChange={(event) => updateField("deal_type", event.target.value)}>
                  <option value="월세">월세</option>
                  <option value="전세">전세</option>
                  <option value="매매">매매</option>
                </select>
              </label>
            </div>
            <div className="compact-action-grid">
              <button type="button" className="secondary-btn" onClick={saveDefaults}>기본 설정 저장</button>
              <button type="button" className="secondary-btn" onClick={resetDefaults}>기본 설정 삭제</button>
            </div>
          </div>
        </section>

        <section id="briefing-section-photos" className="briefing-form-section briefing-flow-section">
          <div className="briefing-section-head">
            <div>
              <strong>사진</strong>
              <p>이미지를 업로드하면 소개서와 출력 화면에 함께 반영됩니다.</p>
            </div>
            <span>대표 {mainImage ? "1장" : "없음"} / 추가 {extraImages.length}장</span>
          </div>
          <div className="briefing-section-body">
            <div className="upload-grid">
              <label className="upload-box">
                <input type="file" accept={IMAGE_ACCEPT} onChange={(event) => {
                  handleMainImageChange(event.target.files);
                  event.target.value = "";
                }} />
                <span><strong className="upload-title">대표사진</strong><small>소개서 상단에 표시됩니다.</small></span>
                <em className="upload-meta">{mainImage ? getImageName(mainImage, 0) : "이미지 선택"}</em>
              </label>
              <label className="upload-box">
                <input type="file" accept={IMAGE_ACCEPT} multiple onChange={(event) => {
                  handleExtraImagesChange(event.target.files);
                  event.target.value = "";
                }} />
                <span><strong className="upload-title">추가사진</strong><small>최대 10장까지 정리합니다.</small></span>
                <em className="upload-meta">현재 {extraImages.length}장</em>
              </label>
            </div>
            <p className="image-upload-note">jpg, jpeg, png, webp 형식만 가능하며 1장당 최대 5MB입니다.</p>
            {imageNotice && <div className="warning-strip image-notice">{imageNotice}</div>}
            {(mainImage || extraImages.length > 0) ? (
              <div className="extra-image-list brochure-image-list">
                {mainImage && (
                  <div className="extra-image-row brochure-image-row is-main">
                    <div className="brochure-image-summary">
                      {resolveImageSource(mainImage) ? <img src={resolveImageSource(mainImage)} alt={getImageName(mainImage, 0)} /> : <span className="image-placeholder-mini">이미지</span>}
                      <span>
                        <strong>{getImageName(mainImage, 0)}</strong>
                        <small>{getImageSizeLabel(mainImage) || "저장된 이미지"}</small>
                      </span>
                      <em>대표 이미지</em>
                    </div>
                    <div>
                      <button type="button" className="danger-btn mini-btn" onClick={removeMainImage}>삭제</button>
                    </div>
                  </div>
                )}
                {extraImages.map((image, index) => (
                  <div className="extra-image-row brochure-image-row" key={`${getImageName(image, index)}-${index}`}>
                    <div className="brochure-image-summary">
                      {resolveImageSource(image) ? <img src={resolveImageSource(image)} alt={getImageName(image, index)} /> : <span className="image-placeholder-mini">이미지</span>}
                      <span>
                        <strong>{getImageName(image, index)}</strong>
                        <small>{getImageSizeLabel(image) || "저장된 이미지"}</small>
                      </span>
                    </div>
                    <div>
                      <button type="button" className="secondary-btn mini-btn" onClick={() => moveExtraImageToMain(index)}>대표로 지정</button>
                      <button type="button" className="danger-btn mini-btn" onClick={() => removeExtraImage(index)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="brochure-image-placeholder">
                <strong>이미지 없음</strong>
                <span>대표 이미지를 선택하면 미리보기와 PDF에 함께 반영됩니다.</span>
              </div>
            )}
          </div>
        </section>

        <section id="briefing-section-price" className="briefing-form-section briefing-flow-section">
          <div className="briefing-section-head">
            <div>
              <strong>가격 / 주소</strong>
              <p>고객에게 안내할 금액과 위치 정보를 입력합니다.</p>
            </div>
            <span>{pricePreview || "가격 미입력"} · {form.address || "주소 미입력"}</span>
          </div>
          <div className="briefing-section-body">
            <div className="field-grid">
              <label className="field"><span>금액 단위</span><select value={form.price_unit} onChange={(event) => updateField("price_unit", event.target.value)}><option value="만원">만원</option><option value="억원">억원</option></select></label>
              <label className="field"><span>가격 자동 문구 미리보기</span><input value={pricePreview} readOnly /></label>
            </div>
            {priceWarning && <div className="warning-strip">{priceWarning}</div>}
            <div className="field-grid four-col-fields">
              <label className="field"><span>보증금</span><input value={form.deposit} onChange={(event) => updateField("deposit", event.target.value)} placeholder="예: 1500" /></label>
              <label className="field"><span>월차임</span><input value={form.monthly_rent} onChange={(event) => updateField("monthly_rent", event.target.value)} placeholder="예: 100" /></label>
              <label className="field"><span>관리비</span><input value={form.maintenance_fee} onChange={(event) => updateField("maintenance_fee", event.target.value)} placeholder="예: 10" /></label>
              <label className="field"><span>권리금</span><input value={form.premium} onChange={(event) => updateField("premium", event.target.value)} placeholder="예: 협의" /></label>
            </div>
            <label className="field wide-field"><span>주소</span><input value={form.address} onChange={(event) => updateField("address", event.target.value)} placeholder="예: 서울시 강남구 역삼동 ..." /></label>
          </div>
        </section>

        <section id="briefing-section-details" className="briefing-form-section briefing-flow-section">
          <div className="briefing-section-head">
            <div>
              <strong>매물 특징</strong>
              <p>면적, 층수, 주차, 입주 가능일을 정리합니다.</p>
            </div>
            <span>{[form.exclusive_area && `전용 ${form.exclusive_area}${form.exclusive_area_unit}`, form.elevator && `엘리베이터 ${form.elevator}`, form.parking_count && `주차 ${form.parking_count}`].filter(Boolean).join(" · ") || "면적 / 층수 / 주차 입력"}</span>
          </div>
          <div className="briefing-section-body">
            <div className="field-grid area-grid">
              <label className="field"><span>공급면적</span><input value={form.supply_area} onChange={(event) => updateField("supply_area", event.target.value)} placeholder="예: 52.9" /></label>
              <label className="field small-select-field"><span>단위</span><select value={form.supply_area_unit} onChange={(event) => updateField("supply_area_unit", event.target.value)}><option value="㎡">㎡</option><option value="평">평</option></select></label>
              <label className="field"><span>전용면적</span><input value={form.exclusive_area} onChange={(event) => updateField("exclusive_area", event.target.value)} placeholder="예: 39.7" /></label>
              <label className="field small-select-field"><span>단위</span><select value={form.exclusive_area_unit} onChange={(event) => updateField("exclusive_area_unit", event.target.value)}><option value="㎡">㎡</option><option value="평">평</option></select></label>
            </div>
            <div className="field-grid">
              <label className="field"><span>층수</span><input value={form.floor} onChange={(event) => updateField("floor", event.target.value)} placeholder="예: 3층/10층" /></label>
              <label className="field"><span>엘리베이터</span><select value={form.elevator} onChange={(event) => updateField("elevator", event.target.value)}><option value="">선택</option><option value="있음">있음</option><option value="없음">없음</option></select></label>
              <label className="field"><span>화장실 위치 / 형태</span><input value={form.restroom_detail} onChange={(event) => updateField("restroom_detail", event.target.value)} placeholder="예: 내부 남녀분리 / 공용" /></label>
              <label className="field"><span>주차 가능 대수 / 조건</span><input value={form.parking_count} onChange={(event) => updateField("parking_count", event.target.value)} placeholder="예: 1대 가능 / 협의" /></label>
              <label className="field"><span>냉난방</span><input value={form.hvac} onChange={(event) => updateField("hvac", event.target.value)} placeholder="예: 개별냉난방" /></label>
              <label className="field"><span>입주 가능일</span><input value={form.move_in_date} onChange={(event) => updateField("move_in_date", event.target.value)} placeholder="예: 즉시입주 / 협의 가능" /></label>
              <label className="field"><span>간판 가능 여부</span><select value={form.sign_allowed} onChange={(event) => updateField("sign_allowed", event.target.value)}><option value="">선택</option><option value="가능">가능</option><option value="협의">협의</option><option value="불가">불가</option></select></label>
              <label className="field"><span>관리비 포함 항목</span><input value={form.admin_fee_includes} onChange={(event) => updateField("admin_fee_includes", event.target.value)} placeholder="예: 전기, 수도 별도 / 인터넷 포함" /></label>
            </div>
          </div>
        </section>

        <section id="briefing-section-talking" className="briefing-form-section briefing-flow-section">
          <div className="briefing-section-head">
            <div>
              <strong>상담 포인트</strong>
              <p>고객에게 강조할 업종, 장점, 확인사항을 적습니다.</p>
            </div>
            <span>{form.recommended_use || form.description || "추천 업종과 설명 입력"}</span>
          </div>
          <div className="briefing-section-body">
            <div className="field-grid">
              <label className="field"><span>추천 업종</span><input value={form.recommended_use} onChange={(event) => updateField("recommended_use", event.target.value)} placeholder="예: 소형 사무실 / 예약제 업종" /></label>
              <label className="field"><span>특이사항 / 확인 필요</span><input value={form.special_notes} onChange={(event) => updateField("special_notes", event.target.value)} placeholder="예: 권리금 협의 / 업종 제한 확인 필요" /></label>
            </div>
            <label className="field wide-field"><span>상세 설명</span><textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="매물 특징, 입지, 내부 상태, 추천 포인트를 적어주세요." /></label>
            <div className="tag-row compact-tags">{QUICK_DESC_TAGS.map((tag) => <button type="button" key={tag} onClick={() => appendQuickTag(tag)}>{tag}</button>)}</div>
          </div>
        </section>

        <section id="briefing-section-contact" className="briefing-form-section briefing-flow-section">
          <div className="briefing-section-head">
            <div>
              <strong>소개서 문구 / 담당자</strong>
              <p>소개서 하단 연락처와 고객 안내 문구에 반영됩니다.</p>
            </div>
            <span>{[form.contact_name, form.contact_phone].filter(Boolean).join(" · ") || "담당자명 / 연락처"}</span>
          </div>
          <div className="briefing-section-body">
            <div className="field-grid">
              <label className="field"><span>담당자명</span><input value={form.contact_name} onChange={(event) => updateField("contact_name", event.target.value)} placeholder="예: 김중개" /></label>
              <label className="field"><span>연락처</span><input value={form.contact_phone} onChange={(event) => updateField("contact_phone", event.target.value)} placeholder="예: 010-1234-5678" /></label>
            </div>
            <p className="form-helper-text">부동산 이름과 이메일은 내 정보 관리 값이 소개서 하단에 자동 표기됩니다.</p>
          </div>
        </section>

        <div className="briefing-sticky-actions">
          <div className="briefing-action-status">
            <strong>필수 정보 {requiredStatus.complete}/{requiredStatus.total} 입력됨</strong>
            <span>{requiredStatus.missing.length ? requiredStatus.missing.slice(0, 3).map((item) => `${item} 필요`).join(" · ") : "소개서 생성 가능"}</span>
          </div>
          <button type="button" className="secondary-btn" onClick={() => document.querySelector(".preview-card-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" })}>미리보기 확인</button>
          <button type="submit" className="primary-btn" disabled={loading}>{loading ? "저장 중..." : "소개서 생성"}</button>
        </div>
      </form>
    </section>
  );
}

export default PropertyForm;
