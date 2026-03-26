import type { SystemStatusType } from "../hooks/useLiveConveyor";

function Dot({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#fff",
        marginRight: 6,
        opacity: on ? 1 : 0.5,
        boxShadow: on ? "0 0 6px rgba(255,255,255,0.8)" : undefined,
      }}
    />
  );
}

function Pill({
  ok,
  label,
  message,
  muted,
}: {
  ok: boolean;
  label: string;
  message: string;
  muted?: boolean;
}) {
  const bg = muted ? "#666" : ok ? "#27ae60" : "#e74c3c";
  return (
    <span
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        background: bg,
        color: "#fff",
        fontWeight: 500,
        transition: "all 0.3s ease",
        fontSize: "0.9em",
      }}
    >
      <Dot on={ok} />
      {label}: {message}
    </span>
  );
}

export function StatusBar({ status }: { status: SystemStatusType | null }) {
  if (!status) {
    return (
      <div
        id="status-indicators"
        style={{ display: "flex", gap: 12, alignItems: "center", fontSize: "0.9em", flexWrap: "wrap" }}
      >
        <Pill ok={false} label="PLC" message="Checking..." muted />
        <Pill ok={false} label="Scanner" message="Checking..." muted />
        <Pill ok={false} label="Photo Eye" message="Checking..." muted />
      </div>
    );
  }

  const plc = status.plc || {};
  const scanner = status.scanner || {};
  const photo = status.photo_eye || {};

  return (
    <div
      id="status-indicators"
      style={{ display: "flex", gap: 12, alignItems: "center", fontSize: "0.9em", flexWrap: "wrap" }}
    >
      <Pill
        ok={Boolean(plc.connected)}
        label="PLC"
        message={plc.connected ? plc.message || "" : plc.message || "Unknown"}
      />
      <Pill
        ok={Boolean(scanner.connected)}
        label="Scanner"
        message={scanner.connected ? scanner.message || "" : scanner.message || "Unknown"}
      />
      <Pill
        ok={Boolean(photo.connected)}
        label="Photo Eye"
        message={photo.connected ? photo.message || "" : photo.message || "Unknown"}
      />
    </div>
  );
}
