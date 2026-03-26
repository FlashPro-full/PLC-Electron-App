import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./contexts/ToastContext";
import { DevicePage } from "./pages/DevicePage";
import { LoginPage } from "./pages/LoginPage";
import { LivePage } from "./pages/LivePage";
import { SettingsPage } from "./pages/SettingsPage";
import { useState } from "react";
import { AppContext } from "./contexts/AppContext";

function App() {
  const [value, setValue] = useState("Hello World");

  return (
    <AppContext.Provider value={{ value, setValue }}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/device" element={<DevicePage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppContext.Provider>
  );
}

export default App;