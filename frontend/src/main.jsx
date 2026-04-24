import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "32px",
            background: "#f4f7fb",
            color: "#0f172a",
            fontFamily:
              "Pretendard, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              border: "1px solid #dbe4f0",
              borderRadius: "18px",
              padding: "28px",
              boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
            }}
          >
            <strong style={{ display: "block", fontSize: "20px", marginBottom: "10px" }}>
              매물 불러오기 화면을 다시 준비하는 중입니다
            </strong>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#475569" }}>
              세부 사진이 많은 매물에서 일시적으로 화면이 멈출 수 있어 방어 처리를 넣고 있습니다.
              새로고침 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: "18px",
                border: 0,
                borderRadius: "12px",
                background: "#1558b0",
                color: "#fff",
                padding: "12px 18px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
