import React, { useState, useEffect } from "react";
import { Button } from "../../ui/Button.js";
import { MemberForm } from "./MemberForm.js";
import { db, CachedMember } from "../../offline/db.js";
import { syncMembersAndPrices } from "../../offline/syncMembersAndPrices.js";

export const MemberList: React.FC = () => {
  const [members, setMembers] = useState<CachedMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const loadMembers = async (q = "") => {
    setLoading(true);
    try {
      const results = await db.searchMembers(q, 50);
      setMembers(results);
    } catch (err) {
      console.error("Failed to load members from Dexie:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      // Sync from API if online, then load from Dexie
      await syncMembersAndPrices();
      await loadMembers();
    })();
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    loadMembers(q);
  };

  const handleVerifyBank = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/members/${id}/verify-bank`, { method: "POST" });
      if (res.ok) {
        setStatusMsg(`✓ ${name} यांचे बँक खाते पडताळणी पूर्ण झाली.`);
        await syncMembersAndPrices();
        await loadMembers(searchQuery);
        setTimeout(() => setStatusMsg(""), 4000);
      }
    } catch {
      alert("बँक पडताळणी अयशस्वी झाली.");
    }
  };

  const handleWithdrawConsent = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `सावधान: ${name} यांची संमती मागे घेतल्यास नवीन शेतीमाल खरेदी करता येणार नाही.\n(मागील खरेदीची रक्कम खात्यावर जमा होईल.)\n\nसंमती मागे घ्यायची का?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/members/${id}/withdraw-consent`, { method: "POST" });
      if (res.ok) {
        setStatusMsg(`⚠️ ${name} यांची संमती मागे नोंदवली गेली.`);
        await syncMembersAndPrices();
        await loadMembers(searchQuery);
        setTimeout(() => setStatusMsg(""), 4000);
      }
    } catch {
      alert("संमती मागे घेण्याची प्रक्रिया अयशस्वी झाली.");
    }
  };

  if (showAddForm) {
    return (
      <MemberForm
        onSuccess={async () => {
          setShowAddForm(false);
          await syncMembersAndPrices();
          await loadMembers();
          setStatusMsg("✓ नवीन शेतकरी यशस्वीरीत्या नोंदवला गेला.");
          setTimeout(() => setStatusMsg(""), 4000);
        }}
        onCancel={() => setShowAddForm(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto p-2">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white p-4 rounded-2xl border-2 border-stone-800 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-text-main">
            शेतकरी सभासद यादी (Member Registry)
          </h2>
          <p className="text-xs font-bold text-text-muted">
            एकूण सभासद: {members.length} | DPDP कायदा २०२३ सुरक्षित
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)} size="default">
          + नवीन शेतकरी जोडा
        </Button>
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 border-2 border-brand text-brand font-bold text-sm p-3 rounded-xl">
          {statusMsg}
        </div>
      )}

      {/* High-speed Realtime Search Bar */}
      <div className="bg-white p-3 rounded-2xl border-2 border-stone-700 shadow-sm">
        <label htmlFor="member-search" className="text-xs font-bold text-text-muted block mb-1">
          नाव, आडनाव (मराठी/English), शेतकरी कोड किंवा गावाने शोधा:
        </label>
        <input
          id="member-search"
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="उदा. जाधव, Sunil, FMR-001, Ausa..."
          className="w-full min-h-touch px-4 py-2.5 rounded-xl border-2 border-stone-800 text-lg font-bold text-text-main focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Member Cards List */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="text-center py-8 font-bold text-text-muted">
            सभासद शोधत आहे...
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border border-stone-300 font-bold text-text-muted">
            कोणताही शेतकरी सापडला नाही.
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className={`p-4 rounded-xl border-2 transition-all bg-white ${
                m.consentWithdrawn
                  ? "border-danger/60 bg-red-50/30"
                  : m.bankVerified
                  ? "border-stone-800"
                  : "border-amber-500"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black bg-stone-100 border border-stone-300 px-2 py-0.5 rounded text-stone-800">
                      {m.farmerCode}
                    </span>
                    <span className="text-xs font-bold text-text-muted">
                      गाव: {m.village} | जमीन: {(m.landTenthsAcre / 10).toFixed(1)} एकर
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-stone-950 mt-1">
                    {m.name}
                  </h3>
                  {m.nameLatin && (
                    <span className="text-xs font-semibold text-stone-600 block">
                      {m.nameLatin}
                    </span>
                  )}
                </div>

                {/* Status Badges */}
                <div className="flex flex-col items-end gap-1.5">
                  {m.consentWithdrawn ? (
                    <span className="text-xs font-extrabold bg-red-100 text-danger border border-danger/40 px-2 py-0.5 rounded-full">
                      सहमती मागे घेतली
                    </span>
                  ) : m.bankVerified ? (
                    <span className="text-xs font-extrabold bg-emerald-100 text-brand border border-brand/40 px-2 py-0.5 rounded-full">
                      बँक पडताळणी पूर्ण ✓
                    </span>
                  ) : (
                    <span className="text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-400 px-2 py-0.5 rounded-full">
                      पडताळणी प्रलंबित ✕
                    </span>
                  )}
                </div>
              </div>

              {/* Bank & Contact Details */}
              <div className="mt-3 pt-2.5 border-t border-stone-200 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-muted block">बँक खाते:</span>
                  <span className="font-bold text-stone-900 text-sm">
                    {m.bankAccountMasked} ({m.ifsc})
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">मोबाईल नंबर:</span>
                  <span className="font-bold text-stone-900 text-sm">
                    {m.mobile}
                  </span>
                </div>
              </div>

              {/* Office Manager Actions */}
              <div className="mt-3 pt-2 border-t border-stone-100 flex gap-2 justify-end">
                {!m.bankVerified && (
                  <button
                    onClick={() => handleVerifyBank(m.id, m.name)}
                    className="text-xs font-extrabold px-3 py-1.5 bg-emerald-50 text-brand border border-brand rounded-lg active:bg-emerald-100"
                  >
                    बँक पडताळणी करा (Verify Bank)
                  </button>
                )}
                {!m.consentWithdrawn && (
                  <button
                    onClick={() => handleWithdrawConsent(m.id, m.name)}
                    className="text-xs font-extrabold px-3 py-1.5 text-stone-600 border border-stone-300 rounded-lg hover:text-danger hover:border-danger"
                  >
                    संमती मागे घ्या (Withdraw Consent)
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

