import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import axios from "axios";
import { useToast } from "../contexts/ToastContext";
import { PUSHER_LABEL_OPTIONS, PUSHER_NAMES } from "../utils/constants";

type PusherConfig = { label: string; distance: number };

type TabId = "bucket-distance" | "belt-speed" | "photo-scanner-distance";

const tabInactive = "border-transparent bg-transparent text-[#6c7282] hover:bg-[rgba(58,122,254,0.08)] hover:text-[#1a1d23]";
const tabActive = "border-b-[#3a7afe] bg-[rgba(58,122,254,0.06)] text-[#3a7afe]";

export function SettingsPage() {
  const { showToast } = useToast();
  
  const [tab, setTab] = useState<TabId>("bucket-distance");
  const [pushers, setPushers] = useState<Record<string, PusherConfig>>(() =>
    Object.fromEntries(PUSHER_NAMES.map((n) => [n, { label: "None", distance: 0 }]))
  );
  const [beltSpeed, setBeltSpeed] = useState("");
  const [photoEyeScannerCm, setPhotoEyeScannerCm] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get("/api/settings");
        if (res.data.result) {
          setPushers(res.data.settings.pushers);
          setBeltSpeed(String(res.data.settings.belt_speed ?? ""));
          const d = res.data.settings.distance;
          setPhotoEyeScannerCm(d != null && d !== "" ? String(d) : "");
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();
  }, []);

  const updatePusher = (name: string, field: keyof PusherConfig, value: string | number) => {
    setPushers((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: field === "distance" ? Number(value) : String(value),
      },
    }));
  };

  const onSavePushers = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const res = await axios.put("/api/settings/pushers", { pushers });
      if (res.data.result) {
        showToast("Updated Successfully", { type: "success"});  
      }
    } catch (err: any) {
      showToast(err.renponse.data.error || "Failed to update", { type: "error"});
    }
  };

  const onSaveBelt = async (e: FormEvent) => {
    e.preventDefault();
    const speed = parseFloat(beltSpeed);
    if (Number.isNaN(speed) || speed <= 0) {
      showToast("Speed is invalid value", { type: "warning"});
      return;
    }
    
    try {
      const res = await axios.put("/api/settings/belt-speed", { speed: Number(beltSpeed) });
      if (res.data.result) {
        showToast("Updated Successfully", { type: "success"});
      }
    } catch (err: any) {
      showToast(err.response.data.error || "Failed to update", { type: "error" });
    }
    
  };

  const onSavePhotoScannerDistance = async (e: FormEvent) => {
    e.preventDefault();
    const cm = parseFloat(photoEyeScannerCm);
    if (Number.isNaN(cm) || cm < 0) {
      showToast("Distance must be a non-negative number (cm)", { type: "warning" });
      return;
    }
    try {
      const res = await axios.put("/api/settings/distance", { distance: cm });
      if (res.data.result) {
        showToast("Updated Successfully", { type: "success" });
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      showToast(msg || "Failed to update", { type: "error" });
    }
  };

  const triggerPusher = useCallback(async (n: number) => {
    try {
      const res = await axios.post("/api/settings/trigger", { pusher: n });
      if (res.data.result) {
        showToast(`Trigger Pusher ${n} successfully`, { type: "success" });
      } else {
        showToast(`Pusher ${n} is not triggered`, { type: "warning" });
      }
    } catch (err: any) {
      showToast(err.response.data.error || "Failed to update", { type: "error"});
    }
  }, []);

  return (
    <main className="w-full h-screen max-w-full p-4 max-md:w-[95%] max-md:p-6 bg-white/90 shadow-[0_25px_60px_rgba(58,122,254,0.18)] border border-[rgba(26,29,35,0.08)] grid grid-rows-[auto_1fr_auto] gap-3 overflow-hidden max-md:[&_button]:w-full">
      <header className="flex justify-between items-center max-md:flex-col max-md:items-start max-md:gap-3">
        <h1 className="m-0 text-[clamp(1.6rem,2vw+1rem,2.3rem)] font-semibold">Settings</h1>
        <div className="flex gap-3 max-md:w-full max-md:justify-start max-md:gap-4">
          <Link
            to="/live"
            className="inline-flex items-center gap-2 py-2.5 px-[18px] font-semibold text-[0.95rem] rounded-xl no-underline transition-all duration-200 border-2 border-[rgba(58,122,254,0.4)] text-[#3a7afe] bg-transparent hover:bg-[rgba(58,122,254,0.1)] hover:border-[#3a7afe] hover:-translate-y-px"
            title="Return to live conveyor view"
          >
            <span className="text-[1.1em] leading-none" aria-hidden="true">
              ←
            </span>
            <span>Back to Live System</span>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex shrink-0 gap-1 border-b-2 border-[rgba(26,29,35,0.08)] pb-0" role="tablist">
          <button
            type="button"
            className={`-mb-0.5 cursor-pointer rounded-t-[10px] border-0 border-b-[3px] px-5 py-3 text-base font-semibold transition-all
                        ${tab === "bucket-distance" ? tabActive : tabInactive}`}
            role="tab"
            aria-selected={tab === "bucket-distance"}
            onClick={() => setTab("bucket-distance")}
          >
            Bucket distance
          </button>
          <button
            type="button"
            className={`-mb-0.5 cursor-pointer rounded-t-[10px] border-0 border-b-[3px] px-5 py-3 text-base font-semibold transition-all
                        ${tab === "belt-speed" ? tabActive : tabInactive}`}
            role="tab"
            aria-selected={tab === "belt-speed"}
            onClick={() => setTab("belt-speed")}
          >
            Belt speed
          </button>
          <button
            type="button"
            className={`-mb-0.5 cursor-pointer rounded-t-[10px] border-0 border-b-[3px] px-5 py-3 text-base font-semibold transition-all
                        ${tab === "photo-scanner-distance" ? tabActive : tabInactive}`}
            role="tab"
            aria-selected={tab === "photo-scanner-distance"}
            onClick={() => setTab("photo-scanner-distance")}
          >
            Eye → scanner
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            id="tab-bucket-distance"
            className={tab !== "bucket-distance" ? "hidden" : "block pb-6"}
            role="tabpanel"
            aria-hidden={tab !== "bucket-distance"}
          >
            <form id="settingsForm" className="flex flex-col gap-4" onSubmit={onSavePushers}>
              <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/[0.75] p-3 mb-7">
                <p className="m-0 text-[0.95rem] text-[#6c7282]">
                  Map PureScan labels to conveyor pushers and set travel distance (cm) per pusher. Written to PLC
                  DF2–DF9.
                </p>
              </div>

              <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/[0.75] p-3 mb-4">
                <p className="mb-3 mt-0 text-[0.95rem] text-[#6c7282]">Trigger pushers (test)</p>
                <div className="flex flex-wrap gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="cursor-pointer rounded-xl border-2 border-[rgba(58,122,254,0.35)] bg-[rgba(58,122,254,0.12)] px-4 py-2.5 text-[0.95rem] font-semibold text-[#1a1d23] transition-all hover:-translate-y-px hover:border-[#3a7afe] hover:bg-[rgba(58,122,254,0.2)] hover:text-[#3a7afe]"
                      onClick={() => triggerPusher(n)}
                    >
                      Pusher {n}
                    </button>
                  ))}
                </div>
              </div>

              <div id="pusherSettings" className="grid grid-cols-3 gap-[18px] max-md:grid-cols-1">
                {PUSHER_NAMES.map((name) => (
                  <fieldset key={name} className="grid gap-3 rounded-2xl border border-[rgba(26,29,35,0.06)] bg-white/90 px-5 py-[18px]">
                    <legend className="mb-1 px-1 text-base font-semibold text-[#1a1d23]">{name}</legend>
                    <div className="grid gap-1.5">
                      <label htmlFor={`${name}_label`} className="text-[0.9rem] font-semibold uppercase tracking-wide text-[#6c7282]">
                        Label
                      </label>
                      <select
                        id={`${name}_label`}
                        className="box-border w-full rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/60 px-4 py-3.5 text-base text-[#1a1d23] transition-all focus:border-[rgba(58,122,254,0.6)] focus:shadow-[0_0_0_4px_rgba(58,122,254,0.15)] focus:outline-none mt-1.5"
                        value={pushers[name]?.label ?? "None"}
                        onChange={(e) => updatePusher(name, "label", e.target.value)}
                        required
                      >
                        {PUSHER_LABEL_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor={`${name}_distance`} className="text-[0.9rem] font-semibold uppercase tracking-wide text-[#6c7282]">
                        Distance (cm)
                      </label>
                      <input
                        type="number"
                        step={0.001}
                        id={`${name}_distance`}
                        className="box-border w-full rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/60 px-4 py-3.5 text-base text-[#1a1d23] transition-all focus:border-[rgba(58,122,254,0.6)] focus:shadow-[0_0_0_4px_rgba(58,122,254,0.15)] focus:outline-none mt-1.5"
                        value={pushers[name]?.distance ?? ""}
                        onChange={(e) => updatePusher(name, "distance", e.target.value)}
                        required
                      />
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="flex justify-end">
                <button type="submit" className="cursor-pointer rounded-[14px] border-0 bg-[#3a7afe] px-5 py-3.5 text-base font-semibold text-white shadow-[0_12px_20px_rgba(58,122,254,0.22)] transition-all hover:-translate-y-px hover:bg-[#2e63d4] active:translate-y-0 max-md:w-full">
                  <Save className="w-5 h-5 inline-block mr-1 -mt-0.75" />Save
                </button>
              </div>
            </form>
          </div>

          <div
            id="tab-belt-speed"
            className={tab !== "belt-speed" ? "hidden" : "block pb-6"}
            role="tabpanel"
            aria-hidden={tab !== "belt-speed"}
          >
            <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/[0.75] p-3 max-w-[480px]">
              <p className="mb-4 mt-0 text-[0.95rem] text-[#6c7282]">
                Conveyor belt speed (PLC <strong>DF20 – Speed</strong>). Used for timing; unit matches ladder (e.g.
                cm/s).
              </p>
              <form id="beltSpeedForm" className="grid gap-1.5 gap-3" onSubmit={onSaveBelt}>
                <label htmlFor="beltSpeedInput" className="text-[0.9rem] font-semibold uppercase tracking-wide text-[#6c7282]">
                  Speed
                </label>
                <input
                  type="number"
                  step={0.01}
                  min={0.1}
                  id="beltSpeedInput"
                  name="speed"
                  placeholder="e.g. 32.1"
                  className="box-border w-full rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/60 px-4 py-3.5 text-base text-[#1a1d23] transition-all focus:border-[rgba(58,122,254,0.6)] focus:shadow-[0_0_0_4px_rgba(58,122,254,0.15)] focus:outline-none"
                  value={beltSpeed}
                  onChange={(e) => setBeltSpeed(e.target.value)}
                  required
                />
                <div className="flex justify-end mt-2">
                  <button type="submit" className="cursor-pointer rounded-[14px] border-0 bg-[#3a7afe] px-5 py-3.5 text-base font-semibold text-white shadow-[0_12px_20px_rgba(58,122,254,0.22)] transition-all hover:-translate-y-px hover:bg-[#2e63d4] active:translate-y-0 max-md:w-full">
                    <Save className="w-5 h-5 inline-block mr-1 -mt-0.75" />Save
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div
            id="tab-photo-scanner-distance"
            className={tab !== "photo-scanner-distance" ? "hidden" : "block pb-6"}
            role="tabpanel"
            aria-hidden={tab !== "photo-scanner-distance"}
          >
            <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/[0.75] p-3 max-w-[480px]">
              <p className="mb-4 mt-0 text-[0.95rem] text-[#6c7282]">
                Distance along the belt from the <strong>photo eye</strong> to the <strong>scanner</strong> (cm). Used
                with belt speed when scheduling the scanner trigger after a photo-eye edge.
              </p>
              <form className="grid gap-3" onSubmit={onSavePhotoScannerDistance}>
                <label
                  htmlFor="photoEyeScannerCm"
                  className="text-[0.9rem] font-semibold uppercase tracking-wide text-[#6c7282]"
                >
                  Distance (cm)
                </label>
                <input
                  type="number"
                  step={0.001}
                  min={0}
                  id="photoEyeScannerCm"
                  name="photoEyeScannerCm"
                  className="box-border w-full rounded-xl border border-[rgba(26,29,35,0.08)] bg-white/60 px-4 py-3.5 text-base text-[#1a1d23] transition-all focus:border-[rgba(58,122,254,0.6)] focus:shadow-[0_0_0_4px_rgba(58,122,254,0.15)] focus:outline-none"
                  value={photoEyeScannerCm}
                  onChange={(e) => setPhotoEyeScannerCm(e.target.value)}
                  required
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="submit"
                    className="cursor-pointer rounded-[14px] border-0 bg-[#3a7afe] px-5 py-3.5 text-base font-semibold text-white shadow-[0_12px_20px_rgba(58,122,254,0.22)] transition-all hover:-translate-y-px hover:bg-[#2e63d4] active:translate-y-0 max-md:w-full"
                  >
                    <Save className="w-5 h-5 inline-block mr-1 -mt-0.75" />
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
