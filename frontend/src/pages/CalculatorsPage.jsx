import { useMemo, useState } from "react";
import PageShell from "../components/layout/PageShell";

function CalculatorsPage({ setPage }) {
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("0.4");

  const [rent, setRent] = useState("");
  const [days, setDays] = useState("");
  const [mode, setMode] = useState("30");

  const brokerageFee = useMemo(() => {
    const p = Number(price || 0);
    const r = Number(rate || 0);
    return ((p * r) / 100).toLocaleString();
  }, [price, rate]);

  const dailyRent = useMemo(() => {
    const r = Number(rent || 0);
    const d = Number(days || 0);
    const divisor = mode === "30" ? 30 : 365;
    return Math.round((r / divisor) * d).toLocaleString();
  }, [rent, days, mode]);

  return (
    <PageShell page="calculators" setPage={setPage}>
      <div className="page-header">
        <p className="page-badge">계산기</p>
        <h1>계산기</h1>
        <p className="page-desc">중개보수와 임대료 일할 계산</p>
      </div>

      <div className="customer-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>중개보수 계산기</h3>
            <p>거래금액과 요율을 입력해 계산합니다.</p>
          </div>

          <div className="form-box">
            <div className="field">
              <label>거래금액</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="예: 300000000"
              />
            </div>

            <div className="field">
              <label>요율 (%)</label>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="예: 0.4"
              />
            </div>

            <div className="calc-result-box">
              계산 결과: <strong>{brokerageFee} 원</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>임대료 일할 계산기</h3>
            <p>30일법 / 365일법을 지원합니다.</p>
          </div>

          <div className="form-box">
            <div className="field">
              <label>월 임대료</label>
              <input
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                placeholder="예: 1000000"
              />
            </div>

            <div className="field">
              <label>일수</label>
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="예: 12"
              />
            </div>

            <div className="field">
              <label>계산 방식</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="30">30일법</option>
                <option value="365">365일법</option>
              </select>
            </div>

            <div className="calc-result-box">
              계산 결과: <strong>{dailyRent} 원</strong>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export default CalculatorsPage;