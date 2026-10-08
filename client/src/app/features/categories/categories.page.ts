import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Category } from '../../core/models';

@Component({ selector: 'app-categories', standalone: true, imports: [CommonModule, FormsModule], template: `
  <div class="categories-container">
    <h1>Categories</h1>
    <p class="lede">Dynamic departments with custom emojis. Deleting a category archives it — past transactions keep their label, color and emoji snapshot.</p>
    <div class="flash {{ f.type }}" *ngIf="flash() as f">{{ f.text }}</div>

    <div class="layout">
      <!-- ALL CATEGORIES CARD -->
      <div class="card all-cats-card">
        <div class="card-header-row">
          <h3>All categories ({{ cats().length }})</h3>
        </div>

        <!-- DESKTOP TABLE VIEW -->
        <div class="table-wrap desktop-only">
          <table>
            <thead>
              <tr>
                <th style="width:60px;text-align:center">Emoji</th>
                <th>Category</th>
                <th style="width:90px">Type</th>
                <th style="width:90px">Status</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of cats()" [class.deleting]="deletingCatIds().has(c.id)">
                <td style="text-align:center">
                  <input [id]="'cat-icon-' + c.id" [name]="'cat-icon-' + c.id" class="emoji" [(ngModel)]="c.icon" maxlength="8" [disabled]="saving() === c.id" />
                </td>
                <td>
                  <div class="cat-cell">
                    <span class="chip" [style.background]="c.colorHex + '22'" [style.color]="c.colorHex">
                      {{ c.icon || '🏷️' }} {{ c.name }}
                    </span>
                    <input *ngIf="!c.isSystem" [id]="'cat-name-' + c.id" [name]="'cat-name-' + c.id" class="name-edit" [(ngModel)]="c.name" placeholder="Rename category" />
                  </div>
                </td>
                <td>
                  <span class="tag-pill" [class.system]="c.isSystem">{{ c.isSystem ? 'System' : 'Custom' }}</span>
                </td>
                <td>
                  <span class="tag-pill" [class.active]="!c.isArchived" [class.archived]="c.isArchived">
                    {{ c.isArchived ? 'Archived' : 'Active' }}
                  </span>
                </td>
                <td class="row-actions">
                  <div class="actions-flex">
                    <input [id]="'cat-color-' + c.id" [name]="'cat-color-' + c.id" type="color" class="swatch-picker" [(ngModel)]="c.colorHex" title="Change category color" />
                    <button class="ghost" (click)="save(c)">Save</button>
                    <ng-container *ngIf="!c.isSystem">
                      <button class="ghost" (click)="toggleArchive(c)">{{ c.isArchived ? 'Restore' : 'Archive' }}</button>
                      <button class="ghost danger" [disabled]="deletingCatIds().has(c.id)" (click)="remove(c)">Delete</button>
                    </ng-container>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- MOBILE CARDS VIEW (Clean, zero horizontal overlap) -->
        <div class="mobile-only cat-cards-list">
          <div class="cat-card-item" *ngFor="let c of cats()" [class.deleting]="deletingCatIds().has(c.id)">
            <div class="cat-card-main">
              <div class="cat-card-emoji-wrap">
                <input [id]="'cat-icon-m-' + c.id" [name]="'cat-icon-m-' + c.id" class="emoji" [(ngModel)]="c.icon" maxlength="8" [disabled]="saving() === c.id" />
              </div>
              <div class="cat-card-info">
                <div class="cat-card-title-row">
                  <span class="chip" [style.background]="c.colorHex + '22'" [style.color]="c.colorHex">
                    {{ c.icon || '🏷️' }} {{ c.name }}
                  </span>
                  <div class="tags-group">
                    <span class="tag-pill" [class.system]="c.isSystem">{{ c.isSystem ? 'System' : 'Custom' }}</span>
                    <span class="tag-pill" [class.active]="!c.isArchived" [class.archived]="c.isArchived">{{ c.isArchived ? 'Archived' : 'Active' }}</span>
                  </div>
                </div>
                <input *ngIf="!c.isSystem" [id]="'cat-name-m-' + c.id" [name]="'cat-name-m-' + c.id" class="name-edit mobile-input" [(ngModel)]="c.name" placeholder="Rename category" />
              </div>
            </div>

            <div class="cat-card-actions">
              <div class="color-wrap">
                <label [for]="'cat-color-m-' + c.id" class="swatch-label">Color:</label>
                <input [id]="'cat-color-m-' + c.id" [name]="'cat-color-m-' + c.id" type="color" class="swatch-picker" [(ngModel)]="c.colorHex" />
              </div>
              <div class="btns-wrap">
                <button class="ghost" (click)="save(c)">Save</button>
                <ng-container *ngIf="!c.isSystem">
                  <button class="ghost" (click)="toggleArchive(c)">{{ c.isArchived ? 'Restore' : 'Archive' }}</button>
                  <button class="ghost danger" [disabled]="deletingCatIds().has(c.id)" (click)="remove(c)">Delete</button>
                </ng-container>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CREATE NEW CATEGORY CARD -->
      <div class="card create-card">
        <h3>New custom category</h3>
        <p class="mini-hint">Create specialized categories with custom icons and theme colors.</p>
        <label for="new-cat-icon">Emoji icon</label>
        <input id="new-cat-icon" name="newCatIcon" class="emoji big" [(ngModel)]="icon" maxlength="8" placeholder="🏷️" />
        <label for="new-cat-name">Category name</label>
        <input id="new-cat-name" name="newCatName" [(ngModel)]="name" placeholder="e.g. Salary, Vacation 2026" />
        <label for="new-cat-color">Color theme</label>
        <div class="color-picker-row">
          <input id="new-cat-color" name="newCatColor" type="color" [(ngModel)]="color" class="swatch-picker-lg" />
          <span class="color-val">{{ color }}</span>
        </div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn-primary" style="width:100%" [disabled]="!name.trim()" (click)="create()">+ Create category</button>
        </div>
      </div>
    </div>
  </div>
`, styles: [`
  .categories-container { padding-bottom: 90px; }
  .lede { color:#64748B; margin-top:0; max-width:720px; font-size:14px; line-height:1.5; }
  .layout { display:grid; grid-template-columns:2fr 1fr; gap:16px; align-items:start; }
  @media(max-width:960px) { .layout { grid-template-columns:1fr; } }

  .card-header-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  .card-header-row h3 { margin:0; }

  /* Table styling */
  .table-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:10px 8px; vertical-align:middle; font-size:13px; }
  th { color:#64748B; font-weight:600; text-align:left; border-bottom:1px solid #E2E8F0; }
  tbody tr { border-bottom:1px solid #F1F5F9; transition:background .1s ease; }
  tbody tr:hover { background:#F8FAFC; }

  .cat-cell { display:flex; flex-direction:column; gap:4px; align-items:flex-start; }
  .name-edit { font-size:12px; padding:4px 8px; border-radius:6px; border:1px solid #CBD5E1; background:#fff; width:100%; max-width:180px; box-sizing:border-box; }
  .name-edit:focus { border-color:#6366F1; outline:none; }

  .tag-pill { display:inline-block; font-size:11px; font-weight:600; padding:2px 7px; border-radius:999px; background:#F1F5F9; color:#64748B; }
  .tag-pill.system { background:#EFF6FF; color:#2563EB; }
  .tag-pill.active { background:#ECFDF5; color:#059669; }
  .tag-pill.archived { background:#F1F5F9; color:#94A3B8; }

  .row-actions { text-align:right; white-space:nowrap; }
  .actions-flex { display:inline-flex; align-items:center; gap:6px; justify-content:flex-end; }
  .swatch-picker { width:32px; height:28px; padding:0; border:1px solid #CBD5E1; border-radius:6px; cursor:pointer; background:none; vertical-align:middle; }
  .swatch-picker-lg { width:48px; height:36px; padding:0; border:1px solid #CBD5E1; border-radius:6px; cursor:pointer; background:none; }
  .color-picker-row { display:flex; align-items:center; gap:10px; }
  .color-val { font-size:13px; color:#64748B; font-family:monospace; }
  .mini-hint { font-size:12px; color:#64748B; margin:0 0 12px; }

  .ghost { padding:4px 9px; font-size:12px; border:1px solid #CBD5E1; background:#fff; border-radius:6px; cursor:pointer; transition:all 0.05s ease; color:#334155; }
  .ghost:hover { border-color:#6366F1; color:#4338CA; background:#EEF2FF; }
  .ghost.danger { color:#DC2626; border-color:#FECACA; }
  .ghost.danger:hover { background:#FEF2F2; border-color:#DC2626; }

  .emoji { width:44px; height:36px; text-align:center; font-size:18px; border:1px solid #CBD5E1; border-radius:6px; background:#fff; }
  .emoji.big { width:60px; height:42px; font-size:22px; margin-bottom:8px; }

  /* Mobile vs Desktop responsive visibility */
  .desktop-only { display:block; }
  .mobile-only { display:none; }

  @media(max-width:680px) {
    .desktop-only { display:none !important; }
    .mobile-only { display:block !important; }

    .cat-cards-list { display:flex; flex-direction:column; gap:10px; }
    .cat-card-item { background:#fff; border:1px solid #E2E8F0; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:10px; box-shadow:0 1px 3px rgba(0,0,0,0.03); }
    .cat-card-main { display:flex; gap:10px; align-items:flex-start; }
    .cat-card-emoji-wrap { flex-shrink:0; }
    .cat-card-info { flex:1; min-width:0; }
    .cat-card-title-row { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px; }
    .tags-group { display:flex; gap:4px; }
    .mobile-input { width:100%; max-width:none; margin-top:6px; }

    .cat-card-actions { display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid #F1F5F9; gap:8px; flex-wrap:wrap; }
    .color-wrap { display:flex; align-items:center; gap:6px; font-size:12px; color:#64748B; }
    .swatch-label { font-size:12px; margin:0; }
    .btns-wrap { display:flex; gap:6px; }
  }
`] })
export class CategoriesPage implements OnInit {
  private api = inject(ApiService);
  readonly cats = signal<Category[]>([]);
  readonly flash = signal<{ type: string; text: string } | null>(null);
  readonly saving = signal<number | null>(null);
  readonly deletingCatIds = signal<Set<number>>(new Set());
  name = '';
  color = '#6366F1';
  icon = '🏷️';

  async ngOnInit(): Promise<void> {
    await this.load(true);
  }

  private async load(includeArchived: boolean): Promise<void> {
    try {
      this.cats.set(await firstValueFrom(this.api.getCategories(includeArchived)));
    } catch {
      this.flash.set({ type: 'err', text: 'Failed to load categories' });
    }
  }

  async create(): Promise<void> {
    const name = this.name.trim();
    if (!name) return;
    try {
      await firstValueFrom(
        this.api.createCategory({
          name,
          colorHex: this.color,
          icon: this.icon.trim() || '🏷️',
        })
      );
      this.flash.set({ type: 'ok', text: `${this.icon || '🏷️'} ${name} created` });
      setTimeout(() => { if (this.flash()?.type === 'ok') this.flash.set(null); }, 3500);
      this.name = '';
      this.icon = '🏷️';
      await this.load(true);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string } };
      this.flash.set({ type: 'err', text: e.error?.error || 'A live category with that name already exists' });
    }
  }

  async save(c: Category): Promise<void> {
    try {
      this.saving.set(c.id);
      const payload: Partial<Pick<Category, 'name' | 'colorHex' | 'icon'>> = {
        colorHex: c.colorHex,
        icon: c.icon || '🏷️',
      };
      if (!c.isSystem && c.name?.trim()) {
        payload.name = c.name.trim();
      }
      await firstValueFrom(this.api.updateCategory(c.id, payload));
      this.flash.set({ type: 'ok', text: `${c.icon || '🏷️'} ${c.name} saved` });
      setTimeout(() => { if (this.flash()?.type === 'ok') this.flash.set(null); }, 3500);
      await this.load(true);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string } };
      this.flash.set({ type: 'err', text: e.error?.error || 'Could not save category' });
    } finally {
      this.saving.set(null);
    }
  }

  async toggleArchive(c: Category): Promise<void> {
    try {
      await firstValueFrom(this.api.archiveCategory(c.id, !c.isArchived));
      this.flash.set({
        type: 'ok',
        text: c.isArchived ? `“${c.name}” restored` : `“${c.name}” archived — history preserved`,
      });
      setTimeout(() => { if (this.flash()?.type === 'ok') this.flash.set(null); }, 3500);
      await this.load(true);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string } };
      this.flash.set({ type: 'err', text: e.error?.error || 'Could not update archive status' });
    }
  }

  async remove(c: Category): Promise<void> {
    const deleteReq = firstValueFrom(this.api.deleteCategory(c.id));
    this.deletingCatIds.update((s) => new Set(s).add(c.id));

    setTimeout(() => {
      this.cats.set(this.cats().filter((item) => item.id !== c.id));
      this.deletingCatIds.update((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
    }, 240);

    try {
      await deleteReq;
      this.flash.set({ type: 'warn', text: `“${c.name}” soft-deleted — past transactions still show it` });
      setTimeout(() => { if (this.flash()?.type === 'warn') this.flash.set(null); }, 3500);
      await this.load(true);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string } };
      this.flash.set({ type: 'err', text: e.error?.error || 'Could not delete category' });
      await this.load(true);
    }
  }
}
