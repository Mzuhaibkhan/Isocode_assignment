import React, { useState } from "react";
import { Button } from "../../ui/Button.js";
import { Field } from "../../ui/Field.js";

export interface MemberFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const MemberForm: React.FC<MemberFormProps> = ({ onSuccess, onCancel }) => {
  const [farmerCode, setFarmerCode] = useState(`FMR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [name, setName] = useState("");
  const [nameLatin, setNameLatin] = useState("");
  const [village, setVillage] = useState("Ausa");
  const [landAcres, setLandAcres] = useState("3.5");
  const [mobile, setMobile] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState("MAHB0000123");
  const [consentGiven, setConsentGiven] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentGiven) {
      setError("कृपया डीपीडीपी कायदा २०२३ अंतर्गत शेतकऱ्याची संमती नोंदवा.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const landTenthsAcre = Math.round(parseFloat(landAcres) * 10);
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmerCode,
          name,
          nameLatin: nameLatin || undefined,
          village,
          landTenthsAcre,
          mobile,
          bankAccount,
          ifsc: ifsc.toUpperCase(),
          consentAt: new Date().toISOString(),
          consentTextVersion: 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "सभासद नोंदणी अयशस्वी झाली.");
        return;
      }

      onSuccess();
    } catch {
      setError("सर्व्हरशी संपर्क होऊ शकला नाही.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile-lg max-w-xl mx-auto font-sans animate-slideUp">
      <div className="border-b-2 border-chaos-black pb-4 mb-5 flex justify-between items-start">
        <div>
          <span className="font-mono text-xs uppercase text-chaos-orange font-bold tracking-widest block">
            NEW MEMBER ENROLLMENT // नोंदणी
          </span>
          <h2 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tight text-chaos-black">
            नवीन शेतकरी सभासद नोंदणी
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-xs font-bold border-2 border-chaos-black px-2 py-1 bg-chaos-canvas hover:bg-chaos-black hover:text-white transition-all shadow-tactile-sm"
        >
          ✕ CLOSE
        </button>
      </div>

      {error && (
        <div className="border-2 border-red-600 bg-red-50 text-red-800 font-mono text-xs font-bold p-3 mb-5 uppercase tracking-wide">
          [!] {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="शेतकरी कोड (FARMER CODE)"
            value={farmerCode}
            onChange={(e) => setFarmerCode(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="village-select" className="font-mono text-xs uppercase font-bold tracking-wider text-chaos-black">
              गाव (VILLAGE)
            </label>
            <select
              id="village-select"
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-none border-2 border-chaos-black text-sm font-mono font-bold text-chaos-black bg-chaos-paper focus:bg-white focus:outline-none focus:shadow-tactile-orange"
            >
              <option value="Ausa">औसा (AUSA)</option>
              <option value="Renapur">रेणापूर (RENAPUR)</option>
              <option value="Shirur Anantpal">शिरूर अनंतपाळ (SHIRUR)</option>
              <option value="Nilanga">निलंगा (NILANGA)</option>
            </select>
          </div>
        </div>

        <Field
          label="शेतकऱ्याचे नाव (NAME IN MARATHI)"
          placeholder="उदा. सुनील बापूराव जाधव"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Field
          label="नाव इंग्रजीत (NAME IN ENGLISH - FOR SEARCH)"
          placeholder="e.g. Sunil Jadhav"
          value={nameLatin}
          onChange={(e) => setNameLatin(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="जमीन क्षेत्र (LAND IN ACRES)"
            placeholder="उदा. 4.5"
            type="number"
            step="0.1"
            value={landAcres}
            onChange={(e) => setLandAcres(e.target.value)}
            required
          />
          <Field
            label="मोबाईल नंबर (10 DIGIT MOBILE)"
            placeholder="98220xxxxx"
            type="tel"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="बँक खाते क्रमांक (ACCOUNT NO)"
            placeholder="Account Number"
            type="text"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            required
          />
          <Field
            label="IFSC कोड (IFSC CODE)"
            placeholder="MAHB0000123"
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value)}
            required
          />
        </div>

        {/* DPDP Consent Section */}
        <div className="bg-chaos-canvas border-2 border-chaos-black p-4 flex flex-col gap-2.5 shadow-tactile-sm">
          <span className="font-mono text-xs font-black uppercase text-chaos-orange tracking-widest">
            कायदेशीर संमती // DPDP ACT 2023 CONSENT (v1)
          </span>
          <p className="font-sans text-xs text-chaos-black/90 leading-relaxed">
            "मी याद्वारे लातूर शेतकरी उत्पादक कंपनीला माझ्या शेतीमालाची खरेदी, वजन, प्रतवारी आणि बँक खात्यात थेट रक्कम जमा करण्यासाठी माझी वैयक्तिक माहिती (नाव, गाव, मोबाईल, बँक तपशील) वापरण्यास सहमती देत आहे. डिजिटल वैयक्तिक डेटा संरक्षण कायदा २०२३ अंतर्गत माझे अधिकार मला मान्य आहेत."
          </p>
          <label className="flex items-center gap-3 mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="w-5 h-5 rounded-none border-2 border-chaos-black text-chaos-black accent-chaos-orange focus:ring-0 cursor-pointer"
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-black">
              शेतकऱ्याने प्रत्यक्ष सहमती दिली आहे [CONSENT CONFIRMED]
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="w-full"
          >
            रद्द करा // CANCEL
          </Button>
          <Button
            type="submit"
            variant="orange"
            disabled={loading}
            className="w-full"
          >
            {loading ? "नोंदणी होत आहे..." : "नोंदणी पूर्ण करा // SAVE"}
          </Button>
        </div>
      </form>
    </div>
  );
};
