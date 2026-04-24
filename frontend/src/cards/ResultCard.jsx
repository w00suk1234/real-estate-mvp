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
      alert("팝업이 차단되어 있습니다. 새 창에서 소개서를 연 뒤 Ctrl + P로 인쇄해 주세요.");
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
        <h3>최종 소개서</h3>
        <p>
          {hasResult
            ? "생성된 소개서를 바로 열어보고, PDF 또는 인쇄용으로 전달할 수 있습니다."
            : "소개서를 생성하면 최종 소개서 보기, PDF 다운로드, 인쇄 기능이 활성화됩니다."}
        </p>
      </div>

      {hasResult ? (
        <>
          <div className="result-action-row result-action-row-primary">
            <a href={result.brochure_url} target="_blank" rel="noreferrer" className="cta-btn inline-cta">
              최종 소개서 보기
            </a>
            <button type="button" className="cta-btn inline-cta" onClick={onDownloadPdf} disabled={pdfLoading}>
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
            고객 전달용 PDF에는 입력 폼과 내부 안내 정보가 포함되지 않고, 소개서 내용만 깔끔하게 정리됩니다.
          </div>

          <iframe className="result-frame" src={result.brochure_url} title="brochure-result" />
        </>
      ) : (
        <div className="empty-box result-empty-box">
          <strong>아직 최종 소개서가 없습니다.</strong>
          <p>미리보기를 확인한 뒤 소개서 생성 버튼을 누르면 최종 소개서와 PDF 저장 기능을 바로 사용할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

export default ResultCard;
