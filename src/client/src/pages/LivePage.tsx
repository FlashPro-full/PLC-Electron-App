import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ConveyorSystem3D } from "../conveyor/ConveyorSystem3D";
import { ActiveItemsTable } from "../components/ActiveItemsTable";
import { StatusBar } from "../components/StatusBar";
import {
  useLiveConveyor,
  type BeltSettingsType,
  type SystemStatusType,
} from "../hooks/useLiveConveyor";

export function LivePage() {
  const [beltSettings, setBeltSettings] = useState<BeltSettingsType | null>(null);
  const { items } = useLiveConveyor(beltSettings);
  const [systemStatus, setSystemStatus] = useState<SystemStatusType | null>(null);
  const conveyorRef = useRef<ConveyorSystem3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let initial: BeltSettingsType | undefined;
      try {
        const res = await axios.get("/api/notify");
        if (!cancelled && res.data.result) {
          setSystemStatus(res.data.status);
          if (res.data.settings) {
            setBeltSettings(res.data.settings);
            initial = res.data.settings;
          }
        }
      } catch (err: unknown) {
        console.error("Notification error:", err);
      }
      await new Promise((r) => setTimeout(r, 200));
      if (cancelled) return;
      try {
        conveyorRef.current = new ConveyorSystem3D("conveyor3d", initial);
      } catch (err: unknown) {
        console.error("Conveyor system error:", err);
      }
    };
    run();
    return () => {
      cancelled = true;
      conveyorRef.current?.destroy();
      conveyorRef.current = null;
    };
  }, []);

  return (
    <main className="w-full h-screen max-w-full p-4 max-md:w-[95%] max-md:p-6 bg-white/90 shadow-[0_25px_60px_rgba(58,122,254,0.18)] border border-[rgba(26,29,35,0.08)] grid grid-rows-[auto_1fr_auto] gap-3 overflow-hidden max-md:[&_button]:w-full">
      <header className="flex justify-between items-center max-md:flex-col max-md:items-start max-md:gap-3">
        <h1 className="m-0 text-[clamp(1.6rem,2vw+1rem,2.3rem)] font-semibold">🎮 Live Conveyor System</h1>
        <div className="flex gap-3 max-md:w-full max-md:justify-start max-md:gap-4">
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 py-2.5 px-[18px] font-semibold text-[0.95rem] rounded-xl no-underline transition-all duration-200 border-2 border-[rgba(58,122,254,0.35)] text-[#1a1d23] bg-[rgba(58,122,254,0.12)] hover:bg-[rgba(58,122,254,0.2)] hover:border-[#3a7afe] hover:text-[#3a7afe] hover:-translate-y-px"
            title="Configure bucket distances and belt speed"
          >
            <span className="text-[1.1em] leading-none" aria-hidden="true">
              ⚙️
            </span>
            <span>Settings</span>
          </Link>
          <StatusBar status={systemStatus} />
        </div>
      </header>

      <section className="flex flex-col gap-3 overflow-y-auto h-full">
        <div className="w-full shrink-0 p-3 rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/[0.75] overflow-hidden flex flex-col min-h-0">
          <label className="mb-2 block text-[0.9rem] font-semibold uppercase tracking-wide text-[#6c7282]">
            3D Conveyor System (Live)
          </label>
          <div
            id="conveyor3d"
            className="relative mx-auto w-[95%] h-[600px] min-h-[600px] overflow-hidden rounded-lg bg-[#1a1a1a] [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
          >
            <div
              id="conveyor3d-loading"
              className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-center text-white"
            >
              <div>Loading 3D visualization...</div>
              <div className="mt-2.5 text-[0.8em] text-[#aaa]">
                If this doesn&apos;t load, check the developer console (F12)
              </div>
            </div>
          </div>
        </div>
        <ActiveItemsTable
          items={items}
          beltSpeedCmPerSec={
            beltSettings?.belt_speed != null && Number(beltSettings.belt_speed) > 0
              ? Number(beltSettings.belt_speed)
              : 32.1
          }
        />
      </section>
    </main>
  );
}
