import type { TrackedItem } from "../hooks/useLiveConveyor";

function rowStyles(status: string) {
  let statusColor = "#f39c12";
  let statusBg = "rgba(243, 156, 18, 0.1)";
  if (status === "progress") {
    statusColor = "#27ae60";
    statusBg = "rgba(39, 174, 96, 0.1)";
  } else if (status === "routing" || status === "completed") {
    statusColor = "#3498db";
    statusBg = "rgba(52, 152, 219, 0.1)";
  } else if (status === "No response") {
    statusColor = "#e74c3c";
    statusBg = "rgba(231, 76, 60, 0.1)";
  } else {
    statusColor = "#f39c12";
    statusBg = "rgba(243, 156, 18, 0.1)";
  }
  return { statusColor, statusBg };
}

function formatPositionCm(item: TrackedItem, beltSpeedCmPerSec: number): string {
  if (item.positionCm !== undefined && item.positionCm !== null) {
    return `${parseFloat(String(item.positionCm)).toFixed(1)} cm`;
  }
  if (item.start_time && item.status === "fetching" && item.positionId) {
    const startTime =
      typeof item.start_time === "string" ? parseFloat(item.start_time) : Number(item.start_time);
    const currentTime = Date.now() / 1000;
    const elapsed = currentTime - startTime;
    if (elapsed >= 0) {
      return `${(elapsed * beltSpeedCmPerSec).toFixed(1)} cm`;
    }
  }
  return "0.0 cm";
}

const card =
  "w-full shrink-0 p-3 rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/[0.75] overflow-hidden flex flex-col";

export function ActiveItemsTable({
  items,
  beltSpeedCmPerSec = 32.1,
}: {
  items: TrackedItem[];
  beltSpeedCmPerSec?: number;
}) {
  const ordered = items.slice().reverse();

  return (
    <div className={card}>
      <label className="mb-2 block text-[0.9rem] font-semibold uppercase tracking-wide text-[#6c7282]">
        📊 Active Items (Live)
      </label>
      <div className="overflow-x-auto">
        <table id="active-items-table" className="w-full border-collapse text-[1.1em]">
          <thead>
            <tr className="border-b-2 border-[rgba(26,29,35,0.08)] bg-[rgba(58,122,254,0.1)]">
              {["Barcode", "Label", "Status", "Position ID", "Position (cm)", "Distance (cm)", "Pusher", "Created At"].map(
                (h) => (
                  <th key={h} className="p-2.5 text-left font-semibold text-[#6c7282]">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody id="active-items-tbody">
            {ordered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-3 text-center text-[1.1em] italic text-[#6c7282]">
                  Waiting for items...
                </td>
              </tr>
            ) : (
              ordered.map((item) => {
                const barcode = item.barcode;
                const status = item.status || "pending";
                const { statusColor, statusBg } = rowStyles(status);
                const distance =
                  item.distance !== undefined && item.distance !== null
                    ? `${Number(item.distance).toFixed(1)} cm`
                    : "N/A";
                const label = item.label != null ? String(item.label) : "N/A";
                const pusher = item.pusher != null ? String(item.pusher) : "N/A";
                const timeStr = item.created_at || new Date().toLocaleTimeString();
                const posId =
                  item.positionId !== undefined && item.positionId !== null ? String(item.positionId) : "N/A";

                return (
                  <tr
                    key={barcode}
                    data-barcode={barcode}
                    className="border-b border-[rgba(26,29,35,0.08)] transition-[background,opacity] duration-200 hover:bg-[rgba(58,122,254,0.05)]"
                  >
                    <td className="p-2.5 font-mono text-[1.1em] font-semibold">{barcode}</td>
                    <td className="p-2.5">
                      <span className="rounded px-2 py-1 text-[1.1em] font-semibold text-[#3a7afe] bg-[rgba(58,122,254,0.1)]">
                        {label}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span
                        className="rounded px-2 py-1 text-[1.1em] font-semibold"
                        style={{ background: statusBg, color: statusColor }}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-[1.1em] font-semibold text-[#3a7afe]">{posId}</td>
                    <td
                      className="p-2.5 font-mono text-[1.1em] font-semibold text-[#3a7afe]"
                      data-position-id={item.positionId ?? ""}
                    >
                      {formatPositionCm(item, beltSpeedCmPerSec)}
                    </td>
                    <td className="p-2.5 font-mono text-[1.1em] font-semibold text-[#3a7afe]">{distance}</td>
                    <td className="p-2.5">
                      <span className="rounded px-2 py-1 text-[1.1em] font-semibold bg-[rgba(255,193,7,0.2)]">
                        {pusher}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-[1.1em] text-[#6c7282]">{timeStr}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-base text-[#6c7282]">
        <span id="items-count">{items.length}</span> active item(s) • Updates from server / worker
      </div>
    </div>
  );
}
