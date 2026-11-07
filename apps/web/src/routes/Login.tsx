import React, { useState } from "react";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { Numpad } from "../ui/Numpad.js";

export interface LoginProps {
  onLoginSuccess?: (user: { role: string; name: string }) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [role, setRole] = useState<"operator" | "office_manager">("operator");

  // Operator PIN state
  const [centreCode, setCentreCode] = useState("C07");
  const [pin, setPin] = useState("");
  const [operatorError, setOperatorError] = useState("");

  // Office state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [officeError, setOfficeError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setOperatorError("");
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
    setOperatorError("");
  };

  const handleOperatorLogin = async () => {
    if (pin.length < 4) {
      setOperatorError("कृपया ४ अंकी पिन टाका (ENTER 4 DIGIT PIN)");
      return;
    }

    setLoading(true);
    setOperatorError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "operator",
          centreId: centreCode === "C07" ? "centre-c07" : "centre-c12",
          pin,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOperatorError(data.error || "लॉगिन अयशस्वी. कृपया पिन तपासा.");
        return;
      }

      const data = await res.json();
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch {
      // Offline / local fallback for shed testing
      if (pin === "1234" || pin === "5678") {
        if (onLoginSuccess) {
          onLoginSuccess({ role: "operator", name: "Ramesh Patil" });
        }
      } else {
        setOperatorError("अवैध पिन (डेमो पिन: 1234)");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOfficeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setOfficeError("Please fill in email and password");
      return;
    }

    setLoading(true);
    setOfficeError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "office_manager",
          email,
        password,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setOfficeError(data.error || "Login failed");
      return;
    }

    const data = await res.json();
    if (onLoginSuccess) {
      onLoginSuccess(data.user);
    }
  } catch {
    if (email === "office@latur-fpc.org" && password === "Password123!") {
      if (onLoginSuccess) {
        onLoginSuccess({ role: "office_manager", name: "Anil Kadam" });
      }
    } else {
      setOfficeError("Invalid credentials (Demo: office@latur-fpc.org / Password123!)");
    }
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-chaos-canvas text-chaos-black flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      {/* Background Technical Watermark */}
      <div className="fixed top-4 left-4 font-mono text-[11px] text-chaos-muted tracking-widest uppercase hidden sm:block">
        [ SYS: PROC-AUT-2026 // WORKROOM SHED TERMINAL ]
      </div>
      <div className="fixed top-4 right-4 font-mono text-[11px] text-chaos-muted tracking-widest uppercase hidden sm:block">
        [ AUTH: AES-GCM 256 BIT KEYED ]
      </div>

      <div className="w-full max-w-md bg-chaos-paper border-2 border-chaos-black shadow-tactile-lg p-6 sm:p-8 animate-slideUp">
        {/* Masthead Title */}
        <div className="border-b-2 border-chaos-black pb-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs uppercase tracking-widest text-chaos-orange font-bold">
              PORTAL ACCESS // प्रवेशद्वार
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider bg-chaos-black text-white px-2 py-0.5">
              VERSION 2.4
            </span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight leading-none text-chaos-black">
            लातूर शेतकरी उत्पादक
          </h1>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            FARMER PROCUREMENT & DISBURSEMENT PORTAL
          </p>
        </div>

        {/* Role Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setRole("operator");
              setOperatorError("");
            }}
            className={`min-h-[48px] px-3 py-2 border-2 transition-all font-mono text-xs uppercase font-bold tracking-wider text-center ${
              role === "operator"
                ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                : "bg-chaos-canvas text-chaos-black border-chaos-black hover:bg-white"
            }`}
          >
            01. ऑपरेटर (PIN)
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("office_manager");
              setOfficeError("");
            }}
            className={`min-h-[48px] px-3 py-2 border-2 transition-all font-mono text-xs uppercase font-bold tracking-wider text-center ${
              role === "office_manager"
                ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                : "bg-chaos-canvas text-chaos-black border-chaos-black hover:bg-white"
            }`}
          >
            02. व्यवस्थापक (HQ)
          </button>
        </div>

        {role === "operator" ? (
          /* Operator Fast PIN Login (Shed Friendly) */
          <div className="flex flex-col gap-5">
            {/* Centre Selector */}
            <div className="border-2 border-chaos-black bg-chaos-canvas p-3 flex items-center justify-between">
              <label htmlFor="centre-select" className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted">
                खरेदी केंद्र (CENTRE):
              </label>
              <select
                id="centre-select"
                value={centreCode}
                onChange={(e) => setCentreCode(e.target.value)}
                className="bg-transparent font-mono text-sm font-black uppercase text-chaos-black focus:outline-none cursor-pointer"
              >
                <option value="C07">C07 - औसा (Ausa Shed)</option>
                <option value="C12">C12 - रेणापूर (Renapur)</option>
              </select>
            </div>

            {/* PIN Display */}
            <div className="text-center py-1">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted block mb-2">
                ४ अंकी ऑपरेटर पिन टाका // ENTER OPERATOR PIN
              </span>
              <div className="flex justify-center gap-2.5">
                {[0, 1, 2, 3].map((idx) => {
                  const hasDigit = pin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-12 h-14 border-2 flex items-center justify-center font-display text-4xl font-black transition-all ${
                        hasDigit
                          ? "border-chaos-black bg-chaos-orange text-chaos-black shadow-tactile-sm"
                          : "border-chaos-black/40 bg-chaos-canvas text-chaos-muted"
                      }`}
                    >
                      {hasDigit ? "•" : ""}
                    </div>
                  );
                })}
              </div>
            </div>

            {operatorError && (
              <div className="border-2 border-red-600 bg-red-50 p-2 text-center font-mono text-xs font-bold text-red-700 uppercase tracking-wide">
                [!] {operatorError}
              </div>
            )}

            {/* Tactile High-Speed Numpad */}
            <Numpad
              onDigit={handleDigit}
              onClear={handleClear}
              onBackspace={handleBackspace}
              allowDecimal={false}
            />

            <Button
              type="button"
              variant="orange"
              onClick={handleOperatorLogin}
              disabled={loading || pin.length < 4}
              size="large"
              className="w-full mt-2"
            >
              {loading ? "प्रवेश चालू आहे..." : "लॉगिन करा // ENTER SYSTEM"}
            </Button>
          </div>
        ) : (
          /* Office Manager Login Form */
          <form onSubmit={handleOfficeLogin} className="flex flex-col gap-4">
            <Field
              label="कार्यालय ईमेल (HQ Email)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="office@latur-fpc.org"
              required
            />
            <Field
              label="पासवर्ड (Security Password)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {officeError && (
              <div className="border-2 border-red-600 bg-red-50 p-2 text-center font-mono text-xs font-bold text-red-700 uppercase tracking-wide">
                [!] {officeError}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              size="large"
              className="w-full mt-2"
            >
              {loading ? "सत्यापन होत आहे..." : "साइन इन करा // SIGN IN"}
            </Button>
          </form>
        )}
      </div>

      <div className="mt-6 text-center font-mono text-[11px] text-chaos-muted uppercase tracking-wider">
        LATUR DISTRICT PRODUCER CO. // SUNLIGHT READABLE DISPLAY (§13.1)
      </div>
    </div>
  );
};
