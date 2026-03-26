import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Logo from "../assets/Logo.jpg";

type DeviceConfigType = {
  plc: {
    ip: string | null;
    port: number | null;
  };
  scanner: {
    mode: "KEYBOARD" | "TCP/TELNET";
    ip: string | null;
    port: number | null;
  };
};

const DEFAULT_DEVICE_CONFIG = {
  plc: {
    ip: null,
    port: null,
  },
  scanner: {
    mode: "KEYBOARD",
    ip: null,
    port: null,
  },
};

export function DevicePage() {
  const navigate = useNavigate();

  const [deviceConfig, setDeviceConfig] = useState<DeviceConfigType>(
    DEFAULT_DEVICE_CONFIG as DeviceConfigType,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchDeviceConfig = async () => {
      const res = await axios.get("/api/device");
      if (res.data.result) {
        setDeviceConfig(res.data.config as DeviceConfigType);
      }
    };
    fetchDeviceConfig();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      deviceConfig.scanner.mode === "KEYBOARD" &&
      (!deviceConfig.plc.ip || !deviceConfig.plc.port)
    ) {
      setError("Please fill in all fields");
      return;
    }
    if (
      deviceConfig.scanner.mode === "TCP/TELNET" &&
      (!deviceConfig.plc.ip ||
        !deviceConfig.plc.port ||
        !deviceConfig.scanner.ip ||
        !deviceConfig.scanner.port)
    ) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const res = await axios.put("/api/device", deviceConfig);

      if (res.data.result) {
        navigate("/live");
      }
    } catch (err: any) {
      setError(err.response.data.error || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
      <div className="w-[1400px] h-[1000px] flex">
        <div className="w-[1000px] h-[1000px] flex items-center justify-center">
          <img
            src={Logo}
            alt="logo"
            className="w-[1000px] h-[1000px] object-contain"
          />
        </div>

        <div className="w-[400px] h-[1000px] flex items-center justify-center bg-white">
          <div className="w-full px-6">
            <h1 className="text-3xl font-bold text-[#3a7afe] text-center mb-6">
              Device Settings
            </h1>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              <div className="space-y-4 border-1 border-gray-200 rounded-lg p-4">
                <div>
                  <label
                    htmlFor="plc_ip"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    PLC IP
                  </label>
                  <input
                    id="plc_ip"
                    type="text"
                    value={deviceConfig.plc.ip ?? ""}
                    onChange={(e) =>
                      setDeviceConfig({
                        ...deviceConfig,
                        plc: {
                          ...deviceConfig.plc,
                          ip: e.target.value.trim() || null,
                        },
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#3a7afe] focus:border-[#3a7afe] outline-none transition-shadow"
                  />
                </div>
                <div>
                  <label
                    htmlFor="plc_modbus_port"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Modbus port
                  </label>
                  <input
                    id="plc_modbus_port"
                    type="number"
                    min={1}
                    max={65535}
                    value={deviceConfig.plc.port ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDeviceConfig({
                        ...deviceConfig,
                        plc: {
                          ...deviceConfig.plc,
                          port: v === "" ? null : parseInt(v, 10),
                        },
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#3a7afe] focus:border-[#3a7afe] outline-none transition-shadow"
                  />
                </div>
              </div>
              <div className="space-y-4 border-1 border-gray-200 rounded-lg p-4">
                <div>
                  <label
                    htmlFor="scanner_mode"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Scanner mode
                  </label>
                  <select
                    id="scanner_mode"
                    value={deviceConfig.scanner.mode}
                    onChange={(e) =>
                      setDeviceConfig({
                        ...deviceConfig,
                        scanner: {
                          ...deviceConfig.scanner,
                          mode:
                            e.target.value === "TCP/TELNET"
                              ? "TCP/TELNET"
                              : "KEYBOARD",
                        },
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#3a7afe] focus:border-[#3a7afe] outline-none bg-white"
                  >
                    <option value="KEYBOARD">Keyboard</option>
                    <option value="TCP/TELNET">TCP/Telnet</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="scanner_tcp_host"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Scanner host
                  </label>
                  <input
                    id="scanner_tcp_host"
                    type="text"
                    value={deviceConfig.scanner.ip ?? ""}
                    onChange={(e) =>
                      setDeviceConfig({
                        ...deviceConfig,
                        scanner: {
                          ...deviceConfig.scanner,
                          ip: e.target.value.trim() || null,
                        },
                      })
                    }
                    disabled={deviceConfig.scanner.mode !== "TCP/TELNET"}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#3a7afe] focus:border-[#3a7afe] outline-none transition-shadow"
                  />
                </div>
                <div>
                  <label
                    htmlFor="scanner_tcp_port"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Scanner port
                  </label>
                  <input
                    id="scanner_tcp_port"
                    type="number"
                    min={1}
                    max={65535}
                    value={deviceConfig.scanner.port ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDeviceConfig({
                        ...deviceConfig,
                        scanner: {
                          ...deviceConfig.scanner,
                          port: v === "" ? null : parseInt(v, 10),
                        },
                      });
                    }}
                    disabled={deviceConfig.scanner.mode !== "TCP/TELNET"}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#3a7afe] focus:border-[#3a7afe] outline-none transition-shadow"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-[#3a7afe] to-[#3070f0] hover:from-[#3070f0] hover:to-[#3a7afe] disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
              >
                {loading ? "Saving…" : "Save"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
