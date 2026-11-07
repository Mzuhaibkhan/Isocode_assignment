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

  return (
    <div className="min-h-screen bg-bg-main flex flex-col">
      {/* Top Navbar */}
      <header className="bg-stone-900 text-white border-b-2 border-stone-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            <span className="bg-emerald-600 text-white text-xs font-black px-2 py-0.5 rounded">
              {user.role === "office_manager" ? "HQ OFFICE" : "CENTRE C07"}
            </span>
            <h1 className="text-base font-black tracking-tight">
              लातूर शेतकरी उत्पादक कंपनी
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* Online / Offline status badge */}
            <div className="flex items-center gap-1.5 bg-stone-800 px-2 py-1 rounded">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <span className="text-stone-300 font-bold">
                {isOnline ? "ऑनलाइन" : "ऑफलाइन"}
              </span>
            </div>

            <span className="font-bold text-stone-300">
              {user.name} ({user.role === "office_manager" ? "व्यवस्थापक" : "ऑपरेटर"})
            </span>
            <button
              onClick={() => setUser(null)}
              className="text-red-300 font-bold hover:underline px-2 py-1"
            >
              बाहेर पडा (Logout)
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 border-t border-stone-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab("collect")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "collect"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            🌾 नवीन खरेदी (Collection)
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "members"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            👥 सभासद (Members)
          </button>
          <button
            onClick={() => setActiveTab("prices")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "prices"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            💰 दर फलक (Price Board)
          </button>
          <button
            onClick={() => setActiveTab("sync")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "sync"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            <span>🔄 सिंक स्थिती (Sync)</span>
            {pendingSyncCount > 0 && (
              <span className="bg-amber-400 text-stone-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {pendingSyncCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "review"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            📋 पुनरावलोकन (Review)
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "payments"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            💳 देयक फाईल (Payments)
          </button>
          <button
            onClick={() => setActiveTab("devices")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "devices"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            📱 साधने (Devices)
          </button>
          <button
            onClick={() => setActiveTab("sms")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "sms"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            💬 SMS नोंदी (SMS Logs)
          </button>
          <button
            onClick={() => setActiveTab("slips")}
            className={`min-h-touch px-3 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "slips"
                ? "border-emerald-400 text-emerald-300 bg-stone-800/40"
                : "border-transparent text-stone-400 hover:text-white"
            }`}
          >
            📄 नमुना पावती (Samples)
          </button>
        </div>
      </header>

      {/* Main View Port */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-5">
        {activeTab === "collect" && <CollectFlow />}
        {activeTab === "members" && <MemberList />}
        {activeTab === "prices" && <PriceBoard />}
        {activeTab === "sync" && <SyncPanel />}
        {activeTab === "review" && <ReviewQueue />}
        {activeTab === "payments" && <PaymentRuns />}
        {activeTab === "devices" && <DeviceManagement />}
        {activeTab === "sms" && <SmsLogView />}
        {activeTab === "slips" && (
          <div className="flex flex-col gap-4">
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

            <div className="bg-white border border-stone-300 p-3 rounded-xl max-w-sm mx-auto w-full flex flex-col gap-2">
              <span className="text-xs font-bold text-text-muted">
                नमुना पावती निवडा:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {sampleSlips.map((s, idx) => (
                  <Button
                    key={s.slipNo}
                    variant={sampleIndex === idx ? "primary" : "secondary"}
                    onClick={() => setSampleIndex(idx)}
                    className="text-xs py-2"
                  >
                    {s.slipNo}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
