(() => {
  function updateActiveItemsTableFromFrontendItems() {
    const items = Array.from(frontendItems.values());
    const data = {
      items,
      count: items.length,
      timestamp: (/* @__PURE__ */ new Date()).toLocaleString()
    };
    updateActiveItemsTableFromData(data);
  }
  function updateActiveItemsTableFromData(data) {
    let items = [];
    if (data.items) {
      if (Array.isArray(data.items)) {
        items = data.items;
      } else if (typeof data.items === "object") {
        items = Object.entries(data.items).map(([barcode, itemData]) => ({
          barcode,
          ...itemData
        }));
      }
    }
    const itemCount = items.length;
    const tbody = document.getElementById("active-items-tbody");
    const countSpan = document.getElementById("items-count");
    if (!tbody) return;
    if (items && items.length > 0) {
      Array.from(tbody.children).forEach((row) => {
        if (!row.dataset.barcode) {
          row.remove();
        }
      });
      const existingRows = {};
      Array.from(tbody.children).forEach((row) => {
        const barcode = row.dataset.barcode;
        if (barcode) {
          existingRows[barcode] = row;
        }
      });
      const activeBarcodes = new Set(items.map((item) => item.barcode));
      Object.keys(existingRows).forEach((barcode) => {
        if (!activeBarcodes.has(barcode)) {
          const row = existingRows[barcode];
          row.style.transition = "opacity 0.3s ease-out";
          row.style.opacity = "0";
          setTimeout(() => {
            if (row.parentNode) {
              row.remove();
            }
          }, 300);
          delete existingRows[barcode];
        }
      });
      items = items.slice().reverse();
      items.forEach((item) => {
        try {
          const barcode = item.barcode;
          if (!barcode) {
            return;
          }
          let row = existingRows[barcode];
          if (!row) {
            row = document.createElement("tr");
            row.dataset.barcode = barcode;
            row.style.borderBottom = "1px solid var(--border)";
            row.style.transition = "background 0.2s, opacity 0.3s";
            row.onmouseenter = () => row.style.background = "rgba(58, 122, 254, 0.05)";
            row.onmouseleave = () => row.style.background = "";
            tbody.appendChild(row);
            existingRows[barcode] = row;
          }
          const timeStr = item.created_at || (/* @__PURE__ */ new Date()).toLocaleTimeString();
          let positionCm = "0.0 cm";
          if (item.positionCm !== void 0 && item.positionCm !== null) {
            positionCm = parseFloat(item.positionCm).toFixed(1) + " cm";
          } else if (item.start_time && item.status === "fetching" && item.positionId) {
            const startTime = typeof item.start_time === "string" ? parseFloat(item.start_time) : item.start_time;
            const currentTime = Date.now() / 1e3;
            const elapsed = currentTime - startTime;
            if (elapsed >= 0) {
              const position = elapsed * currentBeltSpeed;
              positionCm = position.toFixed(1) + " cm";
            }
          }
          const status = item.status || "pending";
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
          }
          const distance = item.distance !== void 0 && item.distance !== null ? Number(item.distance).toFixed(1) + " cm" : "N/A";
          const label = item.label !== void 0 && item.label !== null ? item.label : "N/A";
          const pusher = item.pusher !== void 0 && item.pusher !== null ? item.pusher : "N/A";
          row.innerHTML = `
                    <td style="padding: 10px; font-family: monospace; font-weight: 600; font-size: 1.1em;">${barcode}</td>
                    <td style="padding: 10px;">
                        <span style="padding: 4px 8px; background: rgba(58, 122, 254, 0.1); border-radius: 4px; font-weight: 600; color: var(--accent); font-size: 1.1em;">${label}</span>
                    </td>
                    <td style="padding: 10px;">
                        <span style="padding: 4px 8px; background: ${statusBg}; border-radius: 4px; font-weight: 600; color: ${statusColor}; font-size: 1.1em;">${status}</span>
                    </td>
                    <td style="padding: 10px; font-family: monospace; font-weight: 600; color: var(--accent); font-size: 1.1em;">${item.positionId !== void 0 && item.positionId !== null ? item.positionId : "N/A"}</td>
                    <td style="padding: 10px; font-family: monospace; font-weight: 600; color: var(--accent); font-size: 1.1em;" data-position-id="${item.positionId || ""}">
                        <span class="position-cm-display">${positionCm}</span>
                    </td>
                    <td style="padding: 10px; font-family: monospace; font-weight: 600; color: var(--accent); font-size: 1.1em;">${distance}</td>
                    <td style="padding: 10px;">
                        <span style="padding: 4px 8px; background: rgba(255, 193, 7, 0.2); border-radius: 4px; font-weight: 600; font-size: 1.1em;">${pusher}</span>
                    </td>
                    <td style="padding: 10px; font-size: 1.1em; color: var(--muted); font-family: monospace;">${timeStr}</td>
                `;
        } catch (error) {
        }
      });
      for (let i = items.length - 1; i >= 0; i--) {
        const row = existingRows[items[i].barcode];
        if (row && row.parentNode) tbody.insertBefore(row, tbody.firstChild);
      }
      if (countSpan) {
        countSpan.textContent = itemCount;
      }
      document.dispatchEvent(new CustomEvent("activeItemsUpdated", {
        detail: { items }
      }));
    } else {
      tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 12px; text-align: center; color: var(--muted); font-style: italic; font-size: 1.1em;">
                    Waiting for items...
                </td>
            </tr>
        `;
      if (countSpan) {
        countSpan.textContent = "0";
      }
      document.dispatchEvent(new CustomEvent("activeItemsUpdated", {
        detail: { items: [] }
      }));
    }
  }
  function updateSystemStatusFromData(status) {
    if (!status) return;
    const plc = status.plc || {};
    const scanner = status.scanner || {};
    const photoEye = status.photo_eye || {};
    const plcStatus = document.getElementById("plc-status");
    if (plcStatus) {
      if (plc.connected) {
        plcStatus.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff; margin-right: 6px; opacity: 1; box-shadow: 0 0 6px rgba(255,255,255,0.8);"></span>PLC: ${plc.message || ""}`;
        plcStatus.style.background = "#27ae60";
      } else {
        plcStatus.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff; margin-right: 6px; opacity: 0.5;"></span>PLC: ${plc.message || "Unknown"}`;
        plcStatus.style.background = "#e74c3c";
      }
    }
    const scannerStatus = document.getElementById("scanner-status");
    if (scannerStatus) {
      if (scanner.connected) {
        scannerStatus.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff; margin-right: 6px; opacity: 1; box-shadow: 0 0 6px rgba(255,255,255,0.8);"></span>Scanner: ${scanner.message || ""}`;
        scannerStatus.style.background = "#27ae60";
      } else {
        scannerStatus.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff; margin-right: 6px; opacity: 0.5;"></span>Scanner: ${scanner.message || "Unknown"}`;
        scannerStatus.style.background = "#e74c3c";
      }
    }
    const photoEyeStatus = document.getElementById("photo-eye-status");
    if (photoEyeStatus) {
      if (photoEye.connected) {
        photoEyeStatus.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff; margin-right: 6px; opacity: 1; box-shadow: 0 0 6px rgba(255,255,255,0.8);"></span>Photo Eye: ${photoEye.message || ""}`;
        photoEyeStatus.style.background = "#27ae60";
      } else {
        photoEyeStatus.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff; margin-right: 6px; opacity: 0.5;"></span>Photo Eye: ${photoEye.message || "Not Ready"}`;
        photoEyeStatus.style.background = "#666";
      }
    }
  }
  let socket = null;
  let frontendItems = /* @__PURE__ */ new Map();
  let positionUpdateIntervalId = null;
  let socketHandlerWorker = null;
  let currentBeltSpeed = 32.1;
  let currentMaxDistance = 972;
  function createSocketHandlerWorker() {
    if (socketHandlerWorker) return socketHandlerWorker;
    try {
      var workerUrl = typeof window !== "undefined" && window.location ? window.location.origin + "/static/socket-handler.worker.js" : "";
      if (!workerUrl) return null;
      socketHandlerWorker = new Worker(workerUrl);
      socketHandlerWorker.onmessage = function(e) {
        const msg = e.data;
        if (!msg || !msg.type) return;
        if (msg.type === "items_updated") {
          const items = msg.items || [];
          frontendItems = new Map(items.map(function(i) {
            return [i.barcode, i];
          }));
          updateActiveItemsTableFromData({ items });
          document.dispatchEvent(new CustomEvent("activeItemsUpdated", { detail: { items } }));
        } else if (msg.type === "system_status") {
          updateSystemStatusFromData(msg.status || {});
        } else if (msg.type === "pusher_activate" && msg.detail) {
          document.dispatchEvent(new CustomEvent("pusherActivate", { detail: msg.detail }));
        }
      };
    } catch (err) {
    }
    return socketHandlerWorker;
  }
  function loadSettingsForBelt() {
    fetch("/get-settings").then(function(response) {
      return response.json();
    }).then(function(settings) {
      var speed = Number(settings && settings.belt_speed);
      currentBeltSpeed = speed > 0 ? speed : 32.1;
      currentMaxDistance = 972;
      if (settings && settings.pushers && typeof settings.pushers === "object") {
        var distances = Object.values(settings.pushers).map(function(p) {
          return p && p.distance != null ? Number(p.distance) : 0;
        });
        if (distances.length) currentMaxDistance = Math.max.apply(null, distances);
      }
      var w = createSocketHandlerWorker();
      if (w) w.postMessage({ type: "config", beltSpeed: currentBeltSpeed, maxDistance: currentMaxDistance });
    }).catch(function() {
    });
  }
  function startPositionUpdateLoop() {
    if (positionUpdateIntervalId !== null) return;
    positionUpdateIntervalId = true;
    var w = createSocketHandlerWorker();
    if (w) {
      w.postMessage({ type: "start_tick" });
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    createSocketHandlerWorker();
    try {
      socket = io();
      if (socket) {
        socket.on("connect", () => {
          console.log("Connected to server");
        });
        socket.on("disconnect", () => {
          console.log("Disconnected from server");
        });
        socket.on("add_book", (itemData) => {
          if (socketHandlerWorker && itemData) {
            socketHandlerWorker.postMessage({ type: "add_book", item: itemData });
          } else if (itemData && itemData.barcode) {
            const item = { barcode: itemData.barcode, start_time: itemData.start_time, positionId: itemData.positionId, positionCm: itemData.positionCm, pusher: itemData.pusher, label: itemData.label, distance: itemData.distance, status: itemData.status, created_at: itemData.created_at, pusherActivated: false };
            frontendItems.set(itemData.barcode, item);
            updateActiveItemsTableFromFrontendItems();
            document.dispatchEvent(new CustomEvent("activeItemsUpdated", { detail: { items: Array.from(frontendItems.values()) } }));
          }
        });
        socket.on("update_book", (data) => {
          if (socketHandlerWorker && data) {
            socketHandlerWorker.postMessage({ type: "update_book", data });
          } else if (data && data.barcode) {
            let existingItem = frontendItems.get(data.barcode);
            if (!existingItem) {
              existingItem = { barcode: data.barcode, start_time: data.start_time, positionId: data.positionId, positionCm: data.positionCm, pusher: data.pusher, label: data.label, distance: data.distance, status: data.status || "pending", created_at: data.created_at || (/* @__PURE__ */ new Date()).toLocaleTimeString(), pusherActivated: false };
              frontendItems.set(data.barcode, existingItem);
            } else {
              existingItem.positionId = data.positionId;
              existingItem.status = data.status;
              existingItem.start_time = data.start_time;
              existingItem.pusher = data.pusher;
              existingItem.label = data.label;
              existingItem.distance = data.distance;
            }
            updateActiveItemsTableFromFrontendItems();
            document.dispatchEvent(new CustomEvent("activeItemsUpdated", { detail: { items: Array.from(frontendItems.values()) } }));
          }
        });
        socket.on("system_status", (status) => {
          if (socketHandlerWorker && status) {
            socketHandlerWorker.postMessage({ type: "system_status", status });
          } else if (status) {
            updateSystemStatusFromData(status);
          }
        });
      }
    } catch (error) {
    }
    const testBtn = document.getElementById("test-integration-btn");
    if (testBtn) {
      testBtn.addEventListener("click", runIntegrationTest);
    }
    loadSettingsForBelt();
    document.addEventListener("settingsUpdated", loadSettingsForBelt);
    startPositionUpdateLoop();
  });
  async function loadInitialStatus() {
    try {
      const response = await fetch("/api/system-status");
      const status = await response.json();
      if (status) {
        updateSystemStatusFromData(status);
      }
    } catch (error) {
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadInitialStatus);
  } else {
    loadInitialStatus();
  }
  async function runIntegrationTest() {
    const testBtn = document.getElementById("test-integration-btn");
    const testResultsCard = document.getElementById("test-results-card");
    const testResultsDiv = document.getElementById("test-results");
    if (!testBtn || !testResultsDiv) return;
    testBtn.disabled = true;
    testBtn.textContent = "Running Tests...";
    if (testResultsCard) testResultsCard.style.display = "block";
    testResultsDiv.innerHTML = "<div style='text-align: center; padding: 20px;'>Running integration tests... Please wait.</div>";
    try {
      const response = await fetch("/test-integration");
      const results = await response.json();
      let html = `<div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: ${results.overall_status === "pass" ? "#27ae60" : results.overall_status === "warning" ? "#f39c12" : "#e74c3c"};">
                ${results.overall_status === "pass" ? "\u2705" : results.overall_status === "warning" ? "\u26A0\uFE0F" : "\u274C"} 
                Overall Status: ${results.overall_status.toUpperCase()}
            </h3>
            <div style="font-size: 0.9em; color: #666;">
                Timestamp: ${results.timestamp}<br>
                Passed: ${results.summary.passed} | Failed: ${results.summary.failed} | Warnings: ${results.summary.warnings} | Skipped: ${results.summary.skipped}
            </div>
        </div>`;
      html += "<div style='display: grid; gap: 12px;'>";
      for (const [key, test] of Object.entries(results.tests)) {
        const statusColor = test.status === "pass" ? "#27ae60" : test.status === "fail" ? "#e74c3c" : test.status === "warning" ? "#f39c12" : "#95a5a6";
        const statusIcon = test.status === "pass" ? "\u2705" : test.status === "fail" ? "\u274C" : test.status === "warning" ? "\u26A0\uFE0F" : "\u23ED\uFE0F";
        html += `<div style="padding: 12px; border-radius: 8px; border: 1px solid ${statusColor}; background: ${statusColor}15;">
                <div style="font-weight: 600; margin-bottom: 4px;">
                    ${statusIcon} ${test.name}: <span style="color: ${statusColor};">${test.status.toUpperCase()}</span>
                </div>
                <div style="font-size: 0.9em; color: #666; margin-bottom: 4px;">${test.message}</div>`;
        if (test.details && Object.keys(test.details).length > 0) {
          html += `<details style="font-size: 0.85em; color: #888; margin-top: 4px;">
                    <summary style="cursor: pointer;">View Details</summary>
                    <pre style="margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; overflow-x: auto;">${JSON.stringify(test.details, null, 2)}</pre>
                </details>`;
        }
        html += "</div>";
      }
      html += "</div>";
      testResultsDiv.innerHTML = html;
      if (testResultsCard) testResultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      testResultsDiv.innerHTML = `<div style="color: #e74c3c; padding: 20px;">
            \u274C Error running integration test: ${msg}
        </div>`;
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = "Run Integration Test";
    }
  }
})();
