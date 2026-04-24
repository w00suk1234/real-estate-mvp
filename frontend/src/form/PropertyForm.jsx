import { useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import {
  buildPriceSummary,
  buildPriceWarning,
  buildBriefing,
  getPriceStatus,
  hasValue,
} from "../utils/brochure";

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

function isImportedImage(image) {
  return Boolean(image?.imported && image?.url);
}

function imageName(image, idx) {
  return image?.name || image?.url || `image-${idx + 1}`;
}

function PropertyForm({
  form,
  setForm,
  mainImage,
  setMainImage,
  extraImages,
  setExtraImages,
  setResult,
  onCreated,
}) {
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExtraImagesChange = (files) => {
    const selected = Array.from(files || []).slice(0, 10);
    setExtraImages((prev) => [...prev, ...selected].slice(0, 10));
  };

  const removeExtraImage = (idx) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveExtraImageToMain = (idx) => {
    if (!extraImages[idx]) return;
    const nextMain = extraImages[idx];
    const nextExtras = extraImages.filter((_, i) => i !== idx);
    if (mainImage) nextExtras.unshift(mainImage);
    setMainImage(nextMain);
    setExtraImages(nextExtras.slice(0, 10));
  };

  const appendQuickTag = (tag) => {
    setForm((prev) => {
      const current = String(prev.description || "").trim();
      return { ...prev, description: current ? `${current}, ${tag}` : tag };
    });
  };

  const saveDefaults = () => {
    const payload = {
      deal_type: form.deal_type,
      template_type: form.template_type,
      price_unit: form.price_unit,
      supply_area_unit: form.supply_area_unit,
      exclusive_area_unit: form.exclusive_area_unit,
      elevator: form.elevator,
      parking_type: form.parking_type,
      hvac: form.hvac,
      sign_allowed: form.sign_allowed,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
    };

    localStorage.setItem("briefing_default_settings", JSON.stringify(payload));
    alert("기본 설정을 저장했습니다.");
  };

  const resetDefaults = () => {
    localStorage.removeItem("briefing_default_settings");
    alert("저장한 기본 설정을 삭제했습니다.");
  };

  const priceStatus = useMemo(() => getPriceStatus(form), [form]);
  const pricePreview = useMemo(() => buildPriceSummary({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const priceWarning = useMemo(() => buildPriceWarning({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const briefing = useMemo(() => buildBriefing(form), [form]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAuthenticated) {
      alert("소개서를 저장하려면 로그인 또는 회원가입이 필요합니다.");
      return;
    }

    if (!mainImage) {
      alert("대표 사진을 먼저 선택해 주세요.");
      return;
    }

    const formData = new FormData();
    const payload = { ...form, price_status: priceStatus };

    Object.entries(payload).forEach(([key, value]) => {
      formData.append(key, value ?? "");
    });

    if (isImportedImage(mainImage)) {
      formData.append("main_image_url", mainImage.url);
    } else {
      formData.append("main_image", mainImage);
    }

    extraImages.forEach((image) => {
      if (!isImportedImage(image)) {
        formData.append("extra_images", image);
      }
    });

    const importedExtraUrls = extraImages.filter(isImportedImage).map((image) => image.url);
    if (importedExtraUrls.length > 0) {
      formData.append("extra_image_urls", JSON.stringify(importedExtraUrls));
    }

    try {
      setLoading(true);
      const data = await apiFetch("/brochure/create", {
        method: "POST",
        body: formData,
      });

      if (!data.success) {
        alert(data.message || "소개서 생성에 실패했습니다.");
        return;
      }

      setResult({
        ...data,
        briefing,
      });
      onCreated?.();
    } catch (error) {
      console.error(error);
      alert(error.message || "소개서 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>매물 정보 입력</h3>
        <p>사무실과 상가 중개에 필요한 핵심 정보를 정리한 뒤 고객용 소개서로 저장합니다.</p>
      </div>

      <form className="form-box" onSubmit={handleSubmit}>
        <div className="field-grid two">
          <div className="field">
            <label>소개서 템플릿</label>
            <select value={form.template_type} onChange={(event) => updateField("template_type", event.target.value)}>
              <option value="1page">1페이지형</option>
              <option value="2page">2페이지형</option>
            </select>
          </div>

          <div className="field">
            <label>거래 유형</label>
            <select value={form.deal_type} onChange={(event) => updateField("deal_type", event.target.value)}>
              <option value="월세">월세</option>
              <option value="전세">전세</option>
              <option value="매매">매매</option>
            </select>
          </div>
        </div>

        <div className="field-grid two">
          <button type="button" className="secondary-btn" onClick={saveDefaults}>
            기본 설정 저장
          </button>
          <button type="button" className="secondary-btn" onClick={resetDefaults}>
            기본 설정 삭제
          </button>
        </div>

        <div className="field">
          <label>대표 사진</label>
          <input type="file" accept="image/*" onChange={(event) => setMainImage(event.target.files?.[0] || null)} />
        </div>

        <div className="field">
          <label>추가 사진 (최대 10장)</label>
          <input type="file" accept="image/*" multiple onChange={(event) => handleExtraImagesChange(event.target.files)} />
          <small className="helper-text">현재 선택: {extraImages.length}장</small>
        </div>

        {extraImages.length > 0 && (
          <div className="extra-manage-box">
            {extraImages.map((image, idx) => (
              <div className="extra-manage-item" key={`${imageName(image, idx)}-${idx}`}>
                <span className="extra-manage-name">{imageName(image, idx)}</span>
                <div className="extra-manage-actions">
                  <button type="button" className="secondary-btn small-btn" onClick={() => moveExtraImageToMain(idx)}>
                    대표로 지정
                  </button>
                  <button type="button" className="danger-btn small-btn" onClick={() => removeExtraImage(idx)}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label>매물명</label>
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="예: 역삼역 도보 5분 중소형 사무실"
            required
          />
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>금액 단위</label>
            <select value={form.price_unit} onChange={(event) => updateField("price_unit", event.target.value)}>
              <option value="만원">만원</option>
              <option value="원">원</option>
            </select>
          </div>

          <div className="field">
            <label>가격 요약 미리보기</label>
            <input value={pricePreview} readOnly />
          </div>
        </div>

        {priceWarning && <div className="import-alert">{priceWarning}</div>}

        <div className={`field-grid ${form.deal_type === "월세" ? "four" : "three"}`}>
          <div className="field">
            <label>보증금</label>
            <input value={form.deposit} onChange={(event) => updateField("deposit", event.target.value)} placeholder="예: 1500" />
          </div>

          {form.deal_type === "월세" && (
            <div className="field">
              <label>월차임</label>
              <input value={form.monthly_rent} onChange={(event) => updateField("monthly_rent", event.target.value)} placeholder="예: 100" />
            </div>
          )}

          <div className="field">
            <label>관리비</label>
            <input value={form.maintenance_fee} onChange={(event) => updateField("maintenance_fee", event.target.value)} placeholder="예: 10" />
          </div>

          <div className="field">
            <label>권리금</label>
            <input value={form.premium} onChange={(event) => updateField("premium", event.target.value)} placeholder="예: 3000 또는 협의" />
          </div>
        </div>

        <div className="field">
          <label>주소</label>
          <input
            value={form.address}
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="예: 서울시 강남구 역삼동 ..."
            required
          />
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>공급면적</label>
            <div className="inline-field">
              <input value={form.supply_area} onChange={(event) => updateField("supply_area", event.target.value)} placeholder="예: 52.9" />
              <select value={form.supply_area_unit} onChange={(event) => updateField("supply_area_unit", event.target.value)}>
                <option value="㎡">㎡</option>
                <option value="평">평</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>전용면적</label>
            <div className="inline-field">
              <input value={form.exclusive_area} onChange={(event) => updateField("exclusive_area", event.target.value)} placeholder="예: 39.7" />
              <select value={form.exclusive_area_unit} onChange={(event) => updateField("exclusive_area_unit", event.target.value)}>
                <option value="㎡">㎡</option>
                <option value="평">평</option>
              </select>
            </div>
          </div>
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>층수</label>
            <input value={form.floor} onChange={(event) => updateField("floor", event.target.value)} placeholder="예: 2/5층 또는 7층" />
          </div>

          <div className="field">
            <label>엘리베이터</label>
            <select value={form.elevator} onChange={(event) => updateField("elevator", event.target.value)}>
              <option value="">선택</option>
              <option value="유">유</option>
              <option value="무">무</option>
            </select>
          </div>
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>추천 업종</label>
            <input
              value={form.recommended_industry}
              onChange={(event) => updateField("recommended_industry", event.target.value)}
              placeholder="예: 소형 사무실, 예약제 업종, 상담형 업종"
            />
          </div>

          <div className="field">
            <label>입주 가능일</label>
            <input value={form.available_from} onChange={(event) => updateField("available_from", event.target.value)} placeholder="예: 즉시입주, 협의" />
          </div>
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>화장실 위치/형태</label>
            <input
              value={form.restroom_detail}
              onChange={(event) => updateField("restroom_detail", event.target.value)}
              placeholder="예: 층별 공용, 내부 남녀분리, 외부 공용"
            />
          </div>

          <div className="field">
            <label>냉난방</label>
            <input value={form.hvac} onChange={(event) => updateField("hvac", event.target.value)} placeholder="예: 개별냉난방, 중앙냉난방" />
          </div>
        </div>

        <div className="field-grid three">
          <div className="field">
            <label>주차 가능 대수</label>
            <input value={form.parking_count} onChange={(event) => updateField("parking_count", event.target.value)} placeholder="예: 1, 3, 5대" />
          </div>

          <div className="field">
            <label>주차 요금</label>
            <select value={form.parking_type} onChange={(event) => updateField("parking_type", event.target.value)}>
              <option value="무료">무료</option>
              <option value="유료">유료</option>
              <option value="협의">협의</option>
            </select>
          </div>

          <div className="field">
            <label>간판 가능 여부</label>
            <select value={form.sign_allowed} onChange={(event) => updateField("sign_allowed", event.target.value)}>
              <option value="">선택</option>
              <option value="가능">가능</option>
              <option value="협의 가능">협의 가능</option>
              <option value="불가">불가</option>
            </select>
          </div>
        </div>

        {form.parking_type === "유료" && (
          <div className="field">
            <label>주차비</label>
            <input value={form.parking_fee} onChange={(event) => updateField("parking_fee", event.target.value)} placeholder="예: 10" />
          </div>
        )}

        <div className="field-grid two">
          <div className="field">
            <label>관리비 포함 항목</label>
            <input
              value={form.maintenance_includes}
              onChange={(event) => updateField("maintenance_includes", event.target.value)}
              placeholder="예: 전기 제외, 수도 포함, 청소비 포함"
            />
          </div>

          <div className="field">
            <label>특이사항 / 확인 필요 사항</label>
            <input
              value={form.caution_notes}
              onChange={(event) => updateField("caution_notes", event.target.value)}
              placeholder="예: 업종 제한 확인 필요, 권리금 협의"
            />
          </div>
        </div>

        <div className="field">
          <label>상세 설명</label>
          <textarea
            rows="5"
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="예: 역삼역 도보권, 채광 우수, 내부 인테리어 깔끔, 상담형 업종 추천"
            required
          />
        </div>

        <div className="quick-tags">
          {QUICK_DESC_TAGS.map((tag) => (
            <button key={tag} type="button" className="quick-tag-btn" onClick={() => appendQuickTag(tag)}>
              {tag}
            </button>
          ))}
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>담당자명</label>
            <input value={form.contact_name} onChange={(event) => updateField("contact_name", event.target.value)} placeholder="예: 김우석" />
          </div>

          <div className="field">
            <label>연락처</label>
            <input value={form.contact_phone} onChange={(event) => updateField("contact_phone", event.target.value)} placeholder="예: 010-1234-5678" />
          </div>
        </div>

        <div className="briefing-note-box">
          <strong>브리핑 자동 구성 미리보기</strong>
          <p>{briefing.oneLineSummary}</p>
          {briefing.strengths.length > 0 && (
            <div className="mini-badges">
              {briefing.strengths.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
        </div>

        <button className="cta-btn" type="submit" disabled={loading}>
          {loading ? "소개서 생성 중..." : "소개서 생성"}
        </button>
      </form>
    </section>
  );
}

export default PropertyForm;

