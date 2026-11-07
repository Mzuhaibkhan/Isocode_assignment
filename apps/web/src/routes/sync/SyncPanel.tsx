import { useState, useEffect } from "react";
import { db, OutboxEntry } from "../../offline/db.js";
import { getOrCreateDeviceKey } from "../../offline/signer.js";
import { syncPurchases, simulateTamperOutbox } from "../../offline/syncClient.js";
import { formatRupees, SYNC_REASON_LABELS_MR } from "@procurement/shared";
import { Button } from "../../ui/Button.js";

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
    setStatusMessage("सर्व्हरशी संपर्क साधत आहे... [SYNCING ENCLAVE]");

    try {
      const res = await syncPurchases();
      await loadOutbox();

      if (res.error) {
        setStatusMessage(`सिंक अयशस्वी: ${res.error}`);
      } else if (res.syncedCount === 0 && res.rejectedCount === 0 && res.heldCount === 0) {
        setStatusMessage("कोणतीही नवीन नोंद प्रलंबित नाही. सर्व नोंदी अद्ययावत आहेत. [ALL CACHES SYNCED]");
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
    setStatusMessage("छेडछाड चाचणी सुरू आहे (INDEXEDDB MUTATING VALUE WITHOUT VALID SIGNATURE)...");

    try {
      const tampered = await simulateTamperOutbox();
      if (!tampered) {
        setStatusMessage("छेडछाड करण्यासाठी आऊटबॉक्समध्ये कोणतीही नोंद आढळली नाही. कृपया प्रथम खरेदी नोंदवा.");
        setIsSyncing(false);
        return;
      }

      await loadOutbox();
      setStatusMessage("वजन बदलले गेले! आता सर्व्हर पडताळणीसाठी पाठवत आहे...");

      const res = await syncPurchases();
      await loadOutbox();

      if (res.rejectedCount > 0) {
        setStatusMessage(
          "यशस्वी चाचणी: सर्व्हरने छेडछाड ओळखली आणि नोंद तत्काळ 'HASH_MISMATCH' म्हणून नाकारली! [CRYPTO DEFENSE ACTIVE]"
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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-1 font-sans">
      {/* Header & Device Masthead */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
                CRYPTOGRAPHIC ENCLAVE // सिंक स्थिती
              </span>
              <span
                className={`font-mono text-[10px] px-2 py-0.5 border font-bold uppercase tracking-wider ${
                  isOnline
                    ? "bg-white text-emerald-800 border-emerald-600"
                    : "bg-red-100 text-red-700 border-red-600"
                }`}
              >
                {isOnline ? "ONLINE // जोडलेले" : "OFFLINE // स्थानिक"}
              </span>
            </div>
            <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
              ऑफलाइन सिंक स्थिती (TAMPER-PROOF OUTBOX)
            </h2>
            <p className="font-mono text-xs text-chaos-muted uppercase tracking-wider mt-1">
              DEVICE: <span className="text-chaos-black font-bold">{deviceId || "INITIALIZING..."}</span> • PROTOCOL:{" "}
              <span className="text-chaos-black font-bold">ECDSA P-256 + SHA-256 HASH CHAIN</span>
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2.5">
            <Button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline}
              variant="orange"
              size="default"
              className="shadow-tactile-sm"
            >
              {isSyncing ? "सिंक होत आहे..." : "🔄 आता सिंक करा // SYNC NOW"}
            </Button>

            <Button
              onClick={handleSimulateTamper}
              disabled={isSyncing || entries.length === 0}
              variant="secondary"
              size="default"
              className="shadow-tactile-sm"
              title="स्थानिक डेटाबेसमध्ये फेरफार करून सर्व्हरच्या HASH_MISMATCH सुरक्षेची चाचणी घ्या"
            >
              ⚠️ छेडछाड चाचणी // TEST TAMPER
            </Button>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-5 p-3.5 bg-chaos-canvas border-2 border-chaos-black font-mono text-xs font-bold text-chaos-black flex items-center justify-between uppercase tracking-wide">
            <span>[i] {statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="font-mono text-xs text-chaos-muted hover:text-chaos-black font-black ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile text-left">
          <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-widest block">
            01 // प्रलंबित नोंदी (PENDING)
          </span>
          <span className="font-display font-black text-5xl text-chaos-black block my-1 tracking-tight">
            {pendingCount}
          </span>
          <span className="font-mono text-[11px] text-chaos-orange uppercase tracking-wider block">
            SECURE LOCAL BUFFER
          </span>
        </div>

        <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile text-left">
          <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-widest block">
            02 // समक्रमित नोंदी (SYNCED)
          </span>
          <span className="font-display font-black text-5xl text-chaos-black block my-1 tracking-tight">
            {syncedCount}
          </span>
          <span className="font-mono text-[11px] text-emerald-800 uppercase tracking-wider block">
            ACKNOWLEDGED BY HQ
          </span>
        </div>

        <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile text-left">
          <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-widest block">
            03 // नाकारलेले फेरफार (REJECTED)
          </span>
          <span className="font-display font-black text-5xl text-red-600 block my-1 tracking-tight">
            {rejectedCount}
          </span>
          <span className="font-mono text-[11px] text-red-700 uppercase tracking-wider block">
            HASH / SIGNATURE REJECTED
          </span>
        </div>
      </div>

      {/* Outbox Entries Table */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile">
        <div className="pb-4 mb-4 border-b-2 border-chaos-black flex justify-between items-center">
          <h2 className="font-display font-black text-2xl uppercase tracking-tight text-chaos-black">
            स्थानिक आउटबॉक्स नोंदी (OUTBOX CHAIN)
          </h2>
          <span className="font-mono text-xs text-chaos-muted uppercase">
            TOTAL RECORDS: {entries.length}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="p-12 text-center text-chaos-muted font-mono text-xs uppercase tracking-wider border-2 border-dashed border-chaos-black/40 bg-chaos-canvas">
            [ स्थानिक आउटबॉक्स रिकामे आहे // OUTBOX BUFFER EMPTY ]
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b-2 border-chaos-black text-chaos-muted uppercase">
                  <th className="py-2.5 px-3">SEQ</th>
                  <th className="py-2.5 px-3">पावती क्रमांक (SLIP)</th>
                  <th className="py-2.5 px-3">पीक व वजन (COMMODITY)</th>
                  <th className="py-2.5 px-3">रक्कम (AMOUNT)</th>
                  <th className="py-2.5 px-3">स्थिती (STATUS)</th>
                  <th className="py-2.5 px-3">तपासणी (INSPECT)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const p = entry.payload as any;
                  const cropLabel = p.crop === "Soybean" ? "सोयाबीन" : p.crop === "Tur" ? "तूर" : p.crop;
                  const netKg = p.netX10 ? (p.netX10 / 10).toFixed(1) : "-";
                  const amount = p.amountPaise ? formatRupees(p.amountPaise) : "-";
                  const reasonMarathi = entry.reason ? REASON_LABELS[entry.reason] || entry.reason : null;

                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-stone-300 hover:bg-chaos-canvas transition-colors ${
                        entry.status === "rejected" ? "bg-red-50/60" : ""
                      }`}
                    >
                      <td className="py-3 px-3 font-bold text-chaos-black">
                        #{entry.seq}
                      </td>
                      <td className="py-3 px-3 font-bold text-chaos-black">
                        {p.slipNo || entry.id.slice(0, 8)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-sans font-bold text-chaos-black">{cropLabel}</span>
                        <span className="text-[11px] text-chaos-muted block">{netKg} KG</span>
                      </td>
                      <td className="py-3 px-3 font-bold text-chaos-black">
                        {amount}
                      </td>
                      <td className="py-3 px-3">
                        {entry.status === "pending" && (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-950 border border-chaos-orange uppercase">
                            ⏳ PENDING
                          </span>
                        )}
                        {entry.status === "synced" && (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-600 uppercase">
                            ✓ SYNCED
                          </span>
                        )}
                        {entry.status === "rejected" && (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-950 border border-red-600 uppercase">
                            ✗ REJECTED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {reasonMarathi && (
                          <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 border border-red-300 inline-block mb-1">
                            {reasonMarathi}
                          </span>
                        )}
                        <button
                          onClick={() => setSelectedEntry(entry)}
                          className="font-mono text-xs font-bold text-chaos-black hover:text-chaos-orange underline block"
                        >
                          PROVE CRYPTO 🔍
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

      {/* Cryptographic Inspector Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-chaos-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-chaos-paper border-2 border-chaos-black shadow-tactile-lg max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto font-sans animate-slideUp">
            <div className="flex justify-between items-start border-b-2 border-chaos-black pb-3">
              <div>
                <span className="font-mono text-xs text-chaos-orange uppercase font-bold tracking-widest block">
                  CHAIN FORENSICS // पडताळणी
                </span>
                <h3 className="font-display font-black text-2xl uppercase tracking-tight text-chaos-black">
                  क्रिप्टोग्राफिक स्वाक्षरी आणि हॅश साखळी (#SEQ {selectedEntry.seq})
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="font-mono text-sm font-black border-2 border-chaos-black px-2 py-1 bg-chaos-canvas hover:bg-chaos-black hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <span className="font-bold uppercase text-chaos-muted block mb-1">
                  पावती ओळख (RECORD ID):
                </span>
                <span className="text-chaos-black bg-white p-2 border border-chaos-black block break-all font-mono">
                  {selectedEntry.id}
                </span>
              </div>

              <div>
                <span className="font-bold uppercase text-chaos-muted block mb-1">
                  मागील नोंदीचा हॅश (PREVIOUS HASH):
                </span>
                <span className="text-chaos-black bg-white p-2 border border-chaos-black block break-all font-mono">
                  {selectedEntry.prevHash}
                </span>
              </div>

              <div>
                <span className="font-bold uppercase text-chaos-muted block mb-1">
                  या नोंदीचा हॅश (ENTRY HASH):
                </span>
                <span className="text-chaos-black bg-white p-2 border border-chaos-black block break-all font-mono font-bold text-chaos-orange">
                  {selectedEntry.entryHash}
                </span>
              </div>

              <div>
                <span className="font-bold uppercase text-chaos-muted block mb-1">
                  ECDSA P-256 डिजिटल स्वाक्षरी (DEVICE SIGNATURE):
                </span>
                <span className="text-chaos-black bg-emerald-50 border border-emerald-600 p-2 block break-all font-mono">
                  {selectedEntry.signature}
                </span>
              </div>

              <div>
                <span className="font-bold uppercase text-chaos-muted block mb-1">
                  पेलोड डेटा (PAYLOAD BLOB):
                </span>
                <pre className="text-chaos-black bg-white border border-chaos-black p-3 text-[11px] overflow-x-auto font-mono">
                  {JSON.stringify(selectedEntry.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="text-right pt-3 border-t-2 border-chaos-black">
              <Button
                variant="primary"
                onClick={() => setSelectedEntry(null)}
                className="shadow-tactile-sm"
              >
                बंद करा // CLOSE
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
