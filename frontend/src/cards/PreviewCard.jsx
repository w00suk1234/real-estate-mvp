function PreviewCard({ form, mainImage, extraImages }) {
  const mainPreview = mainImage ? URL.createObjectURL(mainImage) : null;

  const priceText =
    form.deal_type === "월세"
      ? `보증금 ${form.deposit || "-"}${form.price_unit} / 월세 ${
          form.monthly_rent || "-"
        }${form.price_unit} / 관리비 ${form.maintenance_fee || "-"}${
          form.price_unit
        }`
      : `전세 ${form.deposit || "-"}${form.price_unit}`;

  const restroomText =
    form.restroom_type === "직접입력"
      ? form.restroom_detail || "-"
      : form.restroom_type;

  const parkingText = form.parking_count
    ? `${form.parking_count}대 / ${form.parking_type}${
        form.parking_type === "유료" && form.parking_fee
          ? ` (${form.parking_fee}${form.price_unit})`
          : ""
      }`
    : "-";

  const previewExtra = form.template_type === "1page"
    ? extraImages.slice(0, 2)
    : extraImages.slice(0, 6);

  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <h3>미리보기</h3>
        <p>
          {form.template_type === "1page"
            ? "1페이지형 소개서 미리보기"
            : "2페이지형 소개서 미리보기"}
        </p>
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

          <div className="brochure-section">
            <div className="brochure-label">주소</div>
            <p className="preview-address-line">{form.address || "-"}</p>
          </div>

          <div className="brochure-spec-grid">
            {!!form.supply_area && (
              <div className="spec-item">
                <span>공급면적</span>
                <strong>
                  {form.supply_area}
                  {form.supply_area_unit}
                </strong>
              </div>
            )}

            <div className="spec-item">
              <span>전용면적</span>
              <strong>
                {form.exclusive_area || "-"}
                {form.exclusive_area_unit}
              </strong>
            </div>

            <div className="spec-item">
              <span>층수</span>
              <strong>{form.floor || "-"}</strong>
            </div>

            <div className="spec-item">
              <span>엘리베이터</span>
              <strong>{form.elevator || "-"}</strong>
            </div>

            <div className="spec-item">
              <span>방</span>
              <strong>{form.rooms || "-"}</strong>
            </div>

            <div className="spec-item">
              <span>화장실</span>
              <strong>{restroomText}</strong>
            </div>

            <div className="spec-item">
              <span>주차</span>
              <strong>{parkingText}</strong>
            </div>
          </div>

          <div className="brochure-section">
            <div className="brochure-label">상세 설명</div>
            <p className="preview-description">{form.description || "-"}</p>
          </div>

          {previewExtra.length > 0 && (
            <div className="brochure-section">
              <div className="brochure-label">추가 사진</div>
              <div className="extra-photo-grid">
                {previewExtra.map((file, idx) => (
                  <img
                    key={`${file.name}-${idx}`}
                    src={URL.createObjectURL(file)}
                    alt={`추가사진-${idx + 1}`}
                    className="extra-thumb"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="brochure-contact preview-contact-small">
            <div className="contact-card">
              <strong>{form.contact_name || "담당자명"}</strong>
              <span>{form.contact_phone || "연락처"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PreviewCard;