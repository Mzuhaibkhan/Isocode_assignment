import { useState } from "react";
import { Login } from "./routes/Login.js";
import { StepShell } from "./ui/StepShell.js";
import { Slip } from "./ui/Slip.js";
import { Button } from "./ui/Button.js";

interface ActiveUser {
  role: string;
  name: string;
}

export function App() {
  const [user, setUser] = useState<ActiveUser | null>(null);
  const [sampleIndex, setSampleIndex] = useState(0);

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
    return <Login onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  const activeSlip = sampleSlips[sampleIndex];

  return (
    <StepShell
      title="डिजिटल पावती (Digital Slip)"
      centreCode={user.role === "operator" ? "C07" : "HQ"}
      isOnline={true}
      onBack={() => setUser(null)}
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center justify-between bg-stone-100 p-2.5 rounded-xl border border-stone-300">
          <span className="text-sm font-bold text-text-main">
            वापरकर्ता: {user.name} ({user.role})
          </span>
          <button
            onClick={() => setUser(null)}
            className="text-xs font-bold text-danger underline min-h-[32px] px-2"
          >
            बाहेर पडा (Logout)
          </button>
        </div>

        {/* Slip Display */}
        <Slip
          slipNo={activeSlip.slipNo}
          farmerName={activeSlip.farmerName}
          crop={activeSlip.crop}
          netKg={activeSlip.netKg}
          moisturePercent={activeSlip.moisturePercent}
          ratePerQuintal={activeSlip.ratePerQuintal}
          amountPaise={activeSlip.amountPaise}
          smsStatus="sent"
          onShare={() => alert(`पावती शेअर केली: ${activeSlip.slipNo}`)}
          onPrint={() => window.print()}
        />

        {/* Switch Sample Slips */}
        <div className="bg-stone-50 border border-stone-300 p-3 rounded-xl flex flex-col gap-2 mt-2">
          <span className="text-xs font-bold text-text-muted">
            नमुना पावती बदला (Sample Data Verification):
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
    </StepShell>
  );
}

export default App;

