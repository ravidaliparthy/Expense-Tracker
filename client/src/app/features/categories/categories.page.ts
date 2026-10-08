import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Category } from '../../core/models';

@Component({ selector: 'app-categories', standalone: true, imports: [CommonModule, FormsModule], template: `
  <h1>Categories</h1><p class="lede">Dynamic departments with custom emojis. Deleting a category archives it — past transactions keep their label, color and emoji snapshot.</p>
  <div class="flash {{ f.type }}" *ngIf="flash() as f">{{ f.text }}</div>
  <div class="layout"><div class="card"><h3>All categories</h3><table><thead><tr><th>Emoji</th><th>Category</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
    <tr *ngFor="let c of cats()" [class.deleting]="deletingCatIds().has(c.id)">
      <td><input [id]="'cat-icon-' + c.id" [name]="'cat-icon-' + c.id" class="emoji" [(ngModel)]="c.icon" maxlength="8" [disabled]="saving() === c.id" /></td>
      <td><span class="chip" [style.background]="c.colorHex + '22'" [style.color]="c.colorHex">{{ c.icon || '🏷️' }} {{ c.name }}</span><input [id]="'cat-name-' + c.id" [name]="'cat-name-' + c.id" class="name-edit" [(ngModel)]="c.name" [disabled]="c.isSystem" /></td>
      <td>{{ c.isSystem ? 'System' : 'Custom' }}</td>
      <td><span *ngIf="c.isArchived" style="color:#94A3B8">archived</span><span *ngIf="!c.isArchived" style="color:#059669">active</span></td>
      <td class="row-actions"><input [id]="'cat-color-' + c.id" [name]="'cat-color-' + c.id" type="color" [(ngModel)]="c.colorHex" /><button class="ghost" (click)="save(c)">Save</button><ng-container *ngIf="!c.isSystem"><button class="ghost" (click)="toggleArchive(c)">{{ c.isArchived ? 'Restore' : 'Archive' }}</button><button class="ghost danger" [disabled]="deletingCatIds().has(c.id)" (click)="remove(c)">Delete</button></ng-container></td>
    </tr>
  </tbody></table></div>
  <div class="card"><h3>New custom category</h3>
    <label for="new-cat-icon">Emoji</label>
    <input id="new-cat-icon" name="newCatIcon" class="emoji big" [(ngModel)]="icon" maxlength="8" placeholder="🏷️" />
    <label for="new-cat-name">Name</label>
    <input id="new-cat-name" name="newCatName" [(ngModel)]="name" placeholder="e.g. Salary, Vacation 2026" />
    <label for="new-cat-color">Color</label>
    <input id="new-cat-color" name="newCatColor" type="color" [(ngModel)]="color" style="height:40px" />
    <div class="modal-actions"><button class="btn-primary" [disabled]="!name.trim()" (click)="create()">Create category</button></div>
  </div></div>
`, styles: [`.lede{color:#64748B;margin-top:0;max-width:720px}.layout{display:grid;grid-template-columns:2fr 1fr;gap:16px}@media(max-width:900px){.layout{grid-template-columns:1fr}}.row-actions{text-align:right;white-space:nowrap}.row-actions .ghost{padding:4px 9px;font-size:12px;border:1px solid #CBD5E1;background:#fff;border-radius:6px;cursor:pointer;margin-left:6px;transition:background-color 0.05s ease, border-color 0.05s ease, color 0.05s ease}.row-actions .danger{color:#DC2626;border-color:#FECACA}.emoji{width:54px;text-align:center;font-size:20px}.emoji.big{width:70px;height:44px}.name-edit{margin-top:6px;font-size:12px;padding:5px 7px}`] })
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
