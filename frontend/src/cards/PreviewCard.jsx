import { normalizeBriefingData } from "../utils/brochure";

function PreviewCard({ form, result, mainImage, extraImages, onDownloadPdf, pdfLoading }) {
  const preview = normalizeBriefingData(form, { result, mainImage, extraImages });
  const canDownloadPdf = Boolean(result?.success);

  const handleOpenNewTab = () => {
    if (!result?.brochure_url) return;
    window.open(result.brochure_url, "_blank", "noreferrer");
  };

  const handlePrint = () => {
    if (!result?.brochure_url) return;

    const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
    if (!printWindow) {
      alert("팝업이 차단되어 있습니다. 새 창에서 소개서를 연 뒤 Ctrl + P로 인쇄해 주세요.");
      return;
    }

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <section className="panel preview-panel">
      <div className="panel-head panel-head-with-actions">
        <div>
          <p className="preview-mode-label">{canDownloadPdf ? "최종 소개서 기준 미리보기" : "편집 중 미리보기"}</p>
          <h3>고객용 소개서 미리보기</h3>
          <p>입력값을 기준으로 고객에게 보여줄 소개서 느낌을 바로 확인할 수 있습니다.</p>
        </div>

        <div className="preview-action-row">
          <button
            type="button"
            className="cta-btn preview-pdf-btn"
            onClick={onDownloadPdf}
            disabled={!canDownloadPdf || pdfLoading}
          >
            {pdfLoading ? "PDF 생성 중..." : "PDF 다운로드"}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handlePrint}
            disabled={!canDownloadPdf}
          >
            인쇄
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleOpenNewTab}
            disabled={!canDownloadPdf}
          >
            새 창에서 보기
          </button>
        </div>
      </div>

      {!canDownloadPdf ? (
        <div className="preview-helper-box">
          미리보기를 확인한 뒤 소개서 생성 버튼을 누르면 PDF로 저장할 수 있습니다.
        </div>
      ) : null}

      <div className="brochure-preview office-preview brochure-preview-v3">
        <div className={`brochure-cover brochure-cover-v3 ${!preview.mainPhoto ? "is-empty" : ""}`}>
          {preview.mainPhoto ? (
            <img
              src={preview.mainPhoto.src}
              alt={preview.mainPhoto.alt}
              style={{ objectFit: preview.mainPhoto.fit }}
            />
          ) : (
            <div className="preview-empty compact">대표 사진 미리보기</div>
          )}

          <div className="brochure-cover-overlay brochure-cover-overlay-v3">
            <div className="brochure-cover-meta">
              <span className="preview-chip">{preview.dealType}</span>
            </div>
            <h4>{preview.title}</h4>
            {preview.address ? <p className="cover-address">{preview.address}</p> : null}
            <div className="cover-price">{preview.priceSummary}</div>
          </div>
        </div>

        <div className="brochure-body brochure-body-v3">
          {preview.strengths.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-badge-row">
                {preview.strengths.map((item) => (
                  <span key={item} className="brochure-badge">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="brochure-section">
            <div className="brochure-label">한 줄 요약</div>
            <p className="preview-description">{preview.oneLineSummary}</p>
          </div>

          {preview.infoItems.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-label">기본 정보</div>
              <div className="brochure-spec-grid brochure-spec-grid-v3">
                {preview.infoItems.map((item) => (
                  <div className="spec-item" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {preview.descriptionLines.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-label">상세 설명</div>
              <p className="preview-description">{preview.descriptionLines.join("\n")}</p>
            </div>
          ) : null}

          {preview.recommendedTargets.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-label">추천 대상 / 추천 업종</div>
              <ul className="brochure-list">
                {preview.recommendedTargets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.consultPoints.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-label">상담 시 강조 포인트</div>
              <ul className="brochure-list">
                {preview.consultPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.checkItems.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-label">확인 필요 사항</div>
              <ul className="brochure-list brochure-list-warning">
                {preview.checkItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.extraPhotos.length > 0 ? (
            <div className="brochure-section">
              <div className="brochure-section-head">
                <div className="brochure-label">추가 사진</div>
                {preview.extraPhotoOverflow > 0 ? (
                  <span className="photo-overflow-badge">+{preview.extraPhotoOverflow}장 더 있음</span>
                ) : null}
              </div>
              <div className="extra-photo-grid extra-photo-grid-v3">
                {preview.extraPhotos.map((image, index) => (
                  <figure key={`${image.src}-${index}`} className="preview-photo-card">
                    <img
                      src={image.src}
                      alt={image.alt}
                      className="extra-thumb"
                      style={{ objectFit: image.fit }}
                    />
                  </figure>
                ))}
              </div>
            </div>
          ) : null}

          {preview.contactName || preview.contactPhone ? (
            <div className="brochure-contact preview-contact-small">
              <div className="contact-card">
                {preview.contactName ? <strong>{preview.contactName}</strong> : null}
                {preview.contactPhone ? <span>{preview.contactPhone}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default PreviewCard;
