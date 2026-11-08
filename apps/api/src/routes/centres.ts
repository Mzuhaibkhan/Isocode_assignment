import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "./auth.js";
import { formatRupees } from "@procurement/shared";

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
  devices: {
    id: string;
    userName: string;
    isRevoked: boolean;
    registeredAt: Date;
  }[];
  cropBreakdown: {
    crop: string;
    netKg: number;
    count: number;
    amountPaise: number;
    amountFormatted: string;
  }[];
}

export async function centresRoutes(app: FastifyInstance) {
  // GET /centres/summary - Centre Daily Summary (Stock position by evening without calling centres §1, §8, §13.3)
  app.get(
    "/centres/summary",
    { preHandler: requireAuth(["office_manager", "operator"]) },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      // 1. Fetch all centres
      const allCentres = await db
        .select()
        .from(schema.centres)
        .orderBy(schema.centres.code);

      // 2. Fetch all devices
      const allDevices = await db
        .select({
          id: schema.devices.id,
          centreId: schema.devices.centreId,
          userId: schema.devices.userId,
          registeredAt: schema.devices.registeredAt,
          revokedAt: schema.devices.revokedAt,
          userName: schema.users.name,
        })
        .from(schema.devices)
        .leftJoin(schema.users, eq(schema.devices.userId, schema.users.id));

      // 3. Fetch all purchases with device information
      const allPurchases = await db
        .select({
          id: schema.purchases.id,
          slipNo: schema.purchases.slipNo,
          crop: schema.purchases.crop,
          netX10: schema.purchases.netX10,
          amountPaise: schema.purchases.amountPaise,
          deviceId: schema.purchases.deviceId,
          serverReceivedAt: schema.purchases.serverReceivedAt,
          status: schema.purchases.status,
          centreId: schema.devices.centreId,
        })
        .from(schema.purchases)
        .leftJoin(schema.devices, eq(schema.purchases.deviceId, schema.devices.id));

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // 4. Compute aggregated summaries per centre
      const summaries: CentreSummaryItem[] = allCentres.map((centre: typeof schema.centres.$inferSelect) => {
        const centreDevices = allDevices.filter((d: any) => d.centreId === centre.id);
        const centrePurchases = allPurchases.filter(
          (p: any) => p.centreId === centre.id || centreDevices.some((d: any) => d.id === p.deviceId)
        );

        const todayPurchases = centrePurchases.filter(
          (p: any) => new Date(p.serverReceivedAt).getTime() >= startOfToday.getTime()
        );

        // Sum weights and amounts
        const totalNetTenths = centrePurchases.reduce((acc: number, p: any) => acc + (p.netX10 || 0), 0);
        const todayNetTenths = todayPurchases.reduce((acc: number, p: any) => acc + (p.netX10 || 0), 0);
        const totalAmountPaise = centrePurchases.reduce((acc: number, p: any) => acc + (p.amountPaise || 0), 0);
        const todayAmountPaise = todayPurchases.reduce((acc: number, p: any) => acc + (p.amountPaise || 0), 0);

        // Compute last sync time across purchases and devices
        let lastSyncTime: string | null = null;
        const purchaseTimes = centrePurchases.map((p: any) => new Date(p.serverReceivedAt).getTime());
        const deviceTimes = centreDevices.map((d: any) => new Date(d.registeredAt).getTime());
        const allTimestamps = [...purchaseTimes, ...deviceTimes];
        if (allTimestamps.length > 0) {
          lastSyncTime = new Date(Math.max(...allTimestamps)).toISOString();
        }

        // Crop breakdown
        const cropMap = new Map<string, { netKg: number; count: number; amountPaise: number }>();
        for (const p of centrePurchases) {
          const c = (p.crop as string) || "Other";
          const current = cropMap.get(c) || { netKg: 0, count: 0, amountPaise: 0 };
          current.netKg += (p.netX10 || 0) / 10;
          current.count += 1;
          current.amountPaise += p.amountPaise || 0;
          cropMap.set(c, current);
        }

        const cropBreakdown = Array.from(cropMap.entries()).map(([crop, data]) => ({
          crop,
          netKg: Math.round(data.netKg * 10) / 10,
          count: data.count,
          amountPaise: data.amountPaise,
          amountFormatted: formatRupees(data.amountPaise),
        }));

        return {
          id: centre.id,
          code: centre.code,
          name: centre.name,
          village: centre.village,
          totalPurchases: centrePurchases.length,
          todayPurchases: todayPurchases.length,
          totalNetKg: Math.round((totalNetTenths / 10) * 10) / 10,
          todayNetKg: Math.round((todayNetTenths / 10) * 10) / 10,
          totalAmountPaise,
          totalAmountFormatted: formatRupees(totalAmountPaise),
          todayAmountPaise,
          todayAmountFormatted: formatRupees(todayAmountPaise),
          lastSyncTime,
          activeDevicesCount: centreDevices.filter((d: any) => !d.revokedAt).length,
          revokedDevicesCount: centreDevices.filter((d: any) => !!d.revokedAt).length,
          devices: centreDevices.map((d: any) => ({
            id: d.id,
            userName: d.userName || "Unknown",
            isRevoked: !!d.revokedAt,
            registeredAt: d.registeredAt,
          })),
          cropBreakdown,
        };
      });

      // Overall totals across all centres
      const grandTotalNetKg = summaries.reduce((acc: number, s) => acc + s.totalNetKg, 0);
      const grandTodayNetKg = summaries.reduce((acc: number, s) => acc + s.todayNetKg, 0);
      const grandTotalAmountPaise = summaries.reduce((acc: number, s) => acc + s.totalAmountPaise, 0);
      const grandTodayAmountPaise = summaries.reduce((acc: number, s) => acc + s.todayAmountPaise, 0);
      const grandTotalPurchases = summaries.reduce((acc: number, s) => acc + s.totalPurchases, 0);
      const grandTodayPurchases = summaries.reduce((acc: number, s) => acc + s.todayPurchases, 0);

      return reply.send({
        asOf: new Date().toISOString(),
        overall: {
          totalCentres: summaries.length,
          totalPurchases: grandTotalPurchases,
          todayPurchases: grandTodayPurchases,
          totalNetKg: Math.round(grandTotalNetKg * 10) / 10,
          todayNetKg: Math.round(grandTodayNetKg * 10) / 10,
          totalAmountPaise: grandTotalAmountPaise,
          totalAmountFormatted: formatRupees(grandTotalAmountPaise),
          todayAmountPaise: grandTodayAmountPaise,
          todayAmountFormatted: formatRupees(grandTodayAmountPaise),
        },
        centres: summaries,
      });
    }
  );
}
