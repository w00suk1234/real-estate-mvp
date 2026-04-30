import { useMemo, useState } from "react";

function CalculatorsPage() {
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("0.4");
  const [rent, setRent] = useState("");
  const [days, setDays] = useState("");
  const [mode, setMode] = useState("30");

  const brokerageFee = useMemo(() => {
    const p = Number(price || 0);
    const r = Number(rate || 0);
    return Math.round((p * r) / 100).toLocaleString();
  }, [price, rate]);

  const dailyRent = useMemo(() => {
    const r = Number(rent || 0);
    const d = Number(days || 0);
    const divisor = mode === "30" ? 30 : 365;
    return Math.round((r / divisor) * d).toLocaleString();
  }, [rent, days, mode]);

  return (
    <div className="page-stack page-narrow">
      <section className="page-header-card">
        <span className="section-eyebrow">계산기</span>
        <h1>계산기</h1>
        <p>중개보수와 임대료 일할 계산을 빠르게 확인합니다.</p>
      </section>

      <section className="tool-grid">
        <div className="panel tool-card">
          <div className="panel-head">
            <h3>중개보수 계산기</h3>
            <p>거래금액과 요율을 입력해 예상 중개보수를 계산합니다.</p>
          </div>

          <div className="form-box">
            <label className="field">
              <span>거래금액</span>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="예: 300000000"
                inputMode="numeric"
              />
            </label>

            <label className="field">
              <span>요율 (%)</span>
              <input
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                placeholder="예: 0.4"
                inputMode="decimal"
              />
            </label>

            <div className="calc-result-box">
              계산 결과 <strong>{brokerageFee} 원</strong>
            </div>
          </div>
        </div>

        <div className="panel tool-card">
          <div className="panel-head">
            <h3>임대료 일할 계산기</h3>
            <p>30일법과 365일법 기준의 임대료를 계산합니다.</p>
          </div>

          <div className="form-box">
            <label className="field">
              <span>월 임대료</span>
              <input
                value={rent}
                onChange={(event) => setRent(event.target.value)}
                placeholder="예: 1000000"
                inputMode="numeric"
              />
            </label>

            <label className="field">
              <span>일수</span>
              <input
                value={days}
                onChange={(event) => setDays(event.target.value)}
                placeholder="예: 12"
                inputMode="numeric"
              />
            </label>

            <label className="field">
              <span>계산 방식</span>
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="30">30일법</option>
                <option value="365">365일법</option>
              </select>
            </label>

            <div className="calc-result-box">
              계산 결과 <strong>{dailyRent} 원</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CalculatorsPage;
