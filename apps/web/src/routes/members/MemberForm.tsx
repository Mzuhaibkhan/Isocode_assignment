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
    <div className="bg-white border-2 border-stone-800 rounded-2xl p-5 shadow-lg max-w-lg mx-auto">
      <div className="border-b-2 border-stone-200 pb-3 mb-4 flex justify-between items-center">
        <h2 className="text-xl font-extrabold text-text-main">
          नवीन शेतकरी सभासद नोंदणी
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-stone-500 font-bold text-lg hover:text-black p-1"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-danger text-danger text-sm font-bold p-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="शेतकरी कोड (Farmer Code)"
            value={farmerCode}
            onChange={(e) => setFarmerCode(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1 w-full">
            <label htmlFor="village-select" className="text-sm font-bold text-text-main">
              गाव (Village)
            </label>
            <select
              id="village-select"
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              className="w-full min-h-touch px-4 py-3 rounded-lg border-2 border-stone-700 text-lg text-text-main bg-white"
            >
              <option value="Ausa">औसा (Ausa)</option>
              <option value="Renapur">रेणापूर (Renapur)</option>
              <option value="Shirur Anantpal">शिरूर अनंतपाळ (Shirur Anantpal)</option>
              <option value="Nilanga">निलंगा (Nilanga)</option>
            </select>
          </div>
        </div>

        <Field
          label="शेतकऱ्याचे नाव (मराठीत)"
          placeholder="उदा. सुनील बापूराव जाधव"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Field
          label="नाव इंग्रजीत (Name in English, optional for fast search)"
          placeholder="e.g. Sunil Jadhav"
          value={nameLatin}
          onChange={(e) => setNameLatin(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="जमीन क्षेत्र (एकरी)"
            placeholder="उदा. 4.5"
            type="number"
            step="0.1"
            value={landAcres}
            onChange={(e) => setLandAcres(e.target.value)}
            required
          />
          <Field
            label="मोबाईल नंबर (१० अंकी)"
            placeholder="९८२२०xxxxx"
            type="tel"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="बँक खाते क्रमांक"
            placeholder="Account Number"
            type="text"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            required
          />
          <Field
            label="IFSC कोड"
            placeholder="उदा. MAHB0000123"
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value)}
            required
          />
        </div>

        {/* DPDP Consent Section */}
        <div className="bg-amber-50/80 border-2 border-amber-300 p-4 rounded-xl flex flex-col gap-2">
          <span className="text-xs font-black uppercase text-amber-900 tracking-wider">
            कायदेशीर संमती (DPDP Act 2023 Consent - आवृत्ती १)
          </span>
          <p className="text-xs font-medium text-stone-800 leading-relaxed">
            "मी याद्वारे लातूर शेतकरी उत्पादक कंपनीला माझ्या शेतीमालाची खरेदी, वजन, प्रतवारी आणि बँक खात्यात थेट रक्कम जमा करण्यासाठी माझी वैयक्तिक माहिती (नाव, गाव, मोबाईल, बँक तपशील) वापरण्यास सहमती देत आहे. डिजिटल वैयक्तिक डेटा संरक्षण कायदा २०२३ अंतर्गत माझे अधिकार मला मान्य आहेत."
          </p>
          <label className="flex items-center gap-2.5 mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="w-5 h-5 rounded border-2 border-stone-800 text-brand focus:ring-brand"
            />
            <span className="text-sm font-bold text-text-main">
              शेतकऱ्याने प्रत्यक्ष सहमती दिली आहे (Consent Confirmed)
            </span>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="w-1/2"
          >
            रद्द करा (Cancel)
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="w-1/2"
          >
            {loading ? "नोंदणी होत आहे..." : "नोंदणी पूर्ण करा (Save)"}
          </Button>
        </div>
      </form>
    </div>
  );
};

