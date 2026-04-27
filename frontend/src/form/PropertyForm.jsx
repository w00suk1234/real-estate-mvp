import { useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import { buildBriefing, buildPriceSummary, buildPriceWarning, getPriceStatus } from "../utils/brochure";

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

function getImageName(image, index) {
  if (isImportedImage(image)) return image.name || `가져온 이미지 ${index + 1}`;
  return image?.name || `추가 사진 ${index + 1}`;
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
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExtraImagesChange = (files) => {
    const selected = Array.from(files || []).slice(0, 10);
    setExtraImages((prev) => [...prev, ...selected].slice(0, 10));
  };

  const removeExtraImage = (index) => {
    setExtraImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveExtraImageToMain = (index) => {
    if (!extraImages[index]) return;
    const nextMain = extraImages[index];
    const nextExtras = extraImages.filter((_, idx) => idx !== index);
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
      office_name: form.office_name,
      contact_email: form.contact_email,
    };
    localStorage.setItem("briefing_default_settings", JSON.stringify(payload));
    alert("기본 설정을 저장했습니다.");
  };

  const resetDefaults = () => {
    localStorage.removeItem("briefing_default_settings");
    alert("저장된 기본 설정을 삭제했습니다.");
  };

  const priceStatus = useMemo(() => getPriceStatus(form), [form]);
  const pricePreview = useMemo(() => buildPriceSummary({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const priceWarning = useMemo(() => buildPriceWarning({ ...form, price_status: priceStatus }), [form, priceStatus]);
  const briefing = useMemo(() => buildBriefing(form), [form]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAuthenticated) {
      alert("소개서를 저장하려면 먼저 로그인해 주세요.");
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
      alert(error.message || "소개서 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-card">
      <div className="panel-head">
        <h3>매물 정보 입력</h3>
        <p>사무실 / 상가 소개서에 필요한 핵심 정보를 정리하고, 고객용 브리핑 형태로 저장합니다.</p>
      </div>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="field-grid two">
          <label className="field">
            <span>소개서 템플릿</span>
            <select value={form.template_type} onChange={(event) => updateField("template_type", event.target.value)}>
              <option value="1page">1페이지형</option>
              <option value="2page">2페이지형</option>
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

        <div className="field-grid two">
          <button type="button" className="secondary-btn" onClick={saveDefaults}>
            기본 설정 저장
          </button>
          <button type="button" className="secondary-btn" onClick={resetDefaults}>
            기본 설정 삭제
          </button>
        </div>

        <label className="field">
          <span>대표 사진</span>
          <input type="file" accept="image/*" onChange={(event) => setMainImage(event.target.files?.[0] || null)} />
        </label>

        <label className="field">
          <span>추가 사진 (최대 10장)</span>
          <input type="file" accept="image/*" multiple onChange={(event) => handleExtraImagesChange(event.target.files)} />
          <small className="helper-text">현재 선택: {extraImages.length}장</small>
        </label>

        {extraImages.length > 0 ? (
          <div className="extra-manage-box">
            {extraImages.map((image, index) => (
              <div className="extra-manage-item" key={`${getImageName(image, index)}-${index}`}>
                <span className="extra-manage-name">{getImageName(image, index)}</span>
                <div className="extra-manage-actions">
                  <button type="button" className="secondary-btn small-btn" onClick={() => moveExtraImageToMain(index)}>
                    대표로 지정
                  </button>
                  <button type="button" className="danger-btn small-btn" onClick={() => removeExtraImage(index)}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <label className="field">
          <span>매물명</span>
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="예: 역삼역 도보 5분 중소형 사무실"
            required
          />
        </label>

        <div className="field-grid two">
          <label className="field">
            <span>금액 단위</span>
            <select value={form.price_unit} onChange={(event) => updateField("price_unit", event.target.value)}>
              <option value="만원">만원</option>
              <option value="원">원</option>
            </select>
          </label>

          <label className="field">
            <span>가격 자동 문구 미리보기</span>
            <input value={pricePreview} readOnly />
          </label>
        </div>

        {priceWarning ? <div className="import-alert">{priceWarning}</div> : null}

        <div className={`field-grid ${form.deal_type === "월세" ? "four" : "three"}`}>
          <label className="field">
            <span>보증금</span>
            <input value={form.deposit} onChange={(event) => updateField("deposit", event.target.value)} placeholder="예: 1500" />
          </label>

          {form.deal_type === "월세" ? (
            <label className="field">
              <span>월차임</span>
              <input
                value={form.monthly_rent}
                onChange={(event) => updateField("monthly_rent", event.target.value)}
                placeholder="예: 100"
              />
            </label>
          ) : null}

          <label className="field">
            <span>관리비</span>
            <input
              value={form.maintenance_fee}
              onChange={(event) => updateField("maintenance_fee", event.target.value)}
              placeholder="예: 10"
            />
          </label>

          <label className="field">
            <span>권리금</span>
            <input value={form.premium} onChange={(event) => updateField("premium", event.target.value)} placeholder="예: 협의" />
          </label>
        </div>

        <label className="field">
          <span>주소</span>
          <input
            value={form.address}
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="예: 서울시 강남구 역삼동 ..."
            required
          />
        </label>

        <div className="field-grid two">
          <label className="field">
            <span>공급면적</span>
            <div className="inline-field">
              <input value={form.supply_area} onChange={(event) => updateField("supply_area", event.target.value)} placeholder="예: 52.9" />
              <select value={form.supply_area_unit} onChange={(event) => updateField("supply_area_unit", event.target.value)}>
                <option value="㎡">㎡</option>
                <option value="평">평</option>
              </select>
            </div>
          </label>

          <label className="field">
            <span>전용면적</span>
            <div className="inline-field">
              <input
                value={form.exclusive_area}
                onChange={(event) => updateField("exclusive_area", event.target.value)}
                placeholder="예: 39.7"
              />
              <select value={form.exclusive_area_unit} onChange={(event) => updateField("exclusive_area_unit", event.target.value)}>
                <option value="㎡">㎡</option>
                <option value="평">평</option>
              </select>
            </div>
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>층수</span>
            <input value={form.floor} onChange={(event) => updateField("floor", event.target.value)} placeholder="예: 3층 / 2/5층" />
          </label>

          <label className="field">
            <span>엘리베이터</span>
            <select value={form.elevator} onChange={(event) => updateField("elevator", event.target.value)}>
              <option value="">선택</option>
              <option value="있음">있음</option>
              <option value="없음">없음</option>
            </select>
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>화장실 위치 / 형태</span>
            <input
              value={form.restroom_detail}
              onChange={(event) => updateField("restroom_detail", event.target.value)}
              placeholder="예: 내부 남녀분리 / 공용"
            />
          </label>

          <label className="field">
            <span>주차 가능 대수 / 조건</span>
            <input
              value={form.parking_count}
              onChange={(event) => updateField("parking_count", event.target.value)}
              placeholder="예: 1대 가능 / 협의"
            />
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>냉난방</span>
            <input value={form.hvac} onChange={(event) => updateField("hvac", event.target.value)} placeholder="예: 개별냉난방" />
          </label>

          <label className="field">
            <span>간판 가능 여부</span>
            <select value={form.sign_allowed} onChange={(event) => updateField("sign_allowed", event.target.value)}>
              <option value="">선택</option>
              <option value="가능">가능</option>
              <option value="불가">불가</option>
              <option value="협의">협의</option>
            </select>
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>입주 가능일</span>
            <input
              value={form.move_in_date}
              onChange={(event) => updateField("move_in_date", event.target.value)}
              placeholder="예: 즉시입주 / 협의 가능"
            />
          </label>

          <label className="field">
            <span>관리비 포함 항목</span>
            <input
              value={form.admin_fee_includes}
              onChange={(event) => updateField("admin_fee_includes", event.target.value)}
              placeholder="예: 전기, 수도 별도 / 인터넷 포함"
            />
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>추천 업종</span>
            <input
              value={form.recommended_use}
              onChange={(event) => updateField("recommended_use", event.target.value)}
              placeholder="예: 소형 사무실 / 예약제 업종"
            />
          </label>

          <label className="field">
            <span>특이사항 / 확인 필요</span>
            <input
              value={form.special_notes}
              onChange={(event) => updateField("special_notes", event.target.value)}
              placeholder="예: 권리금 협의 / 업종 제한 확인 필요"
            />
          </label>
        </div>

        <label className="field">
          <span>상세 설명</span>
          <textarea
            rows="5"
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="매물 특징, 입지, 내부 상태, 추천 포인트를 적어주세요."
          />
        </label>

        <div className="chip-row">
          {QUICK_DESC_TAGS.map((tag) => (
            <button key={tag} type="button" className="chip-btn" onClick={() => appendQuickTag(tag)}>
              {tag}
            </button>
          ))}
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>담당자명</span>
            <input value={form.contact_name} onChange={(event) => updateField("contact_name", event.target.value)} placeholder="예: 김중개" />
          </label>

          <label className="field">
            <span>연락처</span>
            <input
              value={form.contact_phone}
              onChange={(event) => updateField("contact_phone", event.target.value)}
              placeholder="예: 010-1234-5678"
            />
          </label>
        </div>

        <div className="helper-text">
          부동산 이름과 이메일은 <strong>내 정보 관리</strong> 값이 소개서 하단에 자동 표기됩니다.
        </div>

        <div className="form-actions">
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "소개서 생성 중..." : "소개서 생성"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default PropertyForm;
