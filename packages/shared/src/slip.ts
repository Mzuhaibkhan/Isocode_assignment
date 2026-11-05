export interface SlipDetails {
  slipNo: string;
  farmerName: string;
  crop: string;
  netKg: string;
  moisturePercent: string;
  ratePerQuintal: number;
  amountFormatted: string;
}

/**
 * Formats canonical Marathi slip text according to §11 of the specification.
 * Used for both on-screen sharing and SMS body.
 */
export function formatSlipText(slip: SlipDetails): string {
  const rateStr = slip.ratePerQuintal.toLocaleString("en-IN");
  return [
    `पावती ${slip.slipNo}`,
    `${slip.farmerName} | ${slip.crop}`,
    `निव्वळ वजन: ${slip.netKg} किग्रॅ`,
    `ओलावा: ${slip.moisturePercent}%`,
    `दर: ₹${rateStr} प्रति क्विंटल`,
    `रक्कम: ${slip.amountFormatted}`,
    `48 तासांत पैसे जमा होतील`,
  ].join("\n");
}

