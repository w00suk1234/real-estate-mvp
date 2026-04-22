import { useEffect, useRef, useState } from "react";
import PageShell from "../components/layout/PageShell";

function PhotoEditorPage({ setPage }) {
  const canvasRef = useRef(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [stampSrc, setStampSrc] = useState(null);
  const [brightness, setBrightness] = useState(100);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(28);

  useEffect(() => {
    drawCanvas();
  }, [imageSrc, stampSrc, brightness, text, fontSize]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!imageSrc) {
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#64748b";
      ctx.font = "20px Arial";
      ctx.fillText("이미지를 업로드하세요", 40, 60);
      return;
    }

    const baseImage = new Image();
    baseImage.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = `brightness(${brightness}%)`;
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      if (text) {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.strokeText(text, 30, canvas.height - 40);
        ctx.fillText(text, 30, canvas.height - 40);
      }

      if (stampSrc) {
        const stampImage = new Image();
        stampImage.onload = () => {
          ctx.drawImage(
            stampImage,
            canvas.width - 140,
            canvas.height - 140,
            100,
            100
          );
        };
        stampImage.src = stampSrc;
      }
    };
    baseImage.src = imageSrc;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageSrc(URL.createObjectURL(file));
  };

  const handleStampUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStampSrc(URL.createObjectURL(file));
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "edited_image.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <PageShell page="photo-editor" setPage={setPage}>
      <div className="page-header">
        <p className="page-badge">사진 편집기</p>
        <h1>사진 편집기</h1>
        <p className="page-desc">밝기, 문구, 도장 합성 1차 버전</p>
      </div>

      <div className="customer-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>편집 옵션</h3>
            <p>대표 이미지를 간단히 보정합니다.</p>
          </div>

          <div className="form-box">
            <div className="field">
              <label>원본 이미지</label>
              <input type="file" accept="image/*" onChange={handleImageUpload} />
            </div>

            <div className="field">
              <label>도장 이미지</label>
              <input type="file" accept="image/*" onChange={handleStampUpload} />
            </div>

            <div className="field">
              <label>밝기 ({brightness}%)</label>
              <input
                type="range"
                min="50"
                max="150"
                value={brightness}
                onChange={(e) => setBrightness(e.target.value)}
              />
            </div>

            <div className="field">
              <label>문구</label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="예: 추천 매물"
              />
            </div>

            <div className="field">
              <label>문구 크기</label>
              <input
                type="range"
                min="16"
                max="48"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
              />
            </div>

            <button className="cta-btn" type="button" onClick={handleDownload}>
              편집 이미지 저장
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>미리보기</h3>
            <p>간단한 편집 결과를 바로 확인합니다.</p>
          </div>

          <canvas
            ref={canvasRef}
            width={700}
            height={500}
            className="editor-canvas"
          />
        </section>
      </div>
    </PageShell>
  );
}

export default PhotoEditorPage;