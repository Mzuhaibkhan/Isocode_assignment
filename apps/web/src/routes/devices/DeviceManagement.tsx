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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-1 font-sans">
      {/* Masthead */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
              HARDWARE ENCLAVE REGISTRY // साधने
            </span>
            <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
              ECDSA P-256
            </span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
            केंद्र साधने व सुरक्षा व्यवस्थापन (DEVICES)
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            FIELD WEIGHMENT SMARTPHONES & CRYPTOGRAPHIC IDENTITY REPOSITORY (§9.1, §9.7)
          </p>
        </div>

        <Button variant="orange" onClick={fetchDevices} className="text-xs py-2 shadow-tactile-sm">
          🔄 REFRESH DEVICES
        </Button>
      </div>

      {notice && (
        <div className="bg-emerald-50 border-2 border-emerald-600 text-emerald-950 font-mono text-xs font-bold p-3.5 shadow-tactile-sm flex justify-between items-center uppercase tracking-wide">
          <span>✓ {notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="font-mono text-xs text-chaos-muted hover:text-chaos-black font-black ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-600 text-red-900 font-mono text-xs font-bold p-3.5 shadow-tactile-sm uppercase tracking-wide">
          [!] {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-chaos-muted font-mono text-xs uppercase tracking-wider bg-chaos-paper border-2 border-dashed border-chaos-black/40">
          [ ⏳ साधने लोड होत आहेत // QUERYING REGISTERED DEVICES... ]
        </div>
      ) : devices.length === 0 ? (
        <div className="p-12 text-center bg-chaos-paper border-2 border-dashed border-chaos-black/40 shadow-tactile">
          <span className="font-mono text-xs text-chaos-muted font-bold uppercase tracking-wider">
            [ कोणतेही नोंदणीकृत साधन आढळले नाही // NO DEVICES REGISTERED ]
          </span>
        </div>
      ) : (
        <div className="bg-chaos-paper border-2 border-chaos-black shadow-tactile overflow-hidden">
          <div className="p-3.5 bg-chaos-canvas border-b-2 border-chaos-black font-mono text-xs font-bold text-chaos-black uppercase tracking-wider flex justify-between items-center">
            <span>साधन व केंद्र तपशील (DEVICE IDENTITY)</span>
            <span>स्थिती व कृती (REVOCATION)</span>
          </div>

          <div className="divide-y border-chaos-black/20">
            {devices.map((d) => {
              const isRevoked = !!d.revokedAt;
              return (
                <div key={d.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-white transition-colors">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-chaos-black text-sm">
                        {d.id}
                      </span>
                      <span className="font-mono text-xs font-bold bg-chaos-canvas border border-chaos-black/30 px-2 py-0.5">
                        CENTRE: {d.centreCode || d.centreId} ({d.centreName || "लातूर"})
                      </span>
                    </div>

                    <div className="font-mono text-xs text-chaos-muted">
                      <span>ऑपरेटर: <b className="text-chaos-black">{d.userName || d.userId}</b></span> •{" "}
                      <span>नोंदणी: {new Date(d.registeredAt).toLocaleString("en-IN")}</span>
                    </div>

                    {isRevoked && (
                      <div className="font-mono text-xs text-red-700 font-bold mt-1 uppercase">
                        [!] REVOKED: {new Date(d.revokedAt!).toLocaleString("en-IN")}
                        {d.revocationReason && ` (${d.revocationReason})`}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-xs font-bold px-2.5 py-1 uppercase tracking-wider border ${
                        isRevoked
                          ? "bg-red-100 text-red-950 border-red-600"
                          : "bg-emerald-100 text-emerald-950 border-emerald-600"
                      }`}
                    >
                      {isRevoked ? "रद्द // REVOKED" : "सक्रिय // ACTIVE"}
                    </span>

                    {!isRevoked && (
                      <button
                        type="button"
                        disabled={revokingId === d.id}
                        onClick={() => handleRevoke(d.id)}
                        className="font-mono text-xs font-bold uppercase tracking-wider bg-chaos-canvas hover:bg-red-600 hover:text-white border-2 border-chaos-black text-chaos-black px-3 py-1.5 shadow-tactile-sm transition-all active:translate-y-0.5"
                      >
                        {revokingId === d.id ? "रद्द होत आहे..." : "साधन रद्द करा // REVOKE"}
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
