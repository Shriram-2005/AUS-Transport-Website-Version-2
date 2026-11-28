import ExcelJS from 'exceljs';

export interface ExportColumnDef {
  column_key: string;
  label: string;
  data_type: 'text' | 'number' | 'currency';
}

export interface MonthSummaryInfo {
  profit: number;
  loss: number;
  net: number;
}

export interface ExportParams {
  columns: ExportColumnDef[];
  rows: Record<string, any>[];
  columnTotals: Record<string, number>;
  monthSummaries: Map<string, MonthSummaryInfo>;
  showMonthHeaders: boolean;
  dateTag: string;
  filterSummary: string;
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportMasterTripSheetToExcel({
  columns,
  rows,
  columnTotals,
  monthSummaries,
  showMonthHeaders,
  dateTag,
  filterSummary,
}: ExportParams): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AUS Transport';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Master Trip Sheet', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const totalCols = columns.length + 1;

  // Row 1: Title Banner
  const titleRow = sheet.addRow(['AUS TRANSPORT - MASTER TRIP SHEET (LEDGER)']);
  sheet.mergeCells(1, 1, 1, totalCols);
  titleRow.height = 30;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // Row 2: Subtitle / Filter Metadata
  const subRow = sheet.addRow([`${filterSummary}   |   Generated: ${dateTag}   |   Rows: ${rows.length}`]);
  sheet.mergeCells(2, 1, 2, totalCols);
  subRow.height = 20;
  const subCell = subRow.getCell(1);
  subCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // Row 3: Column Headers
  const headerValues = ['#', ...columns.map((c) => c.label.toUpperCase())];
  const headerRow = sheet.addRow(headerValues);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const colDef = colNumber > 1 ? columns[colNumber - 2] : null;
    const isNumeric = colDef ? colDef.data_type === 'number' || colDef.data_type === 'currency' : false;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber === 1 ? 'center' : isNumeric ? 'right' : 'left',
      wrapText: false,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  // Track max width per column using actual formatted lengths + breathable padding
  const measureFormattedLength = (val: unknown, colDef: ExportColumnDef | null, extraPad = 5): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number' && colDef) {
      if (colDef.data_type === 'currency') {
        return `Rs.${Math.round(val).toLocaleString('en-US')}`.length + extraPad;
      }
      if (colDef.column_key === 'mileage' || colDef.column_key === 'dieselQty') {
        return val.toFixed(2).length + extraPad;
      }
      return val.toLocaleString('en-US').length + extraPad;
    }
    return String(val).length + extraPad;
  };

  const colWidths: number[] = headerValues.map((h, idx) =>
    idx === 0 ? 8 : Math.max(14, String(h).length + 6)
  );

  // Data rows (with optional Month Header rows)
  rows.forEach((row, rowIdx) => {
    const prevRow = rowIdx > 0 ? rows[rowIdx - 1] : null;
    if (showMonthHeaders && (!prevRow || prevRow.monthKey !== row.monthKey)) {
      const mSummary = monthSummaries.get(row.monthKey);
      const net = mSummary ? mSummary.net : 0;
      const netLabel =
        net >= 0
          ? `NET PROFIT: Rs.${Math.round(net).toLocaleString('en-IN')}`
          : `NET LOSS: Rs.${Math.round(Math.abs(net)).toLocaleString('en-IN')}`;
      const monthRow = sheet.addRow([`${String(row.monthLabel || 'UNDATED').toUpperCase()}   -   ${netLabel}`]);
      sheet.mergeCells(monthRow.number, 1, monthRow.number, totalCols);
      monthRow.height = 24;
      const mCell = monthRow.getCell(1);
      mCell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: net >= 0 ? 'FF065F46' : 'FF991B1B' },
      };
      mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      mCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      for (let c = 1; c <= totalCols; c++) {
        monthRow.getCell(c).border = {
          top: { style: 'medium', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        };
      }
    }

    const rowValues: (string | number)[] = [
      rowIdx + 1,
      ...columns.map((col) => {
        if (col.column_key === 'expensesTotal') {
          const pills = (row.expensePills || []) as { category: string; amount: number }[];
          if (pills.length > 0) {
            return pills.map((p) => `${p.category}: Rs.${p.amount.toLocaleString('en-IN')}`).join(' | ');
          }
          return 0;
        }
        const raw = row[col.column_key];
        if (raw === undefined || raw === null || raw === '') return '';
        if (col.data_type === 'currency' || col.data_type === 'number') {
          const n = Number(raw);
          return isNaN(n) ? String(raw) : n;
        }
        return String(raw);
      }),
    ];

    const excelRow = sheet.addRow(rowValues);
    excelRow.height = 20;
    const isAlt = rowIdx % 2 === 1;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber === 1) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        const colDef = columns[colNumber - 2];
        const isNumeric = colDef.data_type === 'number' || colDef.data_type === 'currency';
        const isProfitCell = colDef.column_key === 'profit' && Number(row.profit) > 0;
        const isLossCell = colDef.column_key === 'loss' && Number(row.loss) > 0;

        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: isProfitCell || isLossCell,
          color: {
            argb: isProfitCell ? 'FF047857' : isLossCell ? 'FFDC2626' : 'FF1E293B',
          },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: isProfitCell
              ? 'FFECFDF5'
              : isLossCell
              ? 'FFFEF2F2'
              : isAlt
              ? 'FFF8FAFC'
              : 'FFFFFFFF',
          },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: isNumeric && colDef.column_key !== 'expensesTotal' ? 'right' : 'left',
          wrapText: colDef.column_key === 'expensesTotal',
        };

        if (typeof cell.value === 'number') {
          if (colDef.data_type === 'currency') {
            cell.numFmt = '"Rs."#,##0';
          } else if (colDef.column_key === 'mileage' || colDef.column_key === 'dieselQty') {
            cell.numFmt = '#,##0.00';
          } else {
            cell.numFmt = '#,##0';
          }
        }

        const measured = measureFormattedLength(cell.value, colDef, 5);
        if (measured > colWidths[colNumber - 1]) {
          colWidths[colNumber - 1] = Math.min(45, measured);
        }
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Grand Total Row
  const totalValues: (string | number)[] = [
    'SUM',
    ...columns.map((c) => {
      if (c.column_key === 'date') return `TOTAL (${rows.length})`;
      const tot = columnTotals[c.column_key];
      return tot !== undefined ? tot : '';
    }),
  ];
  const totalRow = sheet.addRow(totalValues);
  totalRow.height = 24;
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const colDef = colNumber > 1 ? columns[colNumber - 2] : null;
    const isNumeric = colDef ? colDef.data_type === 'number' || colDef.data_type === 'currency' : false;
    const isProfitCol = colDef?.column_key === 'profit';
    const isLossCol = colDef?.column_key === 'loss';

    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: {
        argb: isProfitCol ? 'FF065F46' : isLossCol ? 'FF991B1B' : 'FF0F172A',
      },
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber === 1 ? 'center' : isNumeric ? 'right' : 'left',
    };
    if (typeof cell.value === 'number' && colDef) {
      if (colDef.data_type === 'currency') cell.numFmt = '"Rs."#,##0';
      else if (colDef.column_key === 'mileage' || colDef.column_key === 'dieselQty') cell.numFmt = '#,##0.00';
      else cell.numFmt = '#,##0';
    }
    if (colNumber > 1) {
      const measuredTotal = measureFormattedLength(cell.value, colDef, 6);
      if (measuredTotal > colWidths[colNumber - 1]) {
        colWidths[colNumber - 1] = Math.min(45, measuredTotal);
      }
    }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF475569' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Set column widths with generous breathable room so numbers never show as ###
  colWidths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = idx === 0 ? 8 : Math.max(14, Math.min(45, w));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AUS_Transport_Master_Trip_Sheet_${dateTag}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printMasterTripSheetPdf({
  columns,
  rows,
  columnTotals,
  monthSummaries,
  showMonthHeaders,
  dateTag,
  filterSummary,
}: ExportParams): void {
  const printWin = window.open('', '_blank', 'width=1360,height=850');
  if (!printWin) {
    window.print();
    return;
  }

  const formatCell = (row: Record<string, any>, col: ExportColumnDef): string => {
    if (col.column_key === 'expensesTotal') {
      const pills = (row.expensePills || []) as { category: string; amount: number }[];
      if (pills.length > 0) {
        return pills
          .map(
            (p) =>
              `<span class="pill">${escapeHtml(p.category)}: <b>Rs.${p.amount.toLocaleString('en-IN')}</b></span>`
          )
          .join(' ');
      }
      return 'Rs.0';
    }

    const val = row[col.column_key];
    if (val === undefined || val === null || val === '') return '-';

    if (col.data_type === 'currency') {
      const n = Number(val);
      if (isNaN(n)) return escapeHtml(val);
      return `Rs.${Math.round(n).toLocaleString('en-IN')}`;
    }

    if (col.data_type === 'number') {
      const n = Number(val);
      if (isNaN(n)) return escapeHtml(val);
      if (col.column_key === 'mileage') return n > 0 ? n.toFixed(2) : '-';
      if (col.column_key === 'dieselQty') return n > 0 ? n.toFixed(2) : '0';
      return n.toLocaleString('en-IN');
    }

    return escapeHtml(val);
  };

  const theadHtml = `
    <tr>
      <th class="center">#</th>
      ${columns
        .map((c) => {
          const isNumeric = c.data_type === 'number' || c.data_type === 'currency';
          return `<th class="${isNumeric ? 'right' : 'left'}">${escapeHtml(c.label)}</th>`;
        })
        .join('')}
    </tr>
  `;

  const tbodyHtml = rows
    .map((row, rowIdx) => {
      const prevRow = rowIdx > 0 ? rows[rowIdx - 1] : null;
      let monthBanner = '';
      if (showMonthHeaders && (!prevRow || prevRow.monthKey !== row.monthKey)) {
        const mSummary = monthSummaries.get(row.monthKey);
        const net = mSummary ? mSummary.net : 0;
        const badgeClass = net >= 0 ? 'month-profit' : 'month-loss';
        const badgeText =
          net >= 0
            ? `Net Profit: Rs.${Math.round(net).toLocaleString('en-IN')}`
            : `Net Loss: Rs.${Math.round(Math.abs(net)).toLocaleString('en-IN')}`;
        monthBanner = `
          <tr class="month-row">
            <td colspan="${columns.length + 1}">
              <span class="month-title">${escapeHtml(row.monthLabel)}</span>
              <span class="month-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
            </td>
          </tr>
        `;
      }

      const cellsHtml = columns
        .map((col) => {
          const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
          const isProfit = col.column_key === 'profit' && Number(row.profit) > 0;
          const isLoss = col.column_key === 'loss' && Number(row.loss) > 0;
          const cls = [
            isNumeric ? 'right' : 'left',
            isProfit ? 'profit-cell' : '',
            isLoss ? 'loss-cell' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<td class="${cls}">${formatCell(row, col)}</td>`;
        })
        .join('');

      return `
        ${monthBanner}
        <tr class="${rowIdx % 2 === 1 ? 'alt-row' : ''}">
          <td class="center idx-cell">${rowIdx + 1}</td>
          ${cellsHtml}
        </tr>
      `;
    })
    .join('');

  const tfootHtml = `
    <tr class="total-row">
      <td class="center">SUM</td>
      ${columns
        .map((col) => {
          const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
          let display = '';
          if (col.column_key === 'date') {
            display = `TOTAL (${rows.length})`;
          } else {
            const totalVal = columnTotals[col.column_key];
            if (totalVal !== undefined) {
              if (col.data_type === 'currency') {
                display = `Rs.${Math.round(totalVal).toLocaleString('en-IN')}`;
              } else if (col.column_key === 'mileage') {
                display = totalVal > 0 ? totalVal.toFixed(2) : '-';
              } else {
                display = totalVal.toLocaleString('en-IN');
              }
            }
          }
          const cls = [
            isNumeric ? 'right' : 'left',
            col.column_key === 'profit' ? 'profit-cell' : '',
            col.column_key === 'loss' ? 'loss-cell' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<td class="${cls}">${escapeHtml(display)}</td>`;
        })
        .join('')}
    </tr>
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AUS Transport - Master Trip Sheet (${escapeHtml(dateTag)})</title>
  <style>
    @page { size: A3 landscape; margin: 7mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 8px;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .doc-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
      margin: 0;
      color: #0f172a;
    }
    .doc-sub {
      font-size: 10px;
      color: #475569;
      margin: 2px 0 0 0;
    }
    .doc-meta {
      font-size: 10px;
      font-weight: 600;
      color: #334155;
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
    }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4px 5px;
      vertical-align: middle;
    }
    th {
      background: #1e293b;
      color: #ffffff;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 7.5px;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    .left { text-align: left; }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .idx-cell { background: #f1f5f9; font-weight: 700; color: #475569; }
    .alt-row { background: #f8fafc; }
    .profit-cell { color: #047857; background: #ecfdf5; font-weight: 700; }
    .loss-cell { color: #dc2626; background: #fef2f2; font-weight: 700; }
    .month-row td {
      background: #e2e8f0;
      padding: 6px 8px;
      border-top: 2px solid #64748b;
      border-bottom: 1.5px solid #94a3b8;
    }
    .month-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      margin-right: 10px;
    }
    .month-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 9.5px;
      font-weight: 800;
    }
    .month-profit { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .month-loss { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .total-row td {
      background: #e2e8f0;
      font-weight: 800;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      padding: 5px;
    }
    .pill {
      display: inline-block;
      background: #fff1f2;
      color: #be123c;
      border: 1px solid #fecdd3;
      border-radius: 999px;
      padding: 1px 5px;
      font-size: 7.5px;
      margin: 1px;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <h1 class="doc-title">AUS TRANSPORT - MASTER TRIP SHEET</h1>
      <p class="doc-sub">${escapeHtml(filterSummary)}</p>
    </div>
    <div class="doc-meta">
      <div>Printed: ${escapeHtml(dateTag)}</div>
      <div>Rows: ${rows.length} | Columns: ${columns.length}</div>
    </div>
  </div>
  <table>
    <thead>${theadHtml}</thead>
    <tbody>${tbodyHtml}</tbody>
    <tfoot>${tfootHtml}</tfoot>
  </table>
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

