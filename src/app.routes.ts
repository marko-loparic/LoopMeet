import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RecordComponent } from './components/record/record.component';
import { MeetingComponent } from './components/meeting/meeting.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { UsersComponent } from './components/users/users.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'record', component: RecordComponent },
  { path: 'meeting/:id', component: MeetingComponent },
  { path: 'projects', component: ProjectsComponent },
  { path: 'users', component: UsersComponent },
  { path: '**', redirectTo: '' }
];