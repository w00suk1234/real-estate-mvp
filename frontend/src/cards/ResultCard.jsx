import { buildShareMessage } from "../utils/brochure";

function ResultCard({ result, form }) {
  const hasResult = Boolean(result?.success);

  const handleOpenNewTab = () => {
    if (!hasResult) return;
    window.open(result.brochure_url, "_blank", "noreferrer");
  };

  const handlePrintBrochure = () => {
    if (!hasResult) return;

    const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
    if (!printWindow) {
      alert("팝업이 차단되었습니다. 새 창에서 열기 후 Ctrl + P를 사용해 주세요.");
      return;
    }

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const handleCopyShareText = async () => {
    if (!hasResult) return;

    const text = result.share_text || buildShareMessage(form, result.brochure_url);
    try {
      await navigator.clipboard.writeText(text);
      alert("카톡/문자용 문구를 복사했습니다.");
    } catch (error) {
      console.error(error);
      alert("문구 복사에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>생성 결과</h3>
        <p>{hasResult ? result.message : "소개서를 생성하면 여기에서 최종 결과와 전달용 액션을 확인할 수 있습니다."}</p>
      </div>

      {hasResult ? (
        <>
          <div className="result-action-row result-action-row-primary">
            <a href={result.brochure_url} target="_blank" rel="noreferrer" className="cta-btn inline-cta">
              최종 소개서 보기
            </a>
            <button type="button" className="secondary-btn" onClick={handleCopyShareText}>
              카톡 문구 복사
            </button>
            <button type="button" className="secondary-btn" onClick={handlePrintBrochure}>
              PDF / 인쇄
            </button>
          </div>

          <div className="result-links">
            <a href={result.image_url} target="_blank" rel="noreferrer">
              대표 이미지 보기
            </a>
            <button type="button" className="secondary-btn result-open-btn" onClick={handleOpenNewTab}>
              새 창에서 열기
            </button>
          </div>

          <div className="result-tip">
            고객 전달 전 가격, 관리비 포함 항목, 권리금 등 확인 필요 항목만 한 번 더 점검해 주세요.
          </div>

          <iframe className="result-frame" src={result.brochure_url} title="brochure-result" />
        </>
      ) : (
        <div className="empty-box result-empty-box">
          <strong>아직 최종 소개서가 없습니다.</strong>
          <p>매물 정보를 정리한 뒤 소개서 생성 버튼을 누르면 고객용 결과물을 바로 확인할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

export default ResultCard;

