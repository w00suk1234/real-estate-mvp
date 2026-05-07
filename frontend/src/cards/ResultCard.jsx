function ResultCard({ result, onOpenFinal, onDownloadPdf, onPrint, onOpenNewTab, pdfLoading }) {
  if (!result?.success) {
    return (
      <section className="surface-card result-card-v2">
        <div className="panel-head">
          <p>소개서를 생성하면 PDF 저장과 인쇄 기능을 바로 사용할 수 있습니다.</p>
        </div>
        <div className="empty-state dashed-empty">
          <strong>아직 최종 소개서가 없습니다.</strong>
          <span>미리보기를 확인한 뒤 소개서 생성 버튼을 눌러 주세요.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-card result-card-v2 result-ready-card">
      <div className="panel-head">
        <p>고객에게 전달할 소개서를 PDF와 인쇄 형태로 정리할 수 있습니다.</p>
      </div>

      <div className="result-action-grid">
        <button type="button" className="primary-btn" onClick={onOpenFinal}>최종 소개서 보기</button>
        <button type="button" className="cta-btn" onClick={onDownloadPdf} disabled={pdfLoading}>{pdfLoading ? "PDF 생성 중" : "PDF 다운로드"}</button>
        <button type="button" className="secondary-btn" onClick={onPrint}>인쇄</button>
        <button type="button" className="secondary-btn" onClick={onOpenNewTab}>새 창에서 열기</button>
      </div>

      <div className="result-note-box">
        고객 전달용 PDF에는 입력 폼, 내부 수집 결과, 계정 정보, 버튼이 포함되지 않습니다.
      </div>
    </section>
  );
}

export default ResultCard;
