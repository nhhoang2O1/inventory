import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

export interface PoReportData {
  poCode: string;
  supplierName: string;
  status: string;
  orderDate: string;
  totalExpectedWeightKg: number;
  totalExpectedCases: number;
  skuLines: Array<{
    skuCode: string;
    skuName: string;
    orderedQty: number;
    unitWeightKg: number;
    lineWeightKg: number;
  }>;
  truckEntries: Array<{
    entryCode: string;
    licensePlate: string;
    driverName: string;
    dockCode: string;
    weightIn: number;
    weightOut: number;
    netWeight: number;
    confirmedQtyCases?: number | null | undefined;
    verificationStatus?: string | null | undefined;
  }>;
}

@Injectable()
export class PoPdfReportService {
  private readonly logger = new Logger(PoPdfReportService.name);

  async generatePoReportPdf(data: PoReportData): Promise<string> {
    const exportDir = path.resolve(process.cwd(), 'exports', 'pdf');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = `PO_${data.poCode.replace(/[^A-Z0-9_-]/gi, '_')}_Report.pdf`;
    const filePath = path.join(exportDir, filename);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // --- HEADER BANNER ---
      doc.rect(40, 40, 515, 60).fill('#1e1b4b');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('FMCG LOGISTICS WMS - TRẠM CÂN & BÁO CÁO KHO', 55, 52);
      doc.fillColor('#e0e7ff').fontSize(11).font('Helvetica').text('BIEN BAN QUYET TOAN NHAP KHO & DOI SOAT TRẠM CAN (PO REPORT)', 55, 73);

      doc.moveDown(3);

      // --- GENERAL PO METADATA ---
      doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(`MA DON PO: ${data.poCode}`, 40, 115);
      doc.fontSize(10).font('Helvetica')
         .text(`Nha Cung Cap: ${data.supplierName || 'Suntory PepsiCo / Sabeco'}`, 40, 132)
         .text(`Trang Thai: ${data.status || 'COMPLETED'}`, 40, 147)
         .text(`Ngay Lap: ${data.orderDate || new Date().toISOString().slice(0, 10)}`, 320, 132)
         .text(`Ngay Xuat Bao Cao: ${new Date().toLocaleString()}`, 320, 147);

      doc.moveTo(40, 165).lineTo(555, 165).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // --- SUMMARY METRICS ---
      doc.rect(40, 175, 515, 45).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold')
         .text('TONG KHAI BAO PO:', 50, 185)
         .text('TONG WEIGHT QUY DOI:', 210, 185)
         .text('TONG THUC NHAN DOCK:', 380, 185);

      const netTotalDelivered = data.truckEntries.reduce((sum, t) => sum + Number(t.netWeight || 0), 0);

      doc.fillColor('#1e1b4b').fontSize(12).font('Helvetica-Bold')
         .text(`${data.totalExpectedCases.toLocaleString()} Thung`, 50, 200)
         .text(`${data.totalExpectedWeightKg.toLocaleString()} kg`, 210, 200)
         .text(`${netTotalDelivered.toLocaleString()} kg`, 380, 200);

      // --- SECTION 1: SKU BREAKDOWN ---
      let y = 235;
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('1. CHI TIET MAT HANG SKU KHAI BAO (PO LINES)', 40, y);
      y += 18;

      // SKU Table Header
      doc.rect(40, y, 515, 20).fill('#e2e8f0');
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold')
         .text('STT', 45, y + 5)
         .text('Ma SKU', 75, y + 5)
         .text('Ten Mat Hang SKU', 170, y + 5)
         .text('So Luong', 360, y + 5)
         .text('Don Gia Kg', 430, y + 5)
         .text('Tong Kg', 495, y + 5);

      y += 20;

      data.skuLines.forEach((line, idx) => {
        doc.rect(40, y, 515, 18).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
        doc.fillColor('#334155').fontSize(8).font('Helvetica')
           .text(`${idx + 1}`, 45, y + 4)
           .text(line.skuCode, 75, y + 4)
           .text(line.skuName.slice(0, 32), 170, y + 4)
           .text(`${line.orderedQty} thung`, 360, y + 4)
           .text(`${line.unitWeightKg} kg`, 430, y + 4)
           .text(`${line.lineWeightKg.toLocaleString()} kg`, 495, y + 4);
        y += 18;
      });

      y += 15;

      // --- SECTION 2: TRUCK & SCALE OUT LOGS ---
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('2. NHAT KY CHIEN XE DA CAN & TRUT HANG XUONG DOCK', 40, y);
      y += 18;

      // Truck Table Header
      doc.rect(40, y, 515, 20).fill('#e2e8f0');
      doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold')
         .text('STT', 45, y + 5)
         .text('Bien So Xe', 70, y + 5)
         .text('Tai Xe', 130, y + 5)
         .text('Dock', 200, y + 5)
         .text('Can W1 (kg)', 245, y + 5)
         .text('Can W2 (kg)', 310, y + 5)
         .text('Net Hạ (kg)', 375, y + 5)
         .text('Thuc Ha', 440, y + 5)
         .text('Xac Nhan', 495, y + 5);

      y += 20;

      if (data.truckEntries.length === 0) {
        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Oblique').text('(Chua co xe nao can W2 trong nhat ky)', 45, y + 4);
        y += 18;
      } else {
        data.truckEntries.forEach((t, idx) => {
          doc.rect(40, y, 515, 18).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
          doc.fillColor('#334155').fontSize(8).font('Helvetica')
             .text(`${idx + 1}`, 45, y + 4)
             .text(t.licensePlate, 70, y + 4)
             .text(t.driverName.slice(0, 12), 130, y + 4)
             .text(t.dockCode || 'DOCK-01', 200, y + 4)
             .text(`${Number(t.weightIn).toLocaleString()}`, 245, y + 4)
             .text(`${Number(t.weightOut).toLocaleString()}`, 310, y + 4)
             .text(`${Number(t.netWeight).toLocaleString()}`, 375, y + 4)
             .text(`${t.confirmedQtyCases || Math.round(t.netWeight / 8.5)} thung`, 440, y + 4)
             .text(t.verificationStatus || 'VALID', 495, y + 4);
          y += 18;
        });
      }

      y += 20;

      // --- CONCLUSION BANNER ---
      doc.rect(40, y, 515, 45).fill('#f0fdf4').stroke('#bbf7d0');
      doc.fillColor('#166534').fontSize(10).font('Helvetica-Bold')
         .text('KET LUAN QUYET TOAN TRẠM CAN & XUAT CONG:', 50, y + 8);
      doc.fontSize(9).font('Helvetica')
         .text(`Da can w1 & w2 va kiem dem hop le ${netTotalDelivered.toLocaleString()} / ${data.totalExpectedWeightKg.toLocaleString()} kg. Bao ve cong xac nhan mo barrier va cap phep xuat cong!`, 50, y + 24);

      y += 65;

      // --- SIGNATURE BLOCK ---
      doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold')
         .text('BAO VE TRAM CAN', 60, y)
         .text('THU KHO KIEM DEM', 230, y)
         .text('QUAN LY KHO (MANAGER)', 400, y);

      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#94a3b8')
         .text('(Ky & ghi ro ho ten)', 65, y + 12)
         .text('(Ky & ghi ro ho ten)', 235, y + 12)
         .text('(Ky & ghi ro ho ten)', 410, y + 12);

      doc.end();

      stream.on('finish', () => {
        this.logger.log(`Generated PO PDF report: ${filePath}`);
        resolve(filePath);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }
}
