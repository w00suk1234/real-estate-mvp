import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";

function RecentBrochureList({ refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const { isAdmin } = useAuth();
  const pageSize = 5;

  const fetchBrochures = async () => {
    try {
      const data = await apiFetch("/brochures");
      setItems(data.items || []);
      setPage(1);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("해당 소개서를 삭제하시겠습니까?")) return;

    try {
      const data = await apiFetch(`/brochures/${id}`, {
        method: "DELETE",
      });

      if (!data.success) {
        alert(data.message || "삭제에 실패했습니다.");
        return;
      }

      fetchBrochures();
    } catch (error) {
      console.error(error);
      alert(error.message || "소개서 삭제 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    fetchBrochures();
  }, [refreshKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const goPrev = () => setPage((prev) => Math.max(1, prev - 1));
  const goNext = () => setPage((prev) => Math.min(totalPages, prev + 1));

  return (
    <section className="panel fill-panel">
      <div className="panel-head">
        <h3>최근 생성 소개서</h3>
        <p>최근에 만든 소개서를 다시 확인하고 삭제할 수 있습니다.</p>
      </div>

      <div className="recent-list recent-list-fixed">
        {pagedItems.length === 0 ? (
          <div className="empty-box">아직 생성된 소개서가 없습니다.</div>
        ) : (
          pagedItems.map((item) => (
            <div className="recent-item" key={item.id}>
              <div className="recent-main">
                <strong>{item.title}</strong>
                <span>{item.address}</span>
                <small>
                  {item.deal_type} · {item.price} · {item.created_at}
                </small>
              </div>

              <div className="recent-actions">
                <a
                  className="recent-open-btn"
                  href={item.brochure_url || `${API_BASE_URL}/outputs/${item.brochure_filename}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  열기
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => handleDelete(item.id)}
                  >
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="pagination-row">
        <button
          type="button"
          className="secondary-btn"
          onClick={goPrev}
          disabled={page === 1}
        >
          이전
        </button>

        <div className="pagination-info">
          {page} / {totalPages}
        </div>

        <button
          type="button"
          className="secondary-btn"
          onClick={goNext}
          disabled={page === totalPages}
        >
          다음
        </button>
      </div>
    </section>
  );
}

export default RecentBrochureList;
