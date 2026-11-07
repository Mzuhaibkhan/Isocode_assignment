import { useState, useEffect } from "react";
import { Button } from "../../ui/Button.js";

interface DeviceRow {
  id: string;
  userId: string;
  centreId: string;
  registeredAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
  centreCode?: string | null;
  centreName?: string | null;
  userName?: string | null;
}

export function DeviceManagement() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/devices");
      if (!res.ok) throw new Error(`सर्व्हर त्रुटी: ${res.status}`);
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err: any) {
      setError(err.message || "डिव्हाइस यादी लोड करता आली नाही");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRevoke = async (id: string) => {
    const reason = window.prompt(
      "डिव्हाइस रद्द करण्याचे कारण प्रविष्ट करा (Reason for revocation):",
      "मोबाईल हरवला किंवा बदलला (Device lost/replaced)"
    );
    if (!reason) return;

    try {
      setRevokingId(id);
      const res = await fetch(`/api/devices/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "डिव्हाइस रद्द करता आले नाही");
      }

      setNotice(`डिव्हाइस ${id} यशस्वीरित्या रद्द करण्यात आले. आता हे डिव्हाइस सिंक करू शकणार नाही.`);
      await fetchDevices();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-300 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900">
            📱 केंद्र साधने व सुरक्षा व्यवस्थापन (Device Management)
          </h2>
          <p className="text-xs text-stone-600 font-semibold mt-0.5">
            खरेदी केंद्रातील नोंदणीकृत मोबाईल्स आणि त्यांचे क्रिप्टोग्राफिक कीपेअर नियंत्रण (§9.1, §9.7).
          </p>
        </div>

        <Button variant="secondary" onClick={fetchDevices} className="text-xs py-1.5">
          🔄 रिफ्रेश
        </Button>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold p-3 rounded-xl flex justify-between items-center">
          <span>✓ {notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-stone-500 hover:text-stone-900 font-black text-sm ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 text-xs font-bold p-3 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-stone-500 font-bold text-sm bg-white rounded-xl border border-stone-200">
          ⏳ साधने लोड होत आहेत...
        </div>
      ) : devices.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-stone-200">
          <span className="text-xs text-stone-500 font-bold">कोणतेही नोंदणीकृत साधन आढळले नाही.</span>
        </div>
      ) : (
        <div className="bg-white border border-stone-300 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-700 flex justify-between items-center">
            <span>साधन व केंद्र तपशील</span>
            <span>स्थिती व कृती</span>
          </div>

          <div className="divide-y divide-stone-200">
            {devices.map((d) => {
              const isRevoked = !!d.revokedAt;
              return (
                <div key={d.id} className="p-4 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-stone-900 text-sm">
                        {d.id}
                      </span>
                      <span className="bg-stone-100 text-stone-700 text-xs font-bold px-2 py-0.5 rounded">
                        केंद्र: {d.centreCode || d.centreId} ({d.centreName || "लातूर"})
                      </span>
                    </div>

                    <div className="text-xs text-stone-600 font-medium">
                      <span>ऑपरेटर: <b>{d.userName || d.userId}</b></span> •{" "}
                      <span>नोंदणी: {new Date(d.registeredAt).toLocaleString("mr-IN")}</span>
                    </div>

                    {isRevoked && (
                      <div className="text-xs text-red-700 font-bold mt-1">
                        रद्द दिनांक: {new Date(d.revokedAt!).toLocaleString("mr-IN")}
                        {d.revocationReason && ` (कारण: ${d.revocationReason})`}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                        isRevoked
                          ? "bg-red-100 text-red-900 border border-red-300"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      }`}
                    >
                      {isRevoked ? "रद्द (Revoked)" : "सक्रिय (Active)"}
                    </span>

                    {!isRevoked && (
                      <button
                        type="button"
                        disabled={revokingId === d.id}
                        onClick={() => handleRevoke(d.id)}
                        className="bg-red-50 hover:bg-red-100 border border-red-300 text-red-900 text-xs font-black px-3 py-1.5 rounded-lg transition-all active:scale-95"
                      >
                        {revokingId === d.id ? "रद्द होत आहे..." : "साधन रद्द करा (Revoke)"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

