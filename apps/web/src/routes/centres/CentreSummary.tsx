import { useState, useEffect } from "react";
import { Button } from "../../ui/Button.js";

interface DeviceSummary {
  id: string;
  userName: string;
  isRevoked: boolean;
  registeredAt: string;
}

interface CropStat {
  crop: string;
  netKg: number;
  count: number;
  amountPaise: number;
  amountFormatted: string;
}

interface CentreSummaryItem {
  id: string;
  code: string;
  name: string;
  village: string;
  totalPurchases: number;
  todayPurchases: number;
  totalNetKg: number;
  todayNetKg: number;
  totalAmountPaise: number;
  totalAmountFormatted: string;
  todayAmountPaise: number;
  todayAmountFormatted: string;
  lastSyncTime: string | null;
  activeDevicesCount: number;
  revokedDevicesCount: number;
  devices: DeviceSummary[];
  cropBreakdown: CropStat[];
}

interface OverallSummary {
  totalCentres: number;
  totalPurchases: number;
  todayPurchases: number;
  totalNetKg: number;
  todayNetKg: number;
  totalAmountPaise: number;
  totalAmountFormatted: string;
  todayAmountPaise: number;
  todayAmountFormatted: string;
}

export function CentreSummary() {
  const [overall, setOverall] = useState<OverallSummary | null>(null);
  const [centres, setCentres] = useState<CentreSummaryItem[]>([]);
  const [asOf, setAsOf] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/centres/summary");
      if (!res.ok) {
        throw new Error(`सर्व्हर त्रुटी: ${res.status}`);
      }
      const data = await res.json();
      setOverall(data.overall);
      setCentres(data.centres || []);
      setAsOf(data.asOf || new Date().toISOString());
    } catch (err: any) {
      setError(err.message || "केंद्रांचा गोषवारा लोड करता आला नाही");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-1 font-sans">
      {/* Masthead Header */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
              DISTRICT STOCK POSITION // केंद्र दैनिक गोषवारा
            </span>
            <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
              REAL-TIME SYNC
            </span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
            केंद्र दैनिक गोषवारा (CENTRE DAILY SUMMARY)
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            EVENING STOCK POSITION ACROSS ALL PROCUREMENT SHEDS WITHOUT PHONE CALLS (§13.3)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {asOf && (
            <span className="font-mono text-[11px] text-chaos-muted uppercase hidden sm:inline">
              UPDATED: {new Date(asOf).toLocaleTimeString("en-IN")}
            </span>
          )}
          <Button variant="orange" onClick={fetchSummary} className="text-xs py-2 px-4 shadow-tactile-sm font-mono uppercase">
            🔄 REFRESH
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-600 text-red-900 font-mono text-xs font-bold p-3.5 shadow-tactile-sm uppercase tracking-wide">
          [!] {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-chaos-muted font-mono text-xs uppercase tracking-wider bg-chaos-paper border-2 border-dashed border-chaos-black/40">
          [ ⏳ गोषवारा माहिती गोळा करत आहे // AGGREGATING CENTRE STOCK DATA... ]
        </div>
      ) : (
        <>
          {/* Overall District Metrics */}
          {overall && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile">
                <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-wider block">
                  01 // एकूण खरेदी केंद्रे (CENTRES)
                </span>
                <span className="font-display font-black text-5xl text-chaos-black block my-1">
                  {overall.totalCentres}
                </span>
                <span className="font-mono text-[11px] text-chaos-muted uppercase">
                  LATUR DISTRICT NETWORK
                </span>
              </div>

              <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile">
                <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-wider block">
                  02 // आजचे वजन (TODAY NET KG)
                </span>
                <span className="font-display font-black text-5xl text-chaos-orange block my-1">
                  {overall.todayNetKg.toLocaleString("en-IN")}
                  <span className="text-xl text-chaos-black font-mono ml-1">KG</span>
                </span>
                <span className="font-mono text-[11px] text-chaos-muted uppercase">
                  {(overall.todayNetKg / 100).toFixed(1)} QUINTALS TODAY
                </span>
              </div>

              <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile">
                <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-wider block">
                  03 // एकूण वजन (CUMULATIVE STOCK)
                </span>
                <span className="font-display font-black text-5xl text-chaos-black block my-1">
                  {overall.totalNetKg.toLocaleString("en-IN")}
                  <span className="text-xl text-chaos-muted font-mono ml-1">KG</span>
                </span>
                <span className="font-mono text-[11px] text-chaos-muted uppercase">
                  {overall.totalPurchases} TOTAL PURCHASES
                </span>
              </div>

              <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile">
                <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-wider block">
                  04 // आजची रक्कम (TODAY VALUE)
                </span>
                <span className="font-display font-black text-4xl text-chaos-black block my-2">
                  {overall.todayAmountFormatted}
                </span>
                <span className="font-mono text-[11px] text-emerald-800 uppercase font-bold">
                  TOTAL VALUE: {overall.totalAmountFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Individual Centre Cards Grid */}
          <div className="flex flex-col gap-4">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted px-1">
              खरेदी केंद्रनिहाय स्थिती // PROCUREMENT CENTRES BREAKDOWN ({centres.length})
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {centres.map((c) => (
                <div
                  key={c.id}
                  className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile flex flex-col justify-between gap-4"
                >
                  {/* Centre Header */}
                  <div>
                    <div className="flex justify-between items-start border-b-2 border-chaos-black pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black bg-chaos-black text-chaos-orange px-2 py-0.5">
                            {c.code}
                          </span>
                          <span className="font-sans font-black text-lg text-chaos-black">
                            {c.name}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-chaos-muted uppercase block mt-0.5">
                          तालुका / गाव: {c.village}
                        </span>
                      </div>

                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 border border-chaos-black bg-chaos-canvas">
                        {c.activeDevicesCount} DEVICES ACTIVE
                      </span>
                    </div>

                    {/* Stock Numbers Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-4 font-mono">
                      <div className="bg-white border-2 border-chaos-black p-3 shadow-tactile-sm">
                        <span className="text-[10px] uppercase font-bold text-chaos-muted block">
                          आजची खरेदी (TODAY)
                        </span>
                        <span className="font-display font-black text-3xl text-chaos-orange block mt-0.5">
                          {c.todayNetKg.toFixed(1)} <span className="text-xs font-mono text-chaos-black">KG</span>
                        </span>
                        <span className="text-[11px] text-chaos-muted block mt-0.5">
                          {c.todayPurchases} पावत्या • {c.todayAmountFormatted}
                        </span>
                      </div>

                      <div className="bg-white border-2 border-chaos-black p-3 shadow-tactile-sm">
                        <span className="text-[10px] uppercase font-bold text-chaos-muted block">
                          एकूण साठा (TOTAL)
                        </span>
                        <span className="font-display font-black text-3xl text-chaos-black block mt-0.5">
                          {c.totalNetKg.toFixed(1)} <span className="text-xs font-mono text-chaos-muted">KG</span>
                        </span>
                        <span className="text-[11px] text-chaos-muted block mt-0.5">
                          {c.totalPurchases} पावत्या • {c.totalAmountFormatted}
                        </span>
                      </div>
                    </div>

                    {/* Crop breakdown chips */}
                    {c.cropBreakdown.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-dashed border-stone-300">
                        <span className="font-mono text-[10px] uppercase font-bold text-chaos-muted block mb-1.5">
                          पीकनिहाय साठा (COMMODITIES):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {c.cropBreakdown.map((crop) => (
                            <span
                              key={crop.crop}
                              className="font-mono text-xs bg-chaos-canvas border border-chaos-black px-2.5 py-1 text-chaos-black"
                            >
                              <b>{crop.crop}</b>: {crop.netKg} KG ({crop.count} slips)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Meta */}
                  <div className="pt-3 border-t-2 border-chaos-black flex justify-between items-center font-mono text-[11px] text-chaos-muted uppercase">
                    <span>
                      शेवटचा सिंक: {c.lastSyncTime ? new Date(c.lastSyncTime).toLocaleTimeString("en-IN") : "NOT YET SYNCED"}
                    </span>
                    <span className="font-bold text-chaos-black">
                      {c.todayPurchases > 0 ? "● ACTIVE TODAY" : "○ NO TODAY ENTRIES"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
