function ResultCard({ result, onDownloadPdf, pdfLoading }) {
  const hasResult = Boolean(result?.success);
  const hasBrochureUrl = Boolean(result?.brochure_url);

  const handleOpenNewTab = () => {
    if (hasBrochureUrl) {
      window.open(result.brochure_url, "_blank", "noreferrer");
    }
  };

  const handlePrintBrochure = () => {
    if (hasBrochureUrl) {
      const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
      if (!printWindow) {
        alert("팝업이 차단되었습니다. 새 창에서 소개서를 연 뒤 Ctrl + P로 인쇄해 주세요.");
        return;
      }
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
      return;
    }

    if (hasResult) {
      window.print();
    }
  };

  return (
    <section className="surface-card">
      <div className="panel-head">
        <h3>최종 소개서</h3>
        <p>
          {hasResult
            ? "생성된 소개서를 PDF와 인쇄 형태로 고객에게 전달할 수 있습니다."
            : "소개서를 생성하면 PDF 저장과 인쇄 기능을 바로 사용할 수 있습니다."}
        </p>
      </div>

      {hasResult ? (
        <>
          <div className="result-action-row result-action-row-primary">
            {hasBrochureUrl ? (
              <a href={result.brochure_url} target="_blank" rel="noreferrer" className="cta-btn inline-cta">
                최종 소개서 보기
              </a>
            ) : null}
            <button type="button" className="cta-btn inline-cta" onClick={onDownloadPdf} disabled={pdfLoading}>
              {pdfLoading ? "PDF 생성 중..." : "PDF 다운로드"}
            </button>
          </div>

          <div className="result-links">
            <button type="button" className="secondary-btn result-open-btn" onClick={handleOpenNewTab} disabled={!hasBrochureUrl}>
              새 창에서 열기
            </button>
            <button type="button" className="secondary-btn result-open-btn" onClick={handlePrintBrochure}>
              인쇄
            </button>
          </div>

          <div className="result-tip">
            고객 전달용 소개서에는 입력 폼과 내부 수집 정보가 포함되지 않고, 고객에게 보여줄 내용만 정리됩니다.
          </div>

          {hasBrochureUrl ? <iframe className="result-frame" src={result.brochure_url} title="brochure-result" /> : null}
        </>
      ) : (
        <div className="empty-box result-empty-box">
          <strong>아직 최종 소개서가 없습니다.</strong>
          <p>미리보기를 확인한 뒤 소개서 생성 버튼을 누르면 PDF 저장과 인쇄를 바로 사용할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

export default ResultCard;
