import { NextResponse } from "next/server";
import { auth } from "@/auth";
import PDFDocument from 'pdfkit';

export async function POST(request) {
  try {
    const session = await auth();

    if (!session?.user || (session.user.userType !== 'user' || (parseInt(session.user.role) !== 1 && parseInt(session.user.role) !== 2))) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin or Manager access required." },
        { status: 403 }
      );
    }

    const { reportType, dateFrom, dateTo, data } = await request.json();

    // Create PDF document with built-in fonts
    const doc = new PDFDocument({ 
      margin: 50
    });
    
    // Use built-in font explicitly
    doc.font('Helvetica');
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {});

    // Header
    doc.fontSize(20).text('KW&SC Reports Dashboard', { align: 'center' });
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    
    if (dateFrom && dateTo) {
      doc.text(`Date Range: ${dateFrom} to ${dateTo}`, { align: 'center' });
    }
    
    doc.moveDown(2);

    // Report type specific content
    switch (reportType) {
      case 'department':
        doc.fontSize(16).text('Department-wise Works Distribution', { underline: true });
        doc.moveDown();
        data.departmentDistribution?.forEach((dept, index) => {
          doc.text(`${index + 1}. ${dept.department}: ${dept.count} works`);
        });
        break;

      case 'district':
        doc.fontSize(16).text('District-wise Works Distribution', { underline: true });
        doc.moveDown();
        data.districtDistribution?.forEach((district, index) => {
          doc.text(`${index + 1}. ${district.district}: ${district.count} works`);
        });
        break;

      case 'town':
        doc.fontSize(16).text('Town-wise Works Distribution', { underline: true });
        doc.moveDown();
        data.townDistribution?.forEach((town, index) => {
          doc.text(`${index + 1}. ${town.town}: ${town.count} works`);
        });
        break;

      case 'works':
        doc.fontSize(16).text('Works Summary Report', { underline: true });
        doc.moveDown();
        doc.text(`Total Works: ${data.totalRequests}`);
        doc.text(`Completed Works: ${data.completedRequests}`);
        doc.text(`Pending Works: ${data.pendingRequests}`);
        doc.text(`Active Works: ${data.activeRequests}`);
        doc.text(`Completion Rate: ${data.completionRate}%`);
        doc.text(`Average Completion Time: ${data.avgCompletionTime} days`);
        break;

      case 'performance':
        doc.fontSize(16).text('Performance Report', { underline: true });
        doc.moveDown();
        doc.text(`Total Works: ${data.totalRequests}`);
        doc.text(`Completion Rate: ${data.completionRate}%`);
        doc.text(`Average Completion Time: ${data.avgCompletionTime} days`);
        doc.text(`Top Department: ${data.topDepartment}`);
        doc.text(`Top District: ${data.topDistrict}`);
        break;

      case 'users':
        doc.fontSize(16).text('Users & Agents Report', { underline: true });
        doc.moveDown();
        doc.text(`Total Users: ${data.totalUsers}`);
        doc.text(`Total Field Agents: ${data.totalAgents}`);
        break;

      default:
        doc.fontSize(16).text('Comprehensive Report', { underline: true });
        doc.moveDown();
        doc.text(`Total Works: ${data.totalRequests}`);
        doc.text(`Completed Works: ${data.completedRequests}`);
        doc.text(`Pending Works: ${data.pendingRequests}`);
        doc.text(`Active Works: ${data.activeRequests}`);
        doc.text(`Total Users: ${data.totalUsers}`);
        doc.text(`Total Field Agents: ${data.totalAgents}`);
        doc.text(`Completion Rate: ${data.completionRate}%`);
        doc.text(`Average Completion Time: ${data.avgCompletionTime} days`);
        doc.text(`Top Department: ${data.topDepartment}`);
        doc.text(`Top District: ${data.topDistrict}`);
        break;
    }

    doc.end();

    // Wait for PDF to be generated
    await new Promise((resolve) => {
      doc.on('end', resolve);
    });

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });

  } catch (error) {
    console.error('Error generating PDF report:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
