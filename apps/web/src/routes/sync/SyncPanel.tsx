import { useState, useEffect } from "react";
import { db, OutboxEntry } from "../../offline/db.js";
import { getOrCreateDeviceKey } from "../../offline/signer.js";
import { syncPurchases, simulateTamperOutbox } from "../../offline/syncClient.js";
import { formatRupees, SYNC_REASON_LABELS_MR } from "@procurement/shared";

const REASON_LABELS: Record<string, string> = {
  ...SYNC_REASON_LABELS_MR,
  REJECTED: "नोंद नाकारण्यात आली",
};

export function SyncPanel() {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<OutboxEntry | null>(null);

  const loadOutbox = async () => {
    const list = await db.outbox.orderBy("seq").reverse().toArray();
    setEntries(list);
    const { deviceId: devId } = await getOrCreateDeviceKey();
    setDeviceId(devId);
  };

  useEffect(() => {
    loadOutbox();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(loadOutbox, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setStatusMessage("सर्व्हरशी संपर्क साधत आहे...");

    try {
      const res = await syncPurchases();
      await loadOutbox();

      if (res.error) {
        setStatusMessage(`सिंक अयशस्वी: ${res.error}`);
      } else if (res.syncedCount === 0 && res.rejectedCount === 0 && res.heldCount === 0) {
        setStatusMessage("कोणतीही नवीन नोंद प्रलंबित नाही. सर्व नोंदी अद्ययावत आहेत.");
      } else {
        setStatusMessage(
          `सिंक पूर्ण! समक्रमित: ${res.syncedCount}, प्रलंबित/होल्ड: ${res.heldCount}, नाकारलेले: ${res.rejectedCount}`
        );
      }
    } catch (err: any) {
      setStatusMessage(`त्रुटी: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSimulateTamper = async () => {
    setIsSyncing(true);
    setStatusMessage("छेडछाड चाचणी सुरू आहे (IndexedDB मधील वजन बदलले जात आहे)...");

    try {
      // 1. Mutate gross weight in outbox without updating signature or hash
      const tampered = await simulateTamperOutbox();
      if (!tampered) {
        setStatusMessage("छेडछाड करण्यासाठी आऊटबॉक्समध्ये कोणतीही नोंद आढळली नाही. कृपया प्रथम खरेदी नोंदवा.");
        setIsSyncing(false);
        return;
      }

      await loadOutbox();
      setStatusMessage("वजन बदलले गेले! आता सर्व्हर पडताळणीसाठी पाठवत आहे...");

      // 2. Trigger sync to test server rejection
      const res = await syncPurchases();
      await loadOutbox();

      if (res.rejectedCount > 0) {
        setStatusMessage(
          "यशस्वी चाचणी: सर्व्हरने छेडछाड ओळखली आणि नोंद तत्काळ 'HASH_MISMATCH' म्हणून नाकारली!"
        );
      } else {
        setStatusMessage(`सिंक प्रतिसाद: ${JSON.stringify(res)}`);
      }
    } catch (err: any) {
      setStatusMessage(`त्रुटी: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const syncedCount = entries.filter((e) => e.status === "synced").length;
  const rejectedCount = entries.filter((e) => e.status === "rejected").length;

  return (
    <div className="space-y-6">
      {/* Header & Device Info */}
      <div className="bg-white border-2 border-stone-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-stone-900">
                🔄 ऑफलाइन सिंक स्थिती (Tamper-Proof Outbox)
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  isOnline
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-red-100 text-red-800 border border-red-300"
                }`}
              >
                {isOnline ? "ऑनलाइन (Online)" : "ऑफलाइन (Offline)"}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1 font-mono">
              साधन आयडी (Device ID): <strong className="text-stone-800">{deviceId || "शोधत आहे..."}</strong> | 
              क्रिप्टो अल्गोरिदम: <strong className="text-stone-800">ECDSA P-256 + SHA-256 Hash Chain</strong>
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline}
              className={`min-h-touch px-4 py-2.5 rounded-lg font-black text-sm transition-all flex items-center gap-2 ${
                isSyncing || !isOnline
                  ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                  : "bg-brand text-white hover:bg-stone-900 active:scale-95 shadow"
              }`}
            >
              {isSyncing ? "सिंक होत आहे..." : "🔄 आता सिंक करा (Sync Now)"}
            </button>

            <button
              onClick={handleSimulateTamper}
              disabled={isSyncing || entries.length === 0}
              className={`min-h-touch px-3 py-2.5 rounded-lg font-bold text-xs transition-all border ${
                isSyncing || entries.length === 0
                  ? "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                  : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 active:scale-95"
              }`}
              title="स्थानिक डेटाबेसमध्ये फेरफार करून सर्व्हरच्या HASH_MISMATCH सुरक्षेची चाचणी घ्या"
            >
              ⚠️ छेडछाड चाचणी (Tamper Test)
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-4 p-3 bg-stone-100 border border-stone-300 rounded-lg text-sm text-stone-800 font-semibold flex items-center justify-between">
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs text-stone-500 hover:text-stone-900 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
            प्रलंबित नोंदी (Pending Sync)
          </span>
          <span className="text-3xl font-black text-amber-950 mt-1 block">
            {pendingCount}
          </span>
          <span className="text-xs text-amber-700 mt-1 block">स्थानिक मेमरीमध्ये सुरक्षित</span>
        </div>

        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 text-center">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
            समक्रमित नोंदी (Synced to Server)
          </span>
          <span className="text-3xl font-black text-emerald-950 mt-1 block">
            {syncedCount}
          </span>
          <span className="text-xs text-emerald-700 mt-1 block">मुख्यालयाला प्राप्त</span>
        </div>

        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-center">
          <span className="text-xs font-bold text-red-800 uppercase tracking-wider block">
            नाकारलेले फेरफार (Rejected)
          </span>
          <span className="text-3xl font-black text-red-950 mt-1 block">
            {rejectedCount}
          </span>
          <span className="text-xs text-red-700 mt-1 block">छेडछाड किंवा त्रुटीमुळे बाद</span>
        </div>
      </div>

      {/* Outbox Entries Table */}
      <div className="bg-white border-2 border-stone-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50">
          <h2 className="text-base font-extrabold text-stone-900">
            स्थानिक आउटबॉक्स नोंदी (Outbox Chain)
          </h2>
          <span className="text-xs text-stone-500 font-semibold">
            एकूण नोंदी: {entries.length}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center text-stone-500 text-sm">
            स्थानिक आउटबॉक्स रिकामे आहे. 'नवीन खरेदी' टॅबमधून खरेदी नोंदवा.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-100 text-stone-700 font-bold border-b border-stone-300 text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">क्रम (Seq)</th>
                  <th className="py-2.5 px-3">पावती क्रमांक</th>
                  <th className="py-2.5 px-3">पीक व वजन</th>
                  <th className="py-2.5 px-3">एकूण रक्कम</th>
                  <th className="py-2.5 px-3">स्थिती</th>
                  <th className="py-2.5 px-3">तपशील / कारण</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 font-medium">
                {entries.map((entry) => {
                  const p = entry.payload as any;
                  const cropLabel = p.crop === "Soybean" ? "सोयाबीन" : p.crop === "Tur" ? "तूर" : p.crop;
                  const netKg = p.netX10 ? (p.netX10 / 10).toFixed(1) : "-";
                  const amount = p.amountPaise ? formatRupees(p.amountPaise) : "-";
                  const reasonMarathi = entry.reason ? REASON_LABELS[entry.reason] || entry.reason : null;

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-stone-50 transition-colors ${
                        entry.status === "rejected" ? "bg-red-50/50" : ""
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-stone-900">
                        #{entry.seq}
                      </td>
                      <td className="py-3 px-3 font-black text-stone-950">
                        {p.slipNo || entry.id.slice(0, 8)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-stone-800">{cropLabel}</span>
                        <span className="text-xs text-stone-500 block">{netKg} किग्रॅ</span>
                      </td>
                      <td className="py-3 px-3 font-extrabold text-stone-900">
                        {amount}
                      </td>
                      <td className="py-3 px-3">
                        {entry.status === "pending" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            ⏳ प्रलंबित
                          </span>
                        )}
                        {entry.status === "synced" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ✓ समक्रमित
                          </span>
                        )}
                        {entry.status === "rejected" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                            ✗ नाकारले
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {reasonMarathi ? (
                          <span className="text-xs font-bold text-red-700 bg-red-100/80 px-2 py-0.5 rounded inline-block">
                            {reasonMarathi}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">-</span>
                        )}
                        <button
                          onClick={() => setSelectedEntry(entry)}
                          className="ml-2 text-xs text-stone-500 hover:text-stone-900 underline block mt-0.5"
                        >
                          क्रिप्टो तपासणी 🔍
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal / Dialog showing cryptographic proof */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-stone-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border-2 border-stone-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-black text-stone-900">
                क्रिप्टोग्राफिक स्वाक्षरी आणि हॅश साखळी (#seq {selectedEntry.seq})
              </h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-stone-500 hover:text-stone-900 font-black text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className="font-bold text-stone-600 block">पावती ओळख (ID):</span>
                <span className="text-stone-900 bg-stone-100 p-1.5 rounded block break-all">
                  {selectedEntry.id}
                </span>
              </div>

              <div>
                <span className="font-bold text-stone-600 block">मागील नोंदीचा हॅश (prevHash):</span>
                <span className="text-stone-900 bg-stone-100 p-1.5 rounded block break-all">
                  {selectedEntry.prevHash}
                </span>
              </div>

              <div>
                <span className="font-bold text-stone-600 block">या नोंदीचा हॅश (entryHash):</span>
                <span className="text-stone-900 bg-stone-100 p-1.5 rounded block break-all font-bold">
                  {selectedEntry.entryHash}
                </span>
              </div>

              <div>
                <span className="font-bold text-stone-600 block">ECDSA P-256 डिजिटल स्वाक्षरी (signature):</span>
                <span className="text-emerald-900 bg-emerald-50 border border-emerald-200 p-1.5 rounded block break-all font-semibold">
                  {selectedEntry.signature}
                </span>
              </div>

              <div>
                <span className="font-bold text-stone-600 block">पेलोड (Payload):</span>
                <pre className="text-stone-800 bg-stone-100 p-2 rounded text-[11px] overflow-x-auto">
                  {JSON.stringify(selectedEntry.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="text-right pt-2 border-t">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg font-bold text-sm hover:bg-stone-800"
              >
                बंद करा (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
