import { normalizeBriefingData } from "../utils/brochure";

function PreviewCard({ form, result, mainImage, extraImages, onDownloadPdf, pdfLoading }) {
  const preview = normalizeBriefingData(form, { result, mainImage, extraImages });
  const canDownloadPdf = Boolean(result?.success);
  const hasBrochureUrl = Boolean(result?.brochure_url);

  const handleOpenNewTab = () => {
    if (hasBrochureUrl) {
      window.open(result.brochure_url, "_blank", "noreferrer");
    }
  };

  const handlePrint = () => {
    if (hasBrochureUrl) {
      const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
      if (!printWindow) {
        alert("팝업이 차단되면 새 창에서 연 뒤 Ctrl + P로 인쇄해 주세요.");
      }
      return;
    }
    if (canDownloadPdf) window.print();
  };

  const coverStyle = preview.mainPhoto?.fit === "contain" ? "contain" : "cover";
  const hiddenExtraCount = Math.max((preview.extraPhotos?.length || 0) - 4, 0);

  return (
    <section className="surface-card preview-panel preview-panel-dense">
      <div className="panel-head panel-head-with-actions">
        <div>
          <p className="preview-mode-label">{canDownloadPdf ? "최종 소개서 미리보기" : "편집 중 미리보기"}</p>
          <h3>고객용 매물 브리핑 미리보기</h3>
          <p>입력한 내용을 고객 전달용 소개서 톤으로 바로 확인합니다.</p>
        </div>
        <div className="preview-action-row">
          <button type="button" className="cta-btn" onClick={onDownloadPdf} disabled={!canDownloadPdf || pdfLoading}>
            {pdfLoading ? "PDF 생성 중" : "PDF 다운로드"}
          </button>
          <button type="button" className="secondary-btn" onClick={handlePrint} disabled={!canDownloadPdf}>인쇄</button>
          <button type="button" className="secondary-btn" onClick={handleOpenNewTab} disabled={!hasBrochureUrl}>새 창에서 보기</button>
        </div>
      </div>

      {!canDownloadPdf && (
        <div className="preview-helper-box">미리보기를 확인한 뒤 소개서 생성 버튼을 누르면 PDF 저장과 최종 소개서 보기가 활성화됩니다.</div>
      )}

      <div className="brochure-preview office-preview brochure-preview-v3">
        <div className="brochure-cover brochure-cover-v3">
          {preview.mainPhoto?.src ? (
            <img src={preview.mainPhoto.src} alt="대표 사진" style={{ objectFit: coverStyle }} />
          ) : (
            <div className="cover-placeholder">
              <span>대표 사진 미리보기</span>
            </div>
          )}
          <div className="cover-gradient" />
          <div className="cover-copy">
            {preview.dealType && <span className="deal-badge">{preview.dealType}</span>}
            <h4>{preview.title}</h4>
            <strong>{preview.priceSummary}</strong>
          </div>
        </div>

        <div className="brochure-body brochure-body-v3">
          {preview.address && (
            <div className="brochure-address">
              <span>주소</span>
              <strong>{preview.address}</strong>
            </div>
          )}

          {preview.strengths.length > 0 && (
            <div className="strength-row">
              {preview.strengths.slice(0, 5).map((item) => <span key={item}>{item}</span>)}
            </div>
          )}

          {preview.oneLineSummary && (
            <section className="brochure-section summary-section">
              <span>한 줄 요약</span>
              <p>{preview.oneLineSummary}</p>
            </section>
          )}

          {preview.infoItems.length > 0 && (
            <section className="brochure-section">
              <span className="section-label">기본 정보</span>
              <div className="brochure-spec-grid brochure-spec-grid-v3">
                {preview.infoItems.map((item) => (
                  <div className="spec-item" key={`${item.label}-${item.value}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {preview.descriptionLines.length > 0 && (
            <section className="brochure-section text-section">
              <span className="section-label">상세 설명</span>
              {preview.descriptionLines.map((line) => <p key={line}>{line}</p>)}
            </section>
          )}

          {preview.recommendedTargets.length > 0 && (
            <section className="brochure-section list-section">
              <span className="section-label">추천 대상 / 추천 업종</span>
              <ul>{preview.recommendedTargets.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          {preview.consultPoints.length > 0 && (
            <section className="brochure-section list-section">
              <span className="section-label">상담 시 강조 포인트</span>
              <ul>{preview.consultPoints.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          {preview.checkItems.length > 0 && (
            <section className="brochure-section list-section check-section">
              <span className="section-label">확인 필요 사항</span>
              <ul>{preview.checkItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          {preview.extraPhotos.length > 0 && (
            <section className="brochure-section photo-section">
              <span className="section-label">추가 사진</span>
              <div className="extra-photo-grid">
                {preview.extraPhotos.slice(0, 4).map((photo, index) => (
                  <div className="extra-photo-item" key={`${photo.src}-${index}`}>
                    <img src={photo.src} alt={`추가 사진 ${index + 1}`} style={{ objectFit: photo.fit === "contain" ? "contain" : "cover" }} />
                    {index === 3 && hiddenExtraCount > 0 && <span className="photo-more-badge">+{hiddenExtraCount}장</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {preview.footerItems.length > 0 && (
            <section className="brochure-section footer-section">
              <span className="section-label">담당자 정보</span>
              <div>
                {preview.footerItems.map((item) => (
                  <p key={item.label}><strong>{item.label}</strong> {item.value}</p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

export default PreviewCard;
