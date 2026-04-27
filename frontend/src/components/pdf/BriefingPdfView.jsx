import { forwardRef, useMemo } from "react";
import { normalizeBriefingData } from "../../utils/brochure";

const BriefingPdfView = forwardRef(function BriefingPdfView(
  { form, result, mainImage, extraImages, pdfAssets },
  ref,
) {
  const briefing = useMemo(
    () => normalizeBriefingData(form, { result, mainImage, extraImages, pdfAssets }),
    [extraImages, form, mainImage, pdfAssets, result],
  );

  return (
    <div className="pdf-stage" aria-hidden="true">
      <article ref={ref} className="briefing-pdf">
        <header className="briefing-pdf__hero">
          {briefing.mainPhoto ? (
            <div className="briefing-pdf__hero-image">
              <img src={briefing.mainPhoto.src} alt={briefing.mainPhoto.alt} style={{ objectFit: briefing.mainPhoto.fit }} />
            </div>
          ) : null}

          <div className="briefing-pdf__hero-body">
            <div className="briefing-pdf__deal-badge">{briefing.dealType}</div>
            <h1>{briefing.title}</h1>
            {briefing.address ? <p className="briefing-pdf__address">{briefing.address}</p> : null}
            <div className="briefing-pdf__price">{briefing.priceSummary}</div>
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

          {briefing.infoItems.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>기본 정보</h2>
              <div className="briefing-pdf__info-grid">
                {briefing.infoItems.map((item) => (
                  <div key={item.label} className="briefing-pdf__info-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {briefing.descriptionLines.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>상세 설명</h2>
              <p className="briefing-pdf__paragraph">{briefing.descriptionLines.join("\n")}</p>
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

          {briefing.extraPhotos.length > 0 ? (
            <section className="briefing-pdf__section">
              <h2>추가 사진</h2>
              <div className="briefing-pdf__photo-grid">
                {briefing.extraPhotos.map((image, index) => (
                  <figure key={`${image.src}-${index}`} className="briefing-pdf__photo-card">
                    <img src={image.src} alt={image.alt} style={{ objectFit: image.fit }} />
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {briefing.footerItems.length > 0 ? (
            <footer className="briefing-pdf__footer briefing-pdf__footer-column">
              {briefing.footerItems.map((item) => (
                <div key={item.label} className="briefing-pdf__footer-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </footer>
          ) : null}
        </div>
      </article>
    </div>
  );
});

export default BriefingPdfView;
