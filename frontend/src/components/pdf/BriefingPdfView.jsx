import { forwardRef, useMemo } from "react";
import {
  buildAreaText,
  buildBriefing,
  buildParkingText,
  buildPriceSummary,
  buildRestroomText,
  compactDisplayValue,
  formatAmount,
  isMeaningfulText,
  resolveImageSource,
} from "../../utils/brochure";

function buildInfoItems(form) {
  const items = [
    isMeaningfulText(form.exclusive_area) && {
      label: "전용면적",
      value: `${form.exclusive_area}${form.exclusive_area_unit}`,
    },
    isMeaningfulText(form.supply_area) && {
      label: "공급면적",
      value: `${form.supply_area}${form.supply_area_unit}`,
    },
    isMeaningfulText(form.floor) && { label: "층수", value: form.floor },
    isMeaningfulText(form.elevator) && { label: "엘리베이터", value: form.elevator },
    isMeaningfulText(form.available_from) && { label: "입주 가능일", value: form.available_from },
    buildRestroomText(form) && { label: "화장실", value: buildRestroomText(form) },
    buildParkingText(form) && { label: "주차", value: buildParkingText(form) },
    isMeaningfulText(form.maintenance_fee) && {
      label: "관리비",
      value: formatAmount(form.maintenance_fee, form.price_unit),
    },
    isMeaningfulText(form.premium) && {
      label: "권리금",
      value: formatAmount(form.premium, form.price_unit),
    },
  ].filter(Boolean);

  return items;
}

const BriefingPdfView = forwardRef(function BriefingPdfView(
  { form, result, mainImage, extraImages },
  ref,
) {
  const briefing = useMemo(() => buildBriefing(form), [form]);
  const infoItems = useMemo(() => buildInfoItems(form), [form]);

  const mainImageSrc = result?.image_url || resolveImageSource(mainImage);
  const extraImageSources = (
    result?.extra_image_urls?.length
      ? result.extra_image_urls.map((url) => ({ url }))
      : extraImages
  )
    .map((image) => resolveImageSource(image))
    .filter(Boolean)
    .slice(0, 4);

  const address = compactDisplayValue(form.address);
  const title = compactDisplayValue(form.title) || "사무실 / 상가 소개서";
  const priceSummary = buildPriceSummary(form);
  const description = compactDisplayValue(form.description);
  const areaText = buildAreaText(form);
  const contactName = compactDisplayValue(form.contact_name);
  const contactPhone = compactDisplayValue(form.contact_phone);

  return (
    <div className="pdf-stage" aria-hidden="true">
      <article ref={ref} className="briefing-pdf">
        <header className="briefing-pdf__hero">
          {mainImageSrc ? (
            <div className="briefing-pdf__hero-image">
              <img src={mainImageSrc} alt="대표 사진" />
            </div>
          ) : null}

          <div className="briefing-pdf__hero-body">
            <div className="briefing-pdf__deal-badge">{compactDisplayValue(form.deal_type) || "매물"}</div>
            <h1>{title}</h1>
            {address ? <p className="briefing-pdf__address">{address}</p> : null}
            <div className="briefing-pdf__price">{priceSummary}</div>
          </div>
        </header>

        <div className="briefing-pdf__content">
          {briefing.strengths.length > 0 ? (
            <section className="briefing-pdf__section">
              <div className="briefing-pdf__badge-row">
                {briefing.strengths.map((item) => (
                  <span key={item} className="briefing-pdf__badge">
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="briefing-pdf__section">
            <h2>한 줄 요약</h2>
            <p>{briefing.oneLineSummary}</p>
          </section>

          {infoItems.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>기본 정보</h2>
              <div className="briefing-pdf__info-grid">
                {infoItems.map((item) => (
                  <div key={item.label} className="briefing-pdf__info-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {description || areaText ? (
            <section className="briefing-pdf__section">
              <h2>상세 설명</h2>
              <p className="briefing-pdf__paragraph">
                {[description, areaText ? `면적 기준: ${areaText}` : ""].filter(Boolean).join("\n")}
              </p>
            </section>
          ) : null}

          {briefing.recommendedTargets.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>추천 대상 / 추천 업종</h2>
              <ul>
                {briefing.recommendedTargets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {briefing.consultPoints.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>상담 시 강조 포인트</h2>
              <ul>
                {briefing.consultPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {briefing.checkItems.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>확인 필요 사항</h2>
              <ul className="briefing-pdf__warning-list">
                {briefing.checkItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {extraImageSources.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>추가 사진</h2>
              <div className="briefing-pdf__photo-grid">
                {extraImageSources.map((src, index) => (
                  <figure key={`${src}-${index}`} className="briefing-pdf__photo-card">
                    <img src={src} alt={`추가 사진 ${index + 1}`} />
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {(contactName || contactPhone) && (
            <footer className="briefing-pdf__footer">
              {contactName ? <strong>{contactName}</strong> : null}
              {contactPhone ? <span>{contactPhone}</span> : null}
            </footer>
          )}
        </div>
      </article>
    </div>
  );
});

export default BriefingPdfView;
