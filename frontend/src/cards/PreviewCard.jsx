import {
  buildAreaText,
  buildBriefing,
  buildParkingText,
  buildPriceSummary,
  buildRestroomText,
  hasValue,
} from "../utils/brochure";

function imageSrc(image) {
  if (!image) return null;
  if (image.url) return image.url;
  return URL.createObjectURL(image);
}

function imageKey(image, idx) {
  return image?.url || image?.name || `image-${idx}`;
}

function makeInfoCards(form) {
  const cards = [
    hasValue(form.exclusive_area) && { label: "전용면적", value: `${form.exclusive_area}${form.exclusive_area_unit}` },
    hasValue(form.supply_area) && { label: "공급면적", value: `${form.supply_area}${form.supply_area_unit}` },
    hasValue(form.floor) && { label: "층수", value: form.floor },
    hasValue(form.elevator) && { label: "엘리베이터", value: form.elevator },
    hasValue(form.parking_count) && { label: "주차", value: buildParkingText(form) },
    hasValue(form.available_from) && { label: "입주 가능일", value: form.available_from },
    hasValue(form.hvac) && { label: "냉난방", value: form.hvac },
    hasValue(form.sign_allowed) && { label: "간판 가능", value: form.sign_allowed },
    hasValue(form.restroom_detail) && { label: "화장실", value: buildRestroomText(form) },
    hasValue(form.maintenance_includes) && { label: "관리비 포함", value: form.maintenance_includes },
  ].filter(Boolean);

  return cards.slice(0, 8);
}

function PreviewCard({ form, mainImage, extraImages }) {
  const mainPreview = imageSrc(mainImage);
  const priceText = buildPriceSummary(form);
  const briefing = buildBriefing(form);
  const previewExtra = extraImages.slice(0, form.template_type === "2page" ? 6 : 4);
  const infoCards = makeInfoCards(form);
  const areaText = buildAreaText(form);

  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <h3>미리보기</h3>
        <p>고객에게 바로 보여줄 수 있는 브리핑형 소개서 미리보기입니다.</p>
      </div>

      <div className="brochure-preview office-preview brochure-preview-v2">
        <div className="brochure-cover brochure-cover-v2">
          {mainPreview ? (
            <img src={mainPreview} alt="대표 사진" />
          ) : (
            <div className="preview-empty">대표 사진 미리보기</div>
          )}

          <div className="brochure-cover-overlay brochure-cover-overlay-v2">
            <div className="brochure-cover-meta">
              <span className="preview-chip">{form.deal_type || "월세"} 매물</span>
              {hasValue(form.recommended_industry) && <span className="preview-chip subtle">{form.recommended_industry}</span>}
            </div>
            <h4>{form.title || "매물명을 입력하면 여기에 표시됩니다."}</h4>
            <p className="cover-address">{form.address || "주소 확인 필요"}</p>
            <div className="cover-price">{priceText}</div>
          </div>
        </div>

        <div className="brochure-body brochure-body-v2">
          {briefing.strengths.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-badge-row">
                {briefing.strengths.map((item) => (
                  <span key={item} className="brochure-badge">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="brochure-section">
            <div className="brochure-label">한 줄 요약</div>
            <p className="preview-description">{briefing.oneLineSummary}</p>
          </div>

          {infoCards.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">기본 정보</div>
              <div className="brochure-spec-grid brochure-spec-grid-v2">
                {infoCards.map((item) => (
                  <div className="spec-item" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(hasValue(form.description) || hasValue(areaText)) && (
            <div className="brochure-section">
              <div className="brochure-label">상세 설명</div>
              <p className="preview-description">
                {[form.description, areaText && `면적 기준: ${areaText}`].filter(Boolean).join("\n")}
              </p>
            </div>
          )}

          {briefing.recommendedTargets.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">추천 대상 / 추천 업종</div>
              <ul className="brochure-list">
                {briefing.recommendedTargets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {briefing.consultPoints.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">상담 시 강조 포인트</div>
              <ul className="brochure-list">
                {briefing.consultPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {briefing.checkItems.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">확인 필요 사항</div>
              <ul className="brochure-list brochure-list-warning">
                {briefing.checkItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {previewExtra.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">추가 사진</div>
              <div className="extra-photo-grid extra-photo-grid-v2">
                {previewExtra.map((image, idx) => (
                  <img key={imageKey(image, idx)} src={imageSrc(image)} alt={`추가 사진 ${idx + 1}`} className="extra-thumb" />
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

