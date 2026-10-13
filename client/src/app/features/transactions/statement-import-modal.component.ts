import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Category, TransactionKind, TransactionTag, money } from '../../core/models';

export interface ImportPreviewRow {
  date: string;
  amountCents: number;
  merchant: string;
  notes: string;
  kind: TransactionKind;
  tag: TransactionTag;
  category: string;
  selected: boolean;
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
              <h3>Import Statement / CSV</h3>
              <p class="subtitle">Upload your bank statement or CSV file to batch-import transactions</p>
            </div>
          </div>
          <button type="button" class="btn-close" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <!-- Step 1: Upload Box -->
          <div *ngIf="parsedRows().length === 0" class="upload-dropzone" (dragover)="$event.preventDefault()" (drop)="onFileDrop($event)">
            <span class="drop-icon">📥</span>
            <h4>Drag & drop your CSV file here</h4>
            <p>Or click browse to select a file from your device</p>
            <input type="file" accept=".csv" #fileInput (change)="onFileSelected($event)" style="display:none" />
            <button type="button" class="btn-browse" (click)="fileInput.click()">📁 Browse CSV File</button>
            <div class="csv-sample-hint">
              <span>Expected columns: Date, Amount, Merchant/Description, Category (optional)</span>
            </div>
          </div>

          <!-- Step 2: Preview & Validation Table -->
          <div *ngIf="parsedRows().length > 0" class="preview-container">
            <div class="preview-toolbar">
              <span class="count-badge">Found {{ selectedCount() }} / {{ parsedRows().length }} valid rows</span>
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
                    <th>Description</th>
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
                    <td>{{ row.date }}</td>
                    <td class="desc-cell" [title]="row.merchant">{{ row.merchant }}</td>
                    <td>
                      <select [(ngModel)]="row.category" class="cell-select">
                        <option *ngFor="let c of categories" [value]="c.name">{{ c.icon }} {{ c.name }}</option>
                      </select>
                    </td>
                    <td>
                      <span class="kind-pill" [class.income]="row.kind === 'income'">{{ row.kind }}</span>
                    </td>
                    <td>
                      <select [(ngModel)]="row.tag" class="cell-select">
                        <option value="need">Need</option>
                        <option value="want">Want</option>
                        <option value="saving">Saving</option>
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
            *ngIf="parsedRows().length > 0"
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
      background: #FFFFFF; border-radius: 16px; width: 100%; max-width: 820px;
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
    .upload-dropzone {
      border: 2px dashed #CBD5E1; border-radius: 12px; padding: 36px 20px;
      text-align: center; display: flex; flex-direction: column; align-items: center;
      gap: 10px; background: #F8FAFC;
    }
    :host-context([data-theme='dark']) .upload-dropzone {
      background: #1E293B; border-color: #475569;
    }
    .drop-icon { font-size: 36px; }
    .upload-dropzone h4 { margin: 0; font-size: 16px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .upload-dropzone h4 { color: #F1F5F9; }
    .upload-dropzone p { margin: 0; font-size: 12px; color: #64748B; }
    .btn-browse {
      margin-top: 8px; background: #4F46E5; color: #FFFFFF; border: none;
      padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    .csv-sample-hint { margin-top: 10px; font-size: 11px; color: #94A3B8; }
    .preview-container { display: flex; flex-direction: column; gap: 12px; }
    .preview-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
    .count-badge { font-size: 12px; font-weight: 700; color: #4F46E5; background: #EEF2FF; padding: 3px 8px; border-radius: 6px; }
    :host-context([data-theme='dark']) .count-badge { background: #312E81; color: #A5B4FC; }
    .btn-group { display: flex; gap: 8px; }
    .btn-text { background: none; border: none; font-size: 12px; color: #64748B; cursor: pointer; font-weight: 600; }
    .btn-text.text-danger { color: #EF4444; }
    .table-wrap { max-height: 50vh; overflow-y: auto; border: 1px solid #E2E8F0; border-radius: 8px; }
    :host-context([data-theme='dark']) .table-wrap { border-color: #334155; }
    .import-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .import-table th { background: #F8FAFC; padding: 10px 12px; text-align: left; font-weight: 700; color: #475569; position: sticky; top: 0; z-index: 1; }
    :host-context([data-theme='dark']) .import-table th { background: #1E293B; color: #CBD5E1; }
    .import-table td { padding: 8px 12px; border-top: 1px solid #E2E8F0; }
    :host-context([data-theme='dark']) .import-table td { border-top-color: #334155; }
    .unselected { opacity: 0.45; }
    .desc-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .cell-select { border: 1px solid #CBD5E1; border-radius: 4px; padding: 3px 6px; font-size: 11px; background: transparent; }
    :host-context([data-theme='dark']) .cell-select { border-color: #475569; color: #F1F5F9; }
    .kind-pill { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #FEE2E2; color: #EF4444; text-transform: uppercase; }
    .kind-pill.income { background: #DCFCE7; color: #16A34A; }
    .amt-cell { font-weight: 700; color: #EF4444; }
    .amt-cell.income { color: #16A34A; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 10px; }
    :host-context([data-theme='dark']) .modal-footer { border-top-color: #334155; }
    .btn-ghost { background: none; border: 1px solid #CBD5E1; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    :host-context([data-theme='dark']) .btn-ghost { border-color: #475569; color: #E2E8F0; }
    .btn-primary { background: #4F46E5; color: #FFFFFF; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class StatementImportModalComponent {
  @Input() currency = 'USD';
  @Input() categories: Category[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() imported = new EventEmitter<number>();

  private readonly api = inject(ApiService);
  readonly parsedRows = signal<ImportPreviewRow[]>([]);
  readonly isImporting = signal(false);
  readonly money = money;

  selectedCount(): number {
    return this.parsedRows().filter((r) => r.selected).length;
  }

  selectAll(val: boolean): void {
    this.parsedRows.update((rows) => rows.map((r) => ({ ...r, selected: val })));
  }

  clearFile(): void {
    this.parsedRows.set([]);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      this.readFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.readFile(input.files[0]);
    }
  }

  private readFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        this.parseCsvContent(content);
      }
    };
    reader.readAsText(file);
  }

  private parseCsvContent(csv: string): void {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    // Header index detection
    const headers = lines[0].split(',').map((h) => h.replace(/["']/g, '').trim().toLowerCase());
    const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('time'));
    const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('amt') || h.includes('debit') || h.includes('price'));
    const descIdx = headers.findIndex((h) => h.includes('merchant') || h.includes('desc') || h.includes('narration') || h.includes('party') || h.includes('name'));
    const catIdx = headers.findIndex((h) => h.includes('category') || h.includes('type'));

    const rows: ImportPreviewRow[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV splitter respecting simple commas
      const cols = line.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim());
      if (cols.length < 2) continue;

      let date = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : today;
      // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
      const dateParts = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dateParts) {
        date = `${dateParts[3]}-${dateParts[2].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = today;
      }

      const rawAmount = amountIdx >= 0 ? cols[amountIdx].replace(/[^\d.-]/g, '') : cols[1];
      const parsedAmount = parseFloat(rawAmount);
      if (isNaN(parsedAmount) || Math.abs(parsedAmount) === 0) continue;

      const isIncome = parsedAmount < 0 ? false : (headers[amountIdx]?.includes('credit') || cols[descIdx]?.toLowerCase().includes('salary'));
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

    this.parsedRows.set(rows);
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
      error: () => {
        this.isImporting.set(false);
      }
    });
  }
}
