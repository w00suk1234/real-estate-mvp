import { normalizeBriefingData } from "../utils/brochure";

function PreviewCard({ form, result, mainImage, extraImages, onDownloadPdf, onPrint, pdfLoading }) {
  const preview = normalizeBriefingData(form, { result, mainImage, extraImages });
  const canDownloadPdf = Boolean(result?.success);
  const hasBrochureUrl = Boolean(result?.brochure_url);

  const handleOpenNewTab = () => {
    if (hasBrochureUrl) {
      window.open(result.brochure_url, "_blank", "noreferrer");
    }
  };

  const handlePrint = () => {
    if (typeof onPrint === "function") {
      onPrint();
      return;
    }
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
  const summaryInfoItems = preview.infoItems.slice(0, 6);
  const summaryDescriptionLines = preview.descriptionLines.slice(0, 2);
  const summaryTargets = preview.recommendedTargets.slice(0, 3);
  const summaryConsultPoints = preview.consultPoints.slice(0, 3);
  const summaryCheckItems = preview.checkItems.slice(0, 3);

  return (
    <section className="surface-card preview-panel preview-panel-dense preview-summary-panel">
      <div className="panel-head panel-head-with-actions">
        <div>
          <h3>고객용 요약 미리보기</h3>
          <p>커버, 가격, 핵심 정보만 먼저 확인하고 전체본은 새 창에서 봅니다.</p>
        </div>
        <div className="preview-action-row">
          <button type="button" className="cta-btn" onClick={onDownloadPdf} disabled={!canDownloadPdf || pdfLoading}>
            {pdfLoading ? "PDF 생성 중" : "PDF 다운로드"}
          </button>
          <button type="button" className="secondary-btn" onClick={handlePrint} disabled={!canDownloadPdf}>인쇄</button>
          <button type="button" className="secondary-btn" onClick={handleOpenNewTab} disabled={!hasBrochureUrl}>전체 미리보기</button>
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
                {summaryInfoItems.map((item) => (
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
              {summaryDescriptionLines.map((line) => <p key={line}>{line}</p>)}
            </section>
          )}

          {summaryTargets.length > 0 && (
            <section className="brochure-section list-section">
              <span className="section-label">추천 대상 / 추천 업종</span>
              <ul>{summaryTargets.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          {summaryConsultPoints.length > 0 && (
            <section className="brochure-section list-section">
              <span className="section-label">상담 시 강조 포인트</span>
              <ul>{summaryConsultPoints.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          {summaryCheckItems.length > 0 && (
            <section className="brochure-section list-section check-section">
              <span className="section-label">확인 필요 사항</span>
              <ul>{summaryCheckItems.map((item) => <li key={item}>{item}</li>)}</ul>
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
