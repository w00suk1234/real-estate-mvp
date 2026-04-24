function ResultCard({ result, onDownloadPdf, pdfLoading }) {
  const hasResult = Boolean(result?.success);

  const handleOpenNewTab = () => {
    if (!hasResult) return;
    window.open(result.brochure_url, "_blank", "noreferrer");
  };

  const handlePrintBrochure = () => {
    if (!hasResult) return;

    const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
    if (!printWindow) {
      alert("팝업이 차단되었습니다. 새 창에서 소개서를 연 뒤 Ctrl + P로 인쇄해 주세요.");
      return;
    }

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>생성 결과</h3>
        <p>
          {hasResult
            ? result.message
            : "미리보기를 확인한 뒤 소개서 생성 버튼을 누르면 PDF로 저장할 수 있습니다."}
        </p>
      </div>

      {hasResult ? (
        <>
          <div className="result-action-row result-action-row-primary">
            <a href={result.brochure_url} target="_blank" rel="noreferrer" className="cta-btn inline-cta">
              최종 소개서 보기
            </a>
            <button type="button" className="secondary-btn" onClick={onDownloadPdf} disabled={pdfLoading}>
              {pdfLoading ? "PDF 생성 중..." : "PDF 다운로드"}
            </button>
          </div>

          <div className="result-links">
            <button type="button" className="secondary-btn result-open-btn" onClick={handleOpenNewTab}>
              새 창에서 열기
            </button>
            <button type="button" className="secondary-btn result-open-btn" onClick={handlePrintBrochure}>
              인쇄
            </button>
          </div>

          <div className="result-tip">
            PDF에는 고객용 소개서 내용만 포함되며, 입력 폼이나 내부 수집 정보는 제외됩니다.
          </div>

          <iframe className="result-frame" src={result.brochure_url} title="brochure-result" />
        </>
      ) : (
        <div className="empty-box result-empty-box">
          <strong>아직 최종 소개서가 없습니다.</strong>
          <p>현재 미리보기를 먼저 확인하고 소개서를 생성하면 고객 전달용 PDF까지 바로 저장할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

export default ResultCard;
