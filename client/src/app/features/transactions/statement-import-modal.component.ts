import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Category, TransactionKind, TransactionTag, money } from '../../core/models';

export interface ImportPreviewRow {
  date: string;
  amountCents: number;
  merchant: string;
  notes: string;
  bankRef?: string;
  status?: string;
  kind: TransactionKind;
  tag: TransactionTag;
  category: string;
  selected: boolean;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

@Component({
  selector: 'app-statement-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div class="header-title">
            <span class="icon">📂</span>
            <div>
              <h3>Import Statement (PDF / CSV)</h3>
              <p class="subtitle">Upload UPI transaction history (PDF), bank statements, or CSV files to auto-import</p>
            </div>
          </div>
          <button type="button" class="btn-close" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <!-- Error banner -->
          <div *ngIf="errorMessage()" class="alert-error">
            <span>⚠ {{ errorMessage() }}</span>
            <button type="button" class="btn-alert-close" (click)="errorMessage.set(null)">✕</button>
          </div>

          <!-- Step 1: Upload Box -->
          <div *ngIf="parsedRows().length === 0 && !isParsing()" class="upload-dropzone" (dragover)="$event.preventDefault()" (drop)="onFileDrop($event)">
            <span class="drop-icon">📥</span>
            <h4>Drag & drop your PDF statement or CSV file here</h4>
            <p>Directly parses PhonePe, Google Pay, YES Bank, HDFC, SBI, ICICI transaction history PDFs and standard CSVs</p>
            <input type="file" accept=".pdf,.csv,application/pdf,text/csv" #fileInput (change)="onFileSelected($event)" style="display:none" />
            <button type="button" class="btn-browse" (click)="fileInput.click()">📁 Browse Statement File (.pdf, .csv)</button>
            <div class="format-badges">
              <span class="badge">📄 PDF Statements & UPI History</span>
              <span class="badge">⚡ Auto Merchant & Date Extraction</span>
              <span class="badge">📊 CSV Spreadsheets</span>
            </div>
          </div>

          <!-- Parsing Loader -->
          <div *ngIf="isParsing()" class="parsing-loader">
            <div class="spinner"></div>
            <h4>Parsing Statement Document...</h4>
            <p>Extracting transactions, merchants, dates, amounts, and statuses from your PDF</p>
          </div>

          <!-- Step 2: Preview & Validation Table -->
          <div *ngIf="parsedRows().length > 0 && !isParsing()" class="preview-container">
            <div class="preview-toolbar">
              <span class="count-badge">Found {{ selectedCount() }} / {{ parsedRows().length }} valid transactions</span>
              <div class="btn-group">
                <button type="button" class="btn-text" (click)="selectAll(true)">Select All</button>
                <button type="button" class="btn-text" (click)="selectAll(false)">Deselect All</button>
                <button type="button" class="btn-text text-danger" (click)="clearFile()">Choose Different File</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="import-table">
                <thead>
                  <tr>
                    <th style="width: 36px"></th>
                    <th>Date</th>
                    <th>Merchant / Description</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Tag</th>
                    <th style="text-align: right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of parsedRows(); let i = index" [class.unselected]="!row.selected">
                    <td>
                      <input type="checkbox" [(ngModel)]="row.selected" />
                    </td>
                    <td class="date-cell">
                      <input type="date" [(ngModel)]="row.date" class="cell-input" />
                    </td>
                    <td class="desc-cell" [title]="row.merchant + (row.notes ? ' (' + row.notes + ')' : '')">
                      <input type="text" [(ngModel)]="row.merchant" class="cell-input text" />
                      <span *ngIf="row.bankRef" class="bank-sub">{{ row.bankRef }}</span>
                    </td>
                    <td>
                      <select [(ngModel)]="row.category" class="cell-select">
                        <option *ngFor="let c of categories" [value]="c.name">{{ c.icon || '🏷️' }} {{ c.name }}</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="kind-pill-btn"
                        [class.income]="row.kind === 'income'"
                        (click)="toggleKind(row)"
                        title="Click to toggle Income / Expense"
                      >
                        {{ row.kind }}
                      </button>
                    </td>
                    <td>
                      <select [(ngModel)]="row.tag" class="cell-select">
                        <option value="need">🛡️ Need</option>
                        <option value="want">💡 Want</option>
                        <option value="saving">🎯 Saving</option>
                      </select>
                    </td>
                    <td style="text-align: right" class="amt-cell" [class.income]="row.kind === 'income'">
                      {{ money(row.amountCents, currency) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" (click)="close.emit()">Cancel</button>
          <button
            type="button"
            class="btn-primary"
            *ngIf="parsedRows().length > 0 && !isParsing()"
            [disabled]="selectedCount() === 0 || isImporting()"
            (click)="submitImport()"
          >
            {{ isImporting() ? 'Importing...' : 'Import ' + selectedCount() + ' Transactions' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px); z-index: 10000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .modal-box {
      background: #FFFFFF; border-radius: 16px; width: 100%; max-width: 860px;
      max-height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25);
      border: 1px solid #E2E8F0; overflow: hidden;
    }
    :host-context([data-theme='dark']) .modal-box {
      background: #0F172A; border-color: #334155; color: #F8FAFC;
    }
    .modal-header {
      padding: 16px 20px; border-bottom: 1px solid #E2E8F0;
      display: flex; justify-content: space-between; align-items: center;
    }
    :host-context([data-theme='dark']) .modal-header { border-bottom-color: #334155; }
    .header-title { display: flex; align-items: center; gap: 12px; }
    .header-title .icon { font-size: 24px; }
    .header-title h3 { margin: 0; font-size: 16px; font-weight: 700; }
    .subtitle { margin: 2px 0 0; font-size: 12px; color: #64748B; }
    :host-context([data-theme='dark']) .subtitle { color: #94A3B8; }
    .btn-close { background: none; border: none; font-size: 18px; color: #64748B; cursor: pointer; }
    .modal-body { padding: 20px; overflow-y: auto; flex: 1; }

    .alert-error {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: #FEE2E2; border: 1px solid #FECACA;
      border-radius: 8px; color: #DC2626; font-size: 12px; margin-bottom: 12px;
    }
    :host-context([data-theme='dark']) .alert-error { background: #450A0A; border-color: #7F1D1D; color: #FCA5A5; }
    .btn-alert-close { background: none; border: none; font-size: 14px; color: inherit; cursor: pointer; }

    .upload-dropzone {
      border: 2px dashed #CBD5E1; border-radius: 12px; padding: 40px 20px;
      text-align: center; display: flex; flex-direction: column; align-items: center;
      gap: 12px; background: #F8FAFC;
    }
    :host-context([data-theme='dark']) .upload-dropzone {
      background: #1E293B; border-color: #475569;
    }
    .drop-icon { font-size: 42px; }
    .upload-dropzone h4 { margin: 0; font-size: 16px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .upload-dropzone h4 { color: #F1F5F9; }
    .upload-dropzone p { margin: 0; font-size: 12px; color: #64748B; max-width: 500px; }
    .btn-browse {
      margin-top: 6px; background: #4F46E5; color: #FFFFFF; border: none;
      padding: 9px 18px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;
      box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
    }
    .btn-browse:hover { background: #4338CA; }
    .format-badges { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
    .badge {
      font-size: 11px; padding: 4px 10px; border-radius: 999px;
      background: #EEF2FF; color: #4F46E5; font-weight: 600;
    }
    :host-context([data-theme='dark']) .badge { background: #312E81; color: #C7D2FE; }

    .parsing-loader {
      padding: 50px 20px; text-align: center; display: flex; flex-direction: column;
      align-items: center; gap: 12px;
    }
    .spinner {
      width: 36px; height: 36px; border: 3px solid #E2E8F0;
      border-top-color: #4F46E5; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .parsing-loader h4 { margin: 0; font-size: 16px; font-weight: 700; }
    .parsing-loader p { margin: 0; font-size: 12px; color: #64748B; }

    .preview-container { display: flex; flex-direction: column; gap: 12px; }
    .preview-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
    .count-badge { font-size: 12px; font-weight: 700; color: #4F46E5; background: #EEF2FF; padding: 4px 10px; border-radius: 6px; }
    :host-context([data-theme='dark']) .count-badge { background: #312E81; color: #A5B4FC; }
    .btn-group { display: flex; gap: 8px; }
    .btn-text { background: none; border: none; font-size: 12px; color: #64748B; cursor: pointer; font-weight: 600; }
    .btn-text:hover { color: #1E293B; }
    :host-context([data-theme='dark']) .btn-text:hover { color: #F1F5F9; }
    .btn-text.text-danger { color: #EF4444; }

    .table-wrap { max-height: 52vh; overflow-y: auto; border: 1px solid #E2E8F0; border-radius: 8px; }
    :host-context([data-theme='dark']) .table-wrap { border-color: #334155; }
    .import-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .import-table th { background: #F8FAFC; padding: 10px 12px; text-align: left; font-weight: 700; color: #475569; position: sticky; top: 0; z-index: 1; }
    :host-context([data-theme='dark']) .import-table th { background: #1E293B; color: #CBD5E1; }
    .import-table td { padding: 7px 10px; border-top: 1px solid #E2E8F0; }
    :host-context([data-theme='dark']) .import-table td { border-top-color: #334155; }
    .unselected { opacity: 0.45; }
    .date-cell input { font-size: 11px; padding: 3px 6px; border: 1px solid #CBD5E1; border-radius: 4px; background: transparent; }
    :host-context([data-theme='dark']) .date-cell input { border-color: #475569; color: #F1F5F9; }
    .desc-cell { max-width: 220px; }
    .desc-cell .cell-input.text {
      width: 100%; font-size: 12px; font-weight: 600; border: 1px solid transparent;
      padding: 3px 6px; border-radius: 4px; background: transparent; color: inherit;
    }
    .desc-cell .cell-input.text:hover, .desc-cell .cell-input.text:focus {
      border-color: #CBD5E1; background: #FFFFFF;
    }
    :host-context([data-theme='dark']) .desc-cell .cell-input.text:hover,
    :host-context([data-theme='dark']) .desc-cell .cell-input.text:focus {
      border-color: #475569; background: #1E293B;
    }
    .bank-sub { display: block; font-size: 10px; color: #94A3B8; margin-top: 1px; padding-left: 6px; }
    .cell-select {
      border: 1px solid #CBD5E1; border-radius: 4px; padding: 4px 6px; font-size: 11px;
      background: #FFFFFF; color: #0F172A;
    }
    :host-context([data-theme='dark']) .cell-select {
      background: #1E293B; border-color: #475569; color: #F1F5F9;
    }
    .cell-select option { background: #FFFFFF; color: #0F172A; }
    :host-context([data-theme='dark']) .cell-select option { background: #1E293B; color: #F1F5F9; }
    .kind-pill-btn {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px;
      background: #FEE2E2; color: #EF4444; text-transform: uppercase; border: none; cursor: pointer;
    }
    .kind-pill-btn.income { background: #DCFCE7; color: #16A34A; }
    .amt-cell { font-weight: 700; color: #EF4444; font-variant-numeric: tabular-nums; }
    .amt-cell.income { color: #16A34A; }

    .modal-footer { padding: 14px 20px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 10px; }
    :host-context([data-theme='dark']) .modal-footer { border-top-color: #334155; }
    .btn-ghost { background: none; border: 1px solid #CBD5E1; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    :host-context([data-theme='dark']) .btn-ghost { border-color: #475569; color: #E2E8F0; }
    .btn-primary { background: #4F46E5; color: #FFFFFF; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class StatementImportModalComponent implements OnInit {
  @Input() currency = 'USD';
  @Input() categories: Category[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() imported = new EventEmitter<number>();

  private readonly api = inject(ApiService);
  readonly parsedRows = signal<ImportPreviewRow[]>([]);
  readonly isParsing = signal(false);
  readonly isImporting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly money = money;

  ngOnInit(): void {
    if (!this.categories || this.categories.length === 0) {
      this.api.getCategories().subscribe({
        next: (cats) => {
          if (cats && cats.length) this.categories = cats;
        },
        error: () => {}
      });
    }
  }

  selectedCount(): number {
    return this.parsedRows().filter((r) => r.selected).length;
  }

  selectAll(val: boolean): void {
    this.parsedRows.update((rows) => rows.map((r) => ({ ...r, selected: val })));
  }

  toggleKind(row: ImportPreviewRow): void {
    row.kind = row.kind === 'expense' ? 'income' : 'expense';
    row.tag = row.kind === 'income' ? 'saving' : 'need';
  }

  clearFile(): void {
    this.parsedRows.set([]);
    this.errorMessage.set(null);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      this.processFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.processFile(input.files[0]);
    }
  }

  private processFile(file: File): void {
    this.errorMessage.set(null);
    const name = file.name.toLowerCase();

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      this.readPdfFile(file);
    } else {
      this.readCsvFile(file);
    }
  }

  private readPdfFile(file: File): void {
    this.isParsing.set(true);
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const base64 = arrayBufferToBase64(buffer);

        this.api.parsePdfStatement(base64, file.name).subscribe({
          next: (res) => {
            this.isParsing.set(false);
            if (res && res.rows && res.rows.length) {
              this.parsedRows.set(res.rows.map((r: any) => ({
                date: r.date,
                amountCents: r.amountCents,
                merchant: r.merchant,
                notes: r.notes || '',
                bankRef: r.bankRef || '',
                status: r.status || 'SUCCESS',
                kind: r.kind || 'expense',
                tag: r.tag || 'need',
                category: r.category || (this.categories[0]?.name || 'General'),
                selected: true
              })));
            } else {
              this.errorMessage.set('No transactions could be detected in this PDF. Please verify it is a valid bank statement or UPI transaction history.');
            }
          },
          error: (err) => {
            this.isParsing.set(false);
            const msg = err?.error?.error || 'Could not parse PDF. Ensure it contains text and is not an image-only scan.';
            this.errorMessage.set(msg);
          }
        });
      } catch (e: any) {
        this.isParsing.set(false);
        this.errorMessage.set(e?.message || 'Error reading PDF file.');
      }
    };

    reader.onerror = () => {
      this.isParsing.set(false);
      this.errorMessage.set('Error loading PDF file from device.');
    };

    reader.readAsArrayBuffer(file);
  }

  private readCsvFile(file: File): void {
    this.isParsing.set(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      this.isParsing.set(false);
      const content = e.target?.result as string;
      if (content) {
        this.parseCsvContent(content);
      }
    };

    reader.onerror = () => {
      this.isParsing.set(false);
      this.errorMessage.set('Error reading CSV file.');
    };

    reader.readAsText(file);
  }

  private parseCsvContent(csv: string): void {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      this.errorMessage.set('CSV file has no data rows.');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.replace(/["']/g, '').trim().toLowerCase());
    const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('time'));
    const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('amt') || h.includes('debit') || h.includes('price'));
    const descIdx = headers.findIndex((h) => h.includes('merchant') || h.includes('desc') || h.includes('narration') || h.includes('party') || h.includes('name'));
    const catIdx = headers.findIndex((h) => h.includes('category') || h.includes('type'));

    const rows: ImportPreviewRow[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim());
      if (cols.length < 2) continue;

      let date = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : today;
      const dateParts = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dateParts) {
        date = `${dateParts[3]}-${dateParts[2].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = today;
      }

      const rawAmount = amountIdx >= 0 ? cols[amountIdx].replace(/[^\d.-]/g, '') : cols[1];
      const parsedAmount = parseFloat(rawAmount);
      if (isNaN(parsedAmount) || Math.abs(parsedAmount) === 0) continue;

      const isIncome = parsedAmount > 0 && (headers[amountIdx]?.includes('credit') || cols[descIdx]?.toLowerCase().includes('salary'));
      const absAmount = Math.abs(parsedAmount);
      const merchant = (descIdx >= 0 && cols[descIdx]) ? cols[descIdx].slice(0, 80) : 'Imported Transaction';
      const category = (catIdx >= 0 && cols[catIdx]) ? cols[catIdx] : (this.categories[0]?.name || 'General');

      rows.push({
        date,
        amountCents: Math.round(absAmount * 100),
        merchant,
        notes: `Imported from CSV statement on ${today}`,
        kind: isIncome ? 'income' : 'expense',
        tag: isIncome ? 'saving' : 'need',
        category,
        selected: true
      });
    }

    if (rows.length === 0) {
      this.errorMessage.set('No valid transaction rows found in CSV.');
    } else {
      this.parsedRows.set(rows);
    }
  }

  submitImport(): void {
    const selected = this.parsedRows().filter((r) => r.selected);
    if (!selected.length) return;

    this.isImporting.set(true);
    const items = selected.map((r) => ({
      amountCents: r.amountCents,
      kind: r.kind,
      tag: r.tag,
      category: r.category,
      merchant: r.merchant,
      notes: r.notes,
      occurredAt: `${r.date}T12:00:00.000Z`
    }));

    this.api.bulkImportExpenses(items).subscribe({
      next: (res) => {
        this.isImporting.set(false);
        this.imported.emit(res.count);
        this.close.emit();
      },
      error: (err) => {
        this.isImporting.set(false);
        this.errorMessage.set(err?.error?.error || 'Failed to import transactions to database.');
      }
    });
  }
}
