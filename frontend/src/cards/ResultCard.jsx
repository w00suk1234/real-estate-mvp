function ResultCard({ result }) {
  const hasResult = result && result.success;

  const handleOpenNewTab = () => {
    if (!hasResult) return;
    window.open(result.brochure_url, "_blank", "noreferrer");
  };

  const handlePrintBrochure = () => {
    if (!hasResult) return;

    const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
    if (!printWindow) {
      alert("팝업이 차단되었습니다. 새 창에서 열기 후 Ctrl + P를 사용해주세요.");
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
            : "소개서를 생성하면 여기에서 결과를 확인할 수 있습니다."}
        </p>
      </div>

      {hasResult ? (
        <>
          <div className="result-links">
            <a href={result.image_url} target="_blank" rel="noreferrer">
              업로드 이미지 보기
            </a>
            <a href={result.brochure_url} target="_blank" rel="noreferrer">
              소개서 결과 보기
            </a>
          </div>

          <div className="result-action-row">
            <button type="button" className="secondary-btn" onClick={handleOpenNewTab}>
              새 창에서 열기
            </button>
            <button type="button" className="cta-btn result-print-btn" onClick={handlePrintBrochure}>
              인쇄 / PDF 저장
            </button>
          </div>

          <div className="result-tip">
            팝업이 차단되면 <strong>새 창에서 열기</strong> 후 <strong>Ctrl + P</strong>로
            PDF 저장하면 됩니다.
          </div>

          <iframe
            className="result-frame"
            src={result.brochure_url}
            title="brochure-result"
          />
        </>
      ) : (
        <div className="empty-box" style={{ minHeight: "280px", display: "grid", placeItems: "center" }}>
          아직 생성된 결과가 없습니다.
        </div>
      )}
    </section>
  );
}

export default ResultCard;