export interface BankPaymentLine {
  serial: number;
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
  amountPaise: number;
  amountFormatted: string; // Two decimal places, e.g. "59752.00"
  narration: string;       // Slips, e.g. "C07-24518, C07-24519"
  paymentReference: string; // Unique per line
}

export interface BankFileWriter {
  generateCsv(lines: BankPaymentLine[]): string;
}

/**
 * Standard Bank Payment CSV File Generator (§12)
 * Note: A real bank bulk upload format can replace this implementation by implementing BankFileWriter.
 */
export class CsvBankFileWriter implements BankFileWriter {
  generateCsv(lines: BankPaymentLine[]): string {
    const headers = [
      "Serial",
      "Beneficiary Name",
      "Account Number",
      "IFSC",
      "Amount",
      "Narration",
      "Payment Reference",
    ];

    const escapeCsv = (val: string | number) => {
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = lines.map((line) => [
      line.serial,
      escapeCsv(line.beneficiaryName),
      escapeCsv(line.accountNumber),
      escapeCsv(line.ifsc),
      line.amountFormatted,
      escapeCsv(line.narration),
      escapeCsv(line.paymentReference),
    ].join(","));

    return [headers.join(","), ...rows].join("\n");
  }
}

export const bankFileWriter = new CsvBankFileWriter();

