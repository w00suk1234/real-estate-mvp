import { useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";

const QUICK_DESC_TAGS = [
  "역세권",
  "채광 우수",
  "즉시 입주 가능",
  "인테리어 우수",
  "주차 가능",
  "엘리베이터 있음",
  "남향",
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
    setExtraImages((prev) => {
      const merged = [...prev, ...selected].slice(0, 10);
      return merged;
    });
  };

  const removeExtraImage = (idx) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveExtraImageToMain = (idx) => {
    if (!extraImages[idx]) return;
    const newMain = extraImages[idx];
    const newExtras = extraImages.filter((_, i) => i !== idx);
    if (mainImage) newExtras.unshift(mainImage);
    setMainImage(newMain);
    setExtraImages(newExtras.slice(0, 10));
  };

  const appendQuickTag = (tag) => {
    setForm((prev) => {
      const current = prev.description?.trim() || "";
      const next = current ? `${current}, ${tag}` : tag;
      return { ...prev, description: next };
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
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
    };
    localStorage.setItem("briefing_default_settings", JSON.stringify(payload));
    alert("기본 설정을 저장했습니다.");
  };

  const resetDefaults = () => {
    localStorage.removeItem("briefing_default_settings");
    alert("저장된 기본 설정을 삭제했습니다.");
  };

  const pricePreview = useMemo(() => {
    if (form.deal_type === "월세") {
      return `보증금 ${form.deposit || "-"}${form.price_unit} / 월세 ${
        form.monthly_rent || "-"
      }${form.price_unit} / 관리비 ${form.maintenance_fee || "-"}${
        form.price_unit
      }`;
    }
    return `전세 ${form.deposit || "-"}${form.price_unit}`;
  }, [
    form.deal_type,
    form.deposit,
    form.monthly_rent,
    form.maintenance_fee,
    form.price_unit,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isAuthenticated) {
      alert("소개서를 저장하려면 로그인 또는 회원가입이 필요합니다.");
      return;
    }

    if (!mainImage) {
      alert("대표사진을 선택해주세요.");
      return;
    }

    const formData = new FormData();

    Object.entries(form).forEach(([key, value]) => {
      formData.append(key, value ?? "");
    });

    if (isImportedImage(mainImage)) {
      formData.append("main_image_url", mainImage.url);
    } else {
      formData.append("main_image", mainImage);
    }

    extraImages.forEach((file) => {
      if (!isImportedImage(file)) {
        formData.append("extra_images", file);
      }
    });

    const importedExtraUrls = extraImages
      .filter(isImportedImage)
      .map((image) => image.url);
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

      setResult(data);
      onCreated?.();
    } catch (err) {
      console.error(err);
      alert(err.message || "소개서 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isMonthly = form.deal_type === "월세";

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>매물 정보 입력</h3>
        <p>대표사진, 추가사진, 가격/면적/주차 정보를 입력하세요.</p>
      </div>

      <form className="form-box" onSubmit={handleSubmit}>
        <div className="field-grid two">
          <div className="field">
            <label>소개서 템플릿</label>
            <select
              value={form.template_type}
              onChange={(e) => updateField("template_type", e.target.value)}
            >
              <option value="1page">1페이지형</option>
              <option value="2page">2페이지형</option>
            </select>
          </div>

          <div className="field">
            <label>거래유형</label>
            <select
              value={form.deal_type}
              onChange={(e) => updateField("deal_type", e.target.value)}
            >
              <option value="월세">월세</option>
              <option value="전세">전세</option>
            </select>
          </div>
        </div>

        <div className="field-grid two">
          <button
            type="button"
            className="secondary-btn"
            onClick={saveDefaults}
          >
            기본 설정 저장
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={resetDefaults}
          >
            기본 설정 삭제
          </button>
        </div>

        <div className="field">
          <label>대표사진</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setMainImage(e.target.files?.[0] || null)}
          />
        </div>

        <div className="field">
          <label>추가사진 (최대 10장)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleExtraImagesChange(e.target.files)}
          />
          <small className="helper-text">
            현재 선택: {extraImages.length}장
          </small>
        </div>

        {extraImages.length > 0 && (
          <div className="extra-manage-box">
            {extraImages.map((file, idx) => (
              <div className="extra-manage-item" key={`${file.name}-${idx}`}>
                <span className="extra-manage-name">{imageName(file, idx)}</span>
                <div className="extra-manage-actions">
                  <button
                    type="button"
                    className="secondary-btn small-btn"
                    onClick={() => moveExtraImageToMain(idx)}
                  >
                    대표로 지정
                  </button>
                  <button
                    type="button"
                    className="danger-btn small-btn"
                    onClick={() => removeExtraImage(idx)}
                  >
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
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="예: 강남역 도보 5분 사무실"
            required
          />
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>금액 단위</label>
            <select
              value={form.price_unit}
              onChange={(e) => updateField("price_unit", e.target.value)}
            >
              <option value="만원">만원</option>
              <option value="원">원</option>
            </select>
          </div>

          <div className="field">
            <label>가격 자동 문구 미리보기</label>
            <input value={pricePreview} readOnly />
          </div>
        </div>

        <div className={`field-grid ${isMonthly ? "three" : "one"}`}>
          <div className="field">
            <label>보증금</label>
            <input
              value={form.deposit}
              onChange={(e) => updateField("deposit", e.target.value)}
              placeholder="예: 3000"
            />
          </div>

          {isMonthly && (
            <>
              <div className="field">
                <label>월세</label>
                <input
                  value={form.monthly_rent}
                  onChange={(e) => updateField("monthly_rent", e.target.value)}
                  placeholder="예: 250"
                />
              </div>

              <div className="field">
                <label>관리비</label>
                <input
                  value={form.maintenance_fee}
                  onChange={(e) =>
                    updateField("maintenance_fee", e.target.value)
                  }
                  placeholder="예: 30"
                />
              </div>
            </>
          )}
        </div>

        <div className="field">
          <label>주소</label>
          <input
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
            placeholder="예: 서울시 강남구 ..."
            required
          />
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>공급면적</label>
            <div className="inline-field">
              <input
                value={form.supply_area}
                onChange={(e) => updateField("supply_area", e.target.value)}
                placeholder="예: 45"
              />
              <select
                value={form.supply_area_unit}
                onChange={(e) =>
                  updateField("supply_area_unit", e.target.value)
                }
              >
                <option value="㎡">㎡</option>
                <option value="평">평</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>전용면적</label>
            <div className="inline-field">
              <input
                value={form.exclusive_area}
                onChange={(e) =>
                  updateField("exclusive_area", e.target.value)
                }
                placeholder="예: 29"
              />
              <select
                value={form.exclusive_area_unit}
                onChange={(e) =>
                  updateField("exclusive_area_unit", e.target.value)
                }
              >
                <option value="㎡">㎡</option>
                <option value="평">평</option>
              </select>
            </div>
          </div>
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>층수</label>
            <input
              value={form.floor}
              onChange={(e) => updateField("floor", e.target.value)}
              placeholder="예: 7층"
            />
          </div>

          <div className="field">
            <label>엘리베이터</label>
            <select
              value={form.elevator}
              onChange={(e) => updateField("elevator", e.target.value)}
            >
              <option value="유">유</option>
              <option value="무">무</option>
            </select>
          </div>
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>방 개수</label>
            <select
              value={form.rooms}
              onChange={(e) => updateField("rooms", e.target.value)}
            >
              {["0", "1", "2", "3", "4", "5", "6"].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>화장실 형태</label>
            <select
              value={form.restroom_type}
              onChange={(e) => updateField("restroom_type", e.target.value)}
            >
              <option value="직접입력">직접입력</option>
              <option value="내부 공용 화장실">내부 공용 화장실</option>
              <option value="외부 공용 화장실">외부 공용 화장실</option>
              <option value="내부 남녀분리 화장실">내부 남녀분리 화장실</option>
              <option value="외부 남녀분리 화장실">외부 남녀분리 화장실</option>
            </select>
          </div>
        </div>

        {form.restroom_type === "직접입력" && (
          <div className="field">
            <label>화장실 직접입력</label>
            <input
              value={form.restroom_detail}
              onChange={(e) => updateField("restroom_detail", e.target.value)}
              placeholder="예: 내부 1개 / 남녀공용"
            />
          </div>
        )}

        <div className="field-grid three">
          <div className="field">
            <label>주차 대수</label>
            <select
              value={form.parking_count}
              onChange={(e) => updateField("parking_count", e.target.value)}
            >
              <option value="">선택</option>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"].map(
                (num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="field">
            <label>주차 요금</label>
            <select
              value={form.parking_type}
              onChange={(e) => updateField("parking_type", e.target.value)}
            >
              <option value="무료">무료</option>
              <option value="유료">유료</option>
            </select>
          </div>

          {form.parking_type === "유료" && (
            <div className="field">
              <label>주차비</label>
              <input
                value={form.parking_fee}
                onChange={(e) => updateField("parking_fee", e.target.value)}
                placeholder="예: 10"
              />
            </div>
          )}
        </div>

        <div className="field">
          <label>상세 설명</label>
          <textarea
            rows="6"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="예: 강남역 도보 5분, 채광 우수, 인테리어 깔끔"
            required
          />
        </div>

        <div className="quick-tags">
          {QUICK_DESC_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="quick-tag-btn"
              onClick={() => appendQuickTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="field-grid two">
          <div className="field">
            <label>담당자명</label>
            <input
              value={form.contact_name}
              onChange={(e) => updateField("contact_name", e.target.value)}
              placeholder="예: 김은수"
            />
          </div>

          <div className="field">
            <label>연락처</label>
            <input
              value={form.contact_phone}
              onChange={(e) => updateField("contact_phone", e.target.value)}
              placeholder="예: 010-1234-5678"
            />
          </div>
        </div>

        <button className="cta-btn" type="submit" disabled={loading}>
          {loading ? "생성 중..." : "소개서 생성"}
        </button>
      </form>
    </section>
  );
}

export default PropertyForm;
