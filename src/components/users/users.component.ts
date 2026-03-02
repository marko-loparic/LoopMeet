import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbService, User } from '../../services/db.service';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl mx-auto space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Users</h1>
      </div>

      <!-- Add/Edit User Form -->
      <div class="bg-white shadow sm:rounded-lg p-6">
        <h3 class="text-lg font-medium leading-6 text-gray-900">
            @if (editingUserId()) { Edit User } @else { Add New User }
        </h3>
        <p class="text-sm text-gray-500 mb-4">
            @if (editingUserId()) { Update user details below. } @else { Add users here to easily assign them to meeting transcripts and tickets. }
        </p>
        <div class="mt-2 flex gap-4 items-end">
          <div class="flex-1">
             <label class="block text-xs font-medium text-gray-700 mb-1">Name</label>
             <input 
                type="text" 
                [(ngModel)]="userName" 
                placeholder="User Name (e.g. Alice Smith)"
                class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                (keyup.enter)="saveUser()"
              >
          </div>
          <div class="flex-1">
             <label class="block text-xs font-medium text-gray-700 mb-1">Email</label>
             <input 
                type="email" 
                [(ngModel)]="userEmail" 
                placeholder="Email (Optional)"
                class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                (keyup.enter)="saveUser()"
              >
          </div>
          
          <div class="flex gap-2">
            @if (editingUserId()) {
                <button 
                    (click)="cancelEdit()"
                    class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50">
                    Cancel
                </button>
            }
            <button 
                (click)="saveUser()"
                [disabled]="!userName.trim()"
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                @if (editingUserId()) { Update } @else { Add }
            </button>
          </div>
        </div>
      </div>

      <!-- User List -->
      <div class="bg-white shadow overflow-hidden sm:rounded-md">
        <ul role="list" class="divide-y divide-gray-200">
          @if (users().length === 0) {
            <li class="px-4 py-8 text-center text-gray-500">
              No users found. Speakers renamed in meetings will appear here automatically.
            </li>
          }
          @for (user of users(); track user.id) {
            <li class="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
              <div class="flex items-center">
                <div class="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-4">
                  {{ getInitials(user.name) }}
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-900">{{ user.name }}</p>
                  <p class="text-sm text-gray-500">{{ user.email || 'No email' }}</p>
                </div>
              </div>
              <div class="flex gap-2">
                  <button (click)="editUser(user)" class="text-indigo-600 hover:text-indigo-900 text-sm border border-indigo-200 px-3 py-1 rounded hover:bg-indigo-50">Edit</button>
                  <button (click)="deleteUser(user.id)" class="text-red-600 hover:text-red-900 text-sm border border-red-200 px-3 py-1 rounded hover:bg-red-50">Delete</button>
              </div>
            </li>
          }
        </ul>
      </div>
    </div>
  `
})
export class UsersComponent implements OnInit {
  db = inject(DbService);
  users = signal<User[]>([]);
  
  userName = '';
  userEmail = '';
  editingUserId = signal<string | null>(null);

  ngOnInit() {
    this.loadUsers();
  }

  async loadUsers() {
    // 1. Get existing users
    let users = await this.db.getUsers();
    const existingNames = new Set(users.map(u => u.name.toLowerCase()));

    // 2. Sync from meetings: Find participants not in user list
    const meetings = await this.db.getAllMeetings();
    let added = false;

    for (const m of meetings) {
        if (!m.participants) continue;
        for (const p of m.participants) {
            const name = p.trim();
            if (name && !existingNames.has(name.toLowerCase())) {
                const newUser: User = { 
                    id: uuidv4(), 
                    name: name 
                };
                await this.db.addUser(newUser);
                existingNames.add(name.toLowerCase());
                added = true;
            }
        }
    }

    // 3. Refresh if we added anyone
    if (added) {
        users = await this.db.getUsers();
    }
    
    // Sort users alphabetically
    users.sort((a, b) => a.name.localeCompare(b.name));
    this.users.set(users);
  }

  async saveUser() {
    if (!this.userName.trim()) return;
    
    const id = this.editingUserId() || uuidv4();
    
    await this.db.addUser({
      id,
      name: this.userName.trim(),
      email: this.userEmail.trim()
    });

    this.resetForm();
    this.loadUsers();
  }

  editUser(user: User) {
      this.editingUserId.set(user.id);
      this.userName = user.name;
      this.userEmail = user.email || '';
  }

  cancelEdit() {
      this.resetForm();
  }

  resetForm() {
    this.userName = '';
    this.userEmail = '';
    this.editingUserId.set(null);
  }

  async deleteUser(id: string) {
    if (confirm('Are you sure you want to delete this user? This will not remove their name from existing transcripts.')) {
      await this.db.deleteUser(id);
      // If we are editing the deleted user, reset form
      if (this.editingUserId() === id) {
          this.resetForm();
      }
      this.loadUsers();
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}