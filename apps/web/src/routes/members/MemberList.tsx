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
    <div className="flex flex-col gap-5 max-w-4xl mx-auto p-1 font-sans">
      {/* Top Brutalist Action Masthead */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
              MEMBERSHIP DIRECTORY // सभासद यादी
            </span>
            <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
              DPDP SECURE
            </span>
          </div>
          <h2 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tight text-chaos-black">
            शेतकरी सभासद यादी (MEMBER REGISTRY)
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-0.5">
            DEXIE LOCAL CACHE: {members.length} DISPLAYED • LATUR DISTRICT HUB
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          variant="orange"
          size="default"
          className="shadow-tactile-sm whitespace-nowrap"
        >
          + नवीन शेतकरी जोडा // ENROLL
        </Button>
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 border-2 border-emerald-600 text-emerald-900 font-mono text-xs font-bold p-3 shadow-tactile-sm uppercase tracking-wide">
          {statusMsg}
        </div>
      )}

      {/* Realtime Search Bar */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-4 shadow-tactile-sm">
        <label htmlFor="member-search" className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted block mb-2">
          नाव, आडनाव (मराठी/ENGLISH), शेतकरी कोड किंवा गावाने शोधा:
        </label>
        <div className="relative">
          <input
            id="member-search"
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="उदा. जाधव, Sunil, FMR-001, Ausa..."
            className="w-full min-h-[48px] px-4 py-2.5 rounded-none border-2 border-chaos-black text-base font-sans font-bold text-chaos-black bg-chaos-canvas focus:bg-white focus:outline-none focus:shadow-tactile-orange transition-all placeholder:text-chaos-muted"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                loadMembers("");
              }}
              className="absolute right-3 top-2.5 font-mono text-xs font-bold text-chaos-muted hover:text-chaos-black px-2 py-1"
            >
              ✕ CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Member Cards List */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="text-center py-12 font-mono text-xs uppercase tracking-wider text-chaos-muted bg-chaos-paper border-2 border-dashed border-chaos-black/40">
            [ सभासद शोधत आहे // QUERYING INDEXEDDB... ]
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 bg-chaos-paper border-2 border-dashed border-chaos-black/40 font-mono text-xs uppercase tracking-wider text-chaos-muted">
            [ कोणताही शेतकरी सापडला नाही // NO RECORDS FOUND ]
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className={`p-4 border-2 transition-all bg-chaos-paper shadow-tactile-sm hover:shadow-tactile ${
                m.consentWithdrawn
                  ? "border-red-600 bg-red-50/40"
                  : m.bankVerified
                  ? "border-chaos-black"
                  : "border-chaos-orange"
              }`}
            >
              <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-chaos-black text-chaos-orange px-2 py-0.5">
                      {m.farmerCode}
                    </span>
                    <span className="font-mono text-xs text-chaos-muted uppercase">
                      गाव: {m.village} • जमीन: {(m.landTenthsAcre / 10).toFixed(1)} एकर
                    </span>
                  </div>
                  <h3 className="font-sans font-black text-xl text-chaos-black mt-1">
                    {m.name}
                  </h3>
                  {m.nameLatin && (
                    <span className="font-mono text-xs text-chaos-muted uppercase tracking-wider block">
                      {m.nameLatin}
                    </span>
                  )}
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5">
                  {m.consentWithdrawn ? (
                    <span className="font-mono text-xs font-bold bg-red-600 text-white px-2 py-0.5 uppercase tracking-wide">
                      सहमती मागे घेतली [WITHDRAWN]
                    </span>
                  ) : m.bankVerified ? (
                    <span className="font-mono text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-600 px-2 py-0.5 uppercase tracking-wide">
                      बँक पडताळणी पूर्ण ✓ [VERIFIED]
                    </span>
                  ) : (
                    <span className="font-mono text-xs font-bold bg-amber-100 text-amber-950 border border-chaos-orange px-2 py-0.5 uppercase tracking-wide">
                      पडताळणी प्रलंबित [UNVERIFIED]
                    </span>
                  )}
                </div>
              </div>

              {/* Bank & Contact Details */}
              <div className="mt-3 pt-3 border-t border-dashed border-stone-300 grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                <div>
                  <span className="text-chaos-muted uppercase block">बँक खाते (ACCOUNT):</span>
                  <span className="font-bold text-chaos-black text-sm">
                    {m.bankAccountMasked} ({m.ifsc})
                  </span>
                </div>
                <div>
                  <span className="text-chaos-muted uppercase block">मोबाईल क्रमांक (MOBILE):</span>
                  <span className="font-bold text-chaos-black text-sm">
                    {m.mobile}
                  </span>
                </div>
              </div>

              {/* Office Manager Actions */}
              <div className="mt-3 pt-3 border-t border-stone-200 flex flex-wrap gap-2 justify-end">
                {!m.bankVerified && (
                  <button
                    onClick={() => handleVerifyBank(m.id, m.name)}
                    className="font-mono text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-emerald-700 text-white border-2 border-chaos-black shadow-tactile-sm hover:bg-emerald-800 transition-all active:translate-y-0.5"
                  >
                    बँक पडताळणी करा // VERIFY BANK
                  </button>
                )}
                {!m.consentWithdrawn && (
                  <button
                    onClick={() => handleWithdrawConsent(m.id, m.name)}
                    className="font-mono text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-chaos-canvas text-chaos-black border-2 border-chaos-black shadow-tactile-sm hover:bg-red-600 hover:text-white transition-all active:translate-y-0.5"
                  >
                    संमती मागे घ्या // WITHDRAW CONSENT
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
