import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#120f10",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#6f1728",
          border: "2px solid #b86273",
          color: "#fff7ed",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          fontSize: 27,
          fontWeight: 700,
          height: 48,
          justifyContent: "center",
          letterSpacing: "-2px",
          lineHeight: 1,
          width: 48,
        }}
      >
        IB
      </div>
    </div>,
    size,
  );
}
