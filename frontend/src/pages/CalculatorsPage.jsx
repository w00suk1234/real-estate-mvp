import { useMemo, useState } from "react";
import { calculateBrokerageRateRows, formatManwon, formatWon, parsePositiveNumber } from "../utils/calculators";

function CalculatorsPage() {
  const [deposit, setDeposit] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");

  const calculation = useMemo(
    () => calculateBrokerageRateRows({ deposit, monthlyRent }),
    [deposit, monthlyRent],
  );

  const resetBrokerage = () => {
    setDeposit("");
    setMonthlyRent("");
  };

  const handleMoneyInput = (setter) => (event) => {
    const value = parsePositiveNumber(event.target.value);
    setter(value ? String(value) : "");
  };

  return (
    <div className="page-stack support-workspace calculator-workspace">
      <section className="page-header-card support-header">
        <div>
          <span className="section-eyebrow">계산기</span>
          <h1>계산기</h1>
          <p>중개 업무에 필요한 금액을 빠르게 계산합니다.</p>
        </div>
      </section>

      <section className="calculator-tab-row" aria-label="계산기 종류">
        <span className="active">중개보수 계산</span>
        <span>취득세 · 준비 중</span>
        <span>면적 변환 · 준비 중</span>
      </section>

      <section className="tool-grid calculator-grid calculator-grid-single">
        <div className="panel tool-card support-card calculator-tool-card brokerage-calculator-card">
          <div className="panel-head support-card-heading">
            <h3>중개보수 계산기</h3>
            <p>요율별 중개보수 금액을 한 번에 비교할 수 있는 참고 계산표입니다.</p>
          </div>

          <div className="form-box">
            <div className="field-grid two">
              <label className="field">
                <span>보증금 (만원)</span>
                <input
                  value={deposit}
                  onChange={handleMoneyInput(setDeposit)}
                  placeholder="예: 1000"
                  inputMode="numeric"
                />
              </label>

              <label className="field">
                <span>월세 (만원)</span>
                <input
                  value={monthlyRent}
                  onChange={handleMoneyInput(setMonthlyRent)}
                  placeholder="예: 50"
                  inputMode="numeric"
                />
              </label>
            </div>

            <div className="brokerage-summary-grid">
              <div className="calc-result-box calc-result-card">
                <span>환산 거래금액</span>
                <strong>{formatManwon(calculation.convertedAmount)}</strong>
                <small>{calculation.formula}</small>
              </div>
              <div className="calc-result-box calc-result-card">
                <span>70배 재계산</span>
                <strong>{calculation.usesSeventyMultiplier ? "적용" : "미적용"}</strong>
                <small>
                  기본 환산금액 {formatManwon(calculation.baseAmount)}
                  {calculation.usesSeventyMultiplier ? "이 5,000만원 미만입니다." : " 기준입니다."}
                </small>
              </div>
            </div>

            <div className="brokerage-helper">
              실제 중개보수는 법정 상한요율 및 협의 요율에 따라 달라질 수 있습니다. 부가세는 10% 기준으로 계산됩니다.
            </div>

            <div className="brokerage-rate-table-wrap">
              <table className="brokerage-rate-table">
                <thead>
                  <tr>
                    <th>요율</th>
                    <th>중개보수</th>
                    <th>부가세</th>
                    <th>부가세 포함</th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.rows.map((row) => (
                    <tr key={row.rate}>
                      <td>{row.rate.toFixed(1)}%</td>
                      <td>{formatWon(row.brokerageFee)}</td>
                      <td>{formatWon(row.vat)}</td>
                      <td><strong>{formatWon(row.totalWithVat)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="support-action-row">
              <button type="button" className="secondary-btn" onClick={resetBrokerage}>
                입력 초기화
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CalculatorsPage;
