import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import SetupScreen from "./components/SetupScreen";
import UnlockScreen from "./components/UnlockScreen";
import TotpList from "./components/TotpList";

type Screen = "loading" | "setup" | "unlock" | "main";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    invoke<boolean>("is_setup").then((setup) => {
      setScreen(setup ? "unlock" : "setup");
    });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("auto-locked", () => {
      setScreen((s) => (s === "main" ? "unlock" : s));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  if (screen === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-theme-bg">
        <div className="w-5 h-5 border-2 border-theme-ring border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (screen === "setup") {
    return <SetupScreen onDone={() => setScreen("main")} />;
  }

  if (screen === "unlock") {
    return <UnlockScreen onUnlocked={() => setScreen("main")} onReset={() => setScreen("setup")} />;
  }

  return <TotpList onLock={() => setScreen("unlock")} />;
}
