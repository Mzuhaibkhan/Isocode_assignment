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
      setOperatorError("कृपया ४ अंकी पिन टाका");
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
      // In offline / mock mode for Phase 1 demo
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
    <div className="min-h-screen bg-bg-main flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm bg-white border-2 border-stone-800 rounded-2xl shadow-lg p-6">
        {/* App Title */}
        <div className="text-center mb-6">
          <span className="text-xs font-bold text-brand uppercase tracking-wider">
            लातूर शेतकरी उत्पादक कंपनी
          </span>
          <h1 className="text-2xl font-black text-text-main mt-1">
            खरेदी व भरणा ॲप
          </h1>
        </div>

        {/* Role Toggle Tabs */}
        <div className="grid grid-cols-2 gap-1 bg-stone-100 p-1.5 rounded-xl border border-stone-300 mb-6">
          <button
            type="button"
            onClick={() => {
              setRole("operator");
              setOperatorError("");
            }}
            className={`min-h-touch py-2 text-sm font-extrabold rounded-lg transition-all ${
              role === "operator"
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-700 hover:text-black"
            }`}
          >
            केंद्र ऑपरेटर (PIN)
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("office_manager");
              setOfficeError("");
            }}
            className={`min-h-touch py-2 text-sm font-extrabold rounded-lg transition-all ${
              role === "office_manager"
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-700 hover:text-black"
            }`}
          >
            Office Manager
          </button>
        </div>

        {role === "operator" ? (
          /* Operator Fast PIN Login (Shed Friendly) */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-stone-50 px-3 py-2 rounded-xl border border-stone-300">
              <label htmlFor="centre-select" className="text-xs font-bold text-text-muted">
                खरेदी केंद्र:
              </label>
              <select
                id="centre-select"
                value={centreCode}
                onChange={(e) => setCentreCode(e.target.value)}
                className="bg-transparent font-bold text-base text-text-main focus:outline-none"
              >
                <option value="C07">C07 - औसा (Ausa)</option>
                <option value="C12">C12 - रेणापूर (Renapur)</option>
              </select>
            </div>

            {/* PIN Display */}
            <div className="text-center py-2">
              <span className="text-xs font-bold text-text-muted block mb-1">
                ४ अंकी ऑपरेटर पिन टाका
              </span>
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-black ${
                      pin.length > idx
                        ? "border-brand bg-brand-light/30 text-brand"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {pin.length > idx ? "•" : ""}
                  </div>
                ))}
              </div>
            </div>

            {operatorError && (
              <p className="text-sm font-bold text-danger text-center">
                {operatorError}
              </p>
            )}

            {/* Big Numpad */}
            <Numpad
              onDigit={handleDigit}
              onClear={handleClear}
              onBackspace={handleBackspace}
              allowDecimal={false}
            />

            <Button
              type="button"
              onClick={handleOperatorLogin}
              disabled={loading || pin.length < 4}
              size="large"
              className="w-full mt-2"
            >
              {loading ? "लॉगिन होत आहे..." : "लॉगिन करा (Login)"}
            </Button>
          </div>
        ) : (
          /* Office Manager Login Form */
          <form onSubmit={handleOfficeLogin} className="flex flex-col gap-4">
            <Field
              label="Office Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="office@latur-fpc.org"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {officeError && (
              <p className="text-sm font-bold text-danger">{officeError}</p>
            )}
            <Button
              type="submit"
              disabled={loading}
              size="large"
              className="w-full mt-2"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

