import React, { useState } from "react";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { Numpad } from "../ui/Numpad.js";
import { db, getActiveUser, saveActiveUser, isOfflineUnlockValid, ActiveUserRecord } from "../offline/db.js";
import { t } from "../i18n/mr.js";

export interface LoginProps {
  onLoginSuccess?: (user: ActiveUserRecord, nextSlipNo?: number) => void;
}

// SHA-256 of pin + centreCode, stored locally so an offline unlock can only
// happen on a device that previously verified this exact PIN with the server.
async function pinFingerprint(pin: string, centreCode: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pin}:${centreCode}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
      setOperatorError(t("auth.pinTooShort"));
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
        setOperatorError(data.error || t("auth.loginFailed"));
        return;
      }

      const data = await res.json();
      const user: ActiveUserRecord = {
        id: data.user.id,
        role: data.user.role,
        name: data.user.name,
        centreId: data.user.centreId,
        centreCode: data.user.centreCode,
        authAt: new Date().toISOString(),
      };
      await saveActiveUser(user);
      await db.meta.put({ key: "pinFingerprint", value: await pinFingerprint(pin, user.centreCode ?? centreCode) });
      onLoginSuccess?.(user, data.nextSlipNo);
    } catch {
      // Offline unlock: only for a device that already verified this centre +
      // PIN with the server within the last 48 hours. No hardcoded demo PINs.
      const cached = await getActiveUser();
      const storedFingerprint = (await db.meta.get("pinFingerprint"))?.value as string | undefined;

      if (
        cached &&
        cached.role === "operator" &&
        cached.centreCode === centreCode &&
        isOfflineUnlockValid(cached) &&
        storedFingerprint &&
        storedFingerprint === (await pinFingerprint(pin, centreCode))
      ) {
        onLoginSuccess?.(cached);
      } else {
        setOperatorError(t("auth.offlineLocked"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOfficeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setOfficeError(t("auth.officeFill"));
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
        setOfficeError(data.error || t("auth.officeFailed"));
        return;
      }

      const data = await res.json();
      const user: ActiveUserRecord = {
        id: data.user.id,
        role: data.user.role,
        name: data.user.name,
        authAt: new Date().toISOString(),
      };
      await saveActiveUser(user);
      onLoginSuccess?.(user);
    } catch {
      // The office works from HQ and must always authenticate against the server.
      setOfficeError(t("auth.officeOffline"));
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
              {t("auth.portalAccess")}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider bg-chaos-black text-white px-2 py-0.5">
              VERSION 2.4
            </span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight leading-none text-chaos-black">
            {t("auth.orgTitle")}
          </h1>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            {t("auth.orgSub")}
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
                {t("auth.centreLabel")}
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
                {t("auth.enterPin")}
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
