function imageSrc(image) {
  if (!image) return null;
  if (image.url) return image.url;
  return URL.createObjectURL(image);
}

function imageKey(image, idx) {
  return image?.url || image?.name || `image-${idx}`;
}

function hasValue(value) {
  return String(value ?? "").trim() !== "";
}

function buildPriceText(form) {
  const parts = [];

  if (hasValue(form.deposit)) {
    parts.push(`${form.deal_type === "월세" ? "보증금" : form.deal_type} ${form.deposit}${form.price_unit}`);
  }

  if (form.deal_type === "월세" && hasValue(form.monthly_rent)) {
    parts.push(`월세 ${form.monthly_rent}${form.price_unit}`);
  }

  if (hasValue(form.maintenance_fee)) {
    parts.push(`관리비 ${form.maintenance_fee}${form.price_unit}`);
  }

  return parts.length ? parts.join(" / ") : "가격 확인 필요";
}

function buildRestroomText(form) {
  if (form.restroom_type === "직접입력") {
    return form.restroom_detail || "";
  }

  return form.restroom_type || form.restroom_detail || "";
}

function buildParkingText(form) {
  if (!hasValue(form.parking_count)) return "";

  const feeText =
    form.parking_type === "유료" && hasValue(form.parking_fee)
      ? ` (${form.parking_fee}${form.price_unit})`
      : "";

  return `${form.parking_count}대 / ${form.parking_type || "주차"}${feeText}`;
}

function makeSpecItems(form) {
  const restroomText = buildRestroomText(form);
  const parkingText = buildParkingText(form);

  return [
    hasValue(form.supply_area) && {
      label: "공급면적",
      value: `${form.supply_area}${form.supply_area_unit}`,
    },
    hasValue(form.exclusive_area) && {
      label: "전용면적",
      value: `${form.exclusive_area}${form.exclusive_area_unit}`,
    },
    hasValue(form.floor) && { label: "층수", value: form.floor },
    hasValue(form.elevator) && { label: "엘리베이터", value: form.elevator },
    hasValue(form.rooms) && form.rooms !== "0" && { label: "방", value: form.rooms },
    hasValue(restroomText) && { label: "화장실", value: restroomText },
    hasValue(parkingText) && { label: "주차", value: parkingText },
  ].filter(Boolean);
}

function PreviewCard({ form, mainImage, extraImages }) {
  const mainPreview = imageSrc(mainImage);
  const priceText = buildPriceText(form);
  const previewExtra = form.template_type === "1page" ? extraImages.slice(0, 2) : extraImages.slice(0, 6);
  const specItems = makeSpecItems(form);

  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <h3>미리보기</h3>
        <p>{form.template_type === "1page" ? "1페이지형 소개서 미리보기" : "2페이지형 소개서 미리보기"}</p>
      </div>

      <div className="brochure-preview office-preview">
        <div className="brochure-cover">
          {mainPreview ? (
            <img src={mainPreview} alt="대표사진" />
          ) : (
            <div className="preview-empty">대표사진 미리보기</div>
          )}

          <div className="brochure-cover-overlay">
            <span className="preview-chip">{form.deal_type} 매물</span>
            <h4>{form.title || "매물명"}</h4>
          </div>
        </div>

        <div className="brochure-body">
          <div className="brochure-section">
            <div className="brochure-label">가격</div>
            <p className="preview-description">{priceText}</p>
          </div>

          {hasValue(form.address) && (
            <div className="brochure-section">
              <div className="brochure-label">주소</div>
              <p className="preview-address-line">{form.address}</p>
            </div>
          )}

          {specItems.length > 0 && (
            <div className="brochure-spec-grid">
              {specItems.map((item) => (
                <div className="spec-item" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}

          {hasValue(form.description) && (
            <div className="brochure-section">
              <div className="brochure-label">상세 설명</div>
              <p className="preview-description">{form.description}</p>
            </div>
          )}

          {previewExtra.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">추가 사진</div>
              <div className="extra-photo-grid">
                {previewExtra.map((image, idx) => (
                  <img
                    key={imageKey(image, idx)}
                    src={imageSrc(image)}
                    alt={`추가 사진-${idx + 1}`}
                    className="extra-thumb"
                  />
                ))}
              </div>
            </div>
          )}

          {(hasValue(form.contact_name) || hasValue(form.contact_phone)) && (
            <div className="brochure-contact preview-contact-small">
              <div className="contact-card">
                <strong>{form.contact_name || "담당자 확인 필요"}</strong>
                {hasValue(form.contact_phone) && <span>{form.contact_phone}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default PreviewCard;
