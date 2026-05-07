import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { deleteBrochure, listBrochures } from "../services/supabaseRepository";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function RecentBrochureList({ refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const { isAuthenticated } = useAuth();
  const pageSize = 5;

  const fetchBrochures = async () => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }

    try {
      const data = await listBrochures();
      setItems(data || []);
      setPage(1);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 소개서를 삭제할까요?")) return;

    try {
      await deleteBrochure(id);
      fetchBrochures();
    } catch (error) {
      alert(error.message || "소개서 삭제 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    fetchBrochures();
  }, [refreshKey, isAuthenticated]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  return (
    <section className="surface-card fill-panel recent-brochure-panel">
      <div className="panel-head">
        <p>저장한 소개서를 다시 열 수 있습니다.</p>
      </div>

      <div className="recent-list recent-list-fixed">
        {pagedItems.length === 0 ? (
          <div className="empty-box recent-empty-box">
            {isAuthenticated ? "아직 생성한 소개서가 없습니다." : "로그인하면 저장한 소개서 목록을 볼 수 있습니다."}
          </div>
        ) : (
          pagedItems.map((item) => (
            <div className="recent-item" key={item.id}>
              <div className="recent-main">
                <strong className="recent-title" title={item.title}>
                  {item.title || "제목 없는 소개서"}
                </strong>
                <span className="recent-address" title={item.address}>
                  {item.address || "주소 확인 필요"}
                </span>
                <small>
                  {item.deal_type || "거래유형"} · {item.price_summary || item.price || "금액 확인 필요"} · {formatDate(item.created_at)}
                </small>
              </div>

              <div className="recent-actions">
                {item.brochure_url ? (
                  <a className="recent-open-btn" href={item.brochure_url} target="_blank" rel="noreferrer">
                    열기
                  </a>
                ) : (
                  <button type="button" className="secondary-btn small-btn" disabled>
                    열기
                  </button>
                )}
                {isAuthenticated ? (
                  <button type="button" className="danger-btn" onClick={() => handleDelete(item.id)}>
                    삭제
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="pagination-row">
        <button type="button" className="secondary-btn" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1}>
          이전
        </button>

        <div className="pagination-info">
          {page} / {totalPages}
        </div>

        <button type="button" className="secondary-btn" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page === totalPages}>
          다음
        </button>
      </div>
    </section>
  );
}

export default RecentBrochureList;
