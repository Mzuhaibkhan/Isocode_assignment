import { useState, useEffect } from "react";
import { Login } from "./routes/Login.js";
import { MemberList } from "./routes/members/MemberList.js";
import { PriceBoard } from "./routes/prices/PriceBoard.js";
import { CollectFlow } from "./routes/collect/CollectFlow.js";
import { SmsLogView } from "./routes/sms/SmsLogView.js";
import { SyncPanel } from "./routes/sync/SyncPanel.js";
import { ReviewQueue } from "./routes/review/ReviewQueue.js";
import { PaymentRuns } from "./routes/payments/PaymentRuns.js";
import { DeviceManagement } from "./routes/devices/DeviceManagement.js";
import { Slip } from "./ui/Slip.js";
import { Button } from "./ui/Button.js";
import { syncMembersAndPrices } from "./offline/syncMembersAndPrices.js";
import { registerDeviceWithServer } from "./offline/signer.js";
import { startSyncLoop } from "./offline/syncClient.js";
import { db } from "./offline/db.js";

interface ActiveUser {
  role: string;
  name: string;
}

export function App() {
  const [user, setUser] = useState<ActiveUser | null>(null);
  const [activeTab, setActiveTab] = useState<
    "collect" | "members" | "prices" | "sync" | "review" | "payments" | "devices" | "sms" | "slips"
  >("collect");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  useEffect(() => {
    // Initial device registration and background cache download (§9.1)
    registerDeviceWithServer();
    syncMembersAndPrices();

    // Start background sync loop (§9.6)
    const cleanupSync = startSyncLoop((stats) => {
      setPendingSyncCount(stats.totalPending);
    });

    const updatePendingCount = async () => {
      try {
        const count = await db.outbox.where("status").equals("pending").count();
        setPendingSyncCount(count);
      } catch {}
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 4000);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cleanupSync();
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const sampleSlips = [
    {
      slipNo: "C07-24518",
      farmerName: "सुनील जाधव",
      crop: "सोयाबीन (Soybean)",
      netKg: "1232.0",
      moisturePercent: "11.5",
      ratePerQuintal: 4850,
      amountPaise: 5975200,
    },
    {
      slipNo: "C07-24519",
      farmerName: "कमल शिंदे",
      crop: "सोयाबीन (Soybean)",
      netKg: "831.0",
      moisturePercent: "14.0",
      ratePerQuintal: 4850,
      amountPaise: 4030350,
    },
    {
      slipNo: "C12-08876",
      farmerName: "मोहन बिरादार",
      crop: "तूर (Tur)",
      netKg: "630.0",
      moisturePercent: "10.0",
      ratePerQuintal: 7200,
      amountPaise: 4536000,
    },
  ];

  if (!user) {
    return (
      <Login
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          if (loggedInUser.role === "operator") {
            setActiveTab("collect");
          } else {
            setActiveTab("members");
          }
        }}
      />
    );
  }

  const activeSlip = sampleSlips[sampleIndex];

  const navItems: Array<{
    id: typeof activeTab;
    marathi: string;
    en: string;
    badge?: number;
  }> = [
    { id: "collect", marathi: "नवीन खरेदी", en: "Collect" },
    { id: "members", marathi: "सभासद", en: "Members" },
    { id: "prices", marathi: "दर फलक", en: "Prices" },
    { id: "sync", marathi: "सिंक स्थिती", en: "Sync", badge: pendingSyncCount },
    { id: "review", marathi: "पुनरावलोकन", en: "Review" },
    { id: "payments", marathi: "देयक फाईल", en: "Payments" },
    { id: "devices", marathi: "साधने", en: "Devices" },
    { id: "sms", marathi: "SMS नोंदी", en: "SMS" },
    { id: "slips", marathi: "नमुना पावती", en: "Slips" },
  ];

  return (
    <div className="min-h-screen bg-chaos-canvas text-chaos-black flex flex-col font-sans selection:bg-chaos-orange selection:text-white">
      {/* Top Editorial Ticker Bar */}
      <div className="bg-chaos-black text-chaos-canvas px-4 py-1 text-[11px] font-mono uppercase tracking-widest flex items-center justify-between border-b border-stone-800">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2 h-2 bg-chaos-orange animate-pulse"></span>
          <span>LATUR FPC // FIELD PROCUREMENT SYSTEM</span>
          <span className="hidden md:inline text-chaos-muted">• KHARIF 2026-27</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-chaos-muted font-mono">
            SOYBEAN: ₹4,850/QTL • TUR: ₹7,200/QTL
          </span>
          <span className="text-chaos-orange font-bold font-mono">AES-GCM P-256</span>
        </div>
      </div>

      {/* Main Brutalist Masthead Header */}
      <header className="bg-chaos-paper border-b-2 border-chaos-black sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          {/* Logo & Org Title */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-chaos-black text-chaos-orange border-2 border-chaos-black flex items-center justify-center font-display font-black text-2xl shadow-tactile-sm">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-xl sm:text-2xl tracking-tight uppercase leading-none">
                  लातूर शेतकरी उत्पादक कंपनी
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-chaos-orange text-chaos-black uppercase tracking-wider">
                  {user.role === "office_manager" ? "HQ OFFICE" : "CENTRE C07"}
                </span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-chaos-muted mt-0.5">
                LATUR DISTRICT FARMER PRODUCER CO-OPERATIVE LTD.
              </p>
            </div>
          </div>

          {/* Right Status Meta & User Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Online / Offline Status Badge */}
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 border-2 border-chaos-black text-xs font-mono font-bold ${
                isOnline ? "bg-white text-emerald-800" : "bg-red-100 text-red-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-emerald-600 animate-ping" : "bg-red-600"
                }`}
              />
              <span>{isOnline ? "ONLINE // जोडलेले" : "OFFLINE // स्थानिक"}</span>
            </div>

            {/* User Pill */}
            <div className="hidden lg:flex flex-col text-right">
              <span className="font-bold text-xs text-chaos-black leading-tight">
                {user.name}
              </span>
              <span className="font-mono text-[10px] uppercase text-chaos-muted">
                {user.role === "office_manager" ? "Office Manager" : "Field Operator"}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => setUser(null)}
              className="px-3 py-1.5 border-2 border-chaos-black font-mono text-xs font-bold uppercase tracking-wider bg-chaos-canvas hover:bg-chaos-black hover:text-white transition-all shadow-tactile-sm active:translate-y-0.5"
            >
              बाहेर पडा (Exit)
            </button>
          </div>
        </div>

        {/* Tactical Index Tab Rail */}
        <nav className="border-t-2 border-chaos-black bg-chaos-canvas overflow-x-auto scrollbar-none">
          <div className="max-w-6xl mx-auto px-4 flex gap-1 py-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[44px] px-3.5 py-1.5 border-2 transition-all whitespace-nowrap flex items-center gap-2 text-xs uppercase tracking-wide font-bold ${
                    isActive
                      ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                      : "bg-chaos-paper text-chaos-black border-transparent hover:border-chaos-black hover:bg-white"
                  }`}
                >
                  <span className="font-sans font-extrabold">{item.marathi}</span>
                  <span className="font-mono text-[10px] opacity-75">[{item.en}]</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="bg-chaos-orange text-chaos-black font-mono text-[10px] font-black px-1.5 py-0.2 rounded-none border border-chaos-black">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Editorial Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
        {activeTab === "collect" && <CollectFlow />}
        {activeTab === "members" && <MemberList />}
        {activeTab === "prices" && <PriceBoard />}
        {activeTab === "sync" && <SyncPanel />}
        {activeTab === "review" && <ReviewQueue />}
        {activeTab === "payments" && <PaymentRuns />}
        {activeTab === "devices" && <DeviceManagement />}
        {activeTab === "sms" && <SmsLogView />}
        {activeTab === "slips" && (
          <div className="max-w-xl mx-auto flex flex-col gap-6">
            <div className="border-2 border-chaos-black bg-chaos-paper p-4 shadow-tactile">
              <span className="font-mono text-xs uppercase text-chaos-muted tracking-wider block mb-1">
                DEMO SLIP PREVIEW // नमुना पावती पडताळणी
              </span>
              <p className="font-display text-2xl font-black uppercase tracking-tight">
                SELECT A PHYSICAL RECEIPT SAMPLE
              </p>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {sampleSlips.map((s, idx) => (
                  <Button
                    key={s.slipNo}
                    variant={sampleIndex === idx ? "orange" : "secondary"}
                    onClick={() => setSampleIndex(idx)}
                    className="text-xs py-2"
                  >
                    {s.slipNo}
                  </Button>
                ))}
              </div>
            </div>

            <Slip
              slipNo={activeSlip.slipNo}
              farmerName={activeSlip.farmerName}
              crop={activeSlip.crop}
              netKg={activeSlip.netKg}
              moisturePercent={activeSlip.moisturePercent}
              ratePerQuintal={activeSlip.ratePerQuintal}
              amountPaise={activeSlip.amountPaise}
              smsStatus="sent"
            />
          </div>
        )}
      </main>

      {/* Polite Chaos Editorial Footer */}
      <footer className="mt-auto border-t-2 border-chaos-black bg-chaos-paper py-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
          <div>
            <p className="font-display text-xl font-black uppercase tracking-tight">
              LATUR DISTRICT FARMER PRODUCER CO.
            </p>
            <p className="font-mono text-[11px] text-chaos-muted uppercase tracking-wider">
              OFFLINE-FIRST ENCLAVE WEIGHMENT & DIRECT BENEFIT TRANSFER INFRASTRUCTURE
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-chaos-muted">
            <span>VERSION 2.4.0-CHAOS</span>
            <span>•</span>
            <span>DEXIE SECURE REPO</span>
            <span>•</span>
            <span className="text-chaos-orange font-bold font-mono">STANDALONE SHED READY</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
