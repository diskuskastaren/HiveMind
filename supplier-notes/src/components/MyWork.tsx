import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { useStore } from '../store/store';
import type { Task } from '../types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export function MyWork() {
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const updateTask = useStore((s) => s.updateTask);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const setActiveView = useStore((s) => s.setActiveView);
  const setDashboardSection = useStore((s) => s.setDashboardSection);
  const setFocusedFollowUp = useStore((s) => s.setFocusedFollowUp);
  const [project, setProject] = useState(activeProjectId || 'all');
  const [supplier, setSupplier] = useState('all');
  const [owner, setOwner] = useState('all');
  const [priority, setPriority] = useState('all');
  const today = format(new Date(), 'yyyy-MM-dd');
  const upcoming = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  const matchingTasks = tasks.filter((task) => task.status !== 'done')
    .filter((task) => project === 'all' || task.projectId === project)
    .filter((task) => supplier === 'all' || task.supplierId === supplier)
    .filter((task) => owner === 'all' || (owner === '__unassigned__' ? !task.owner : task.owner === owner))
    .filter((task) => priority === 'all' || task.priority === priority);
  const matchingFollowUps = followUps.filter((item) => item.status === 'open')
    .filter((item) => project === 'all' || item.projectId === project)
    .filter((item) => supplier === 'all' || item.supplierId === supplier)
    .filter((item) => owner === 'all' && priority === 'all')
    .filter((item) => !item.linkedTaskId || !matchingTasks.some((task) => task.id === item.linkedTaskId));
  const overdue = matchingTasks.filter((task) => task.dueDate && task.dueDate < today);
  const dueSoon = matchingTasks.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= upcoming);
  const other = matchingTasks.filter((task) => !overdue.includes(task) && !dueSoon.includes(task))
    .sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'));
  const owners = [...new Set(tasks.map((task) => task.owner).filter(Boolean))].sort();

  const renderTask = (task: Task) => <div key={task.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
    <Button variant="outline" size="xs" onClick={() => updateTask(task.id, { status: task.status === 'open' ? 'doing' : 'done' })}>{task.status}</Button>
    <button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => setEditingTask(task.id)}>{task.title}</button>
    {task.priority === 'high' && <Badge variant="outline">High</Badge>}
    {task.dueDate && <span className="text-xs text-muted-foreground">{task.dueDate}</span>}
    {task.noteId && <Button variant="ghost" size="xs" onClick={() => navigateToNote(task.noteId)}>Source</Button>}
  </div>;
  const section = (title: string, items: Task[]) => items.length > 0 && <section className="rounded-lg border bg-card">
    <h3 className="border-b px-3 py-2 text-xs font-semibold">{title} <span className="text-muted-foreground">{items.length}</span></h3>
    {items.map(renderTask)}
  </section>;

  return <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Today / My Work</h2><p className="text-xs text-muted-foreground">Actions needing attention</p></div></div>
    <div className="flex flex-wrap gap-2">
      <Select value={project} onValueChange={setProject}><SelectTrigger size="sm" aria-label="Project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select value={supplier} onValueChange={setSupplier}><SelectTrigger size="sm" aria-label="Supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select value={owner} onValueChange={setOwner}><SelectTrigger size="sm" aria-label="Owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem><SelectItem value="__unassigned__">Unassigned</SelectItem>{owners.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      <Select value={priority} onValueChange={setPriority}><SelectTrigger size="sm" aria-label="Priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All priorities</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
    </div>
    {section('Overdue', overdue)}
    {section('Due in the next 7 days', dueSoon)}
    {section('Open and prioritized', other)}
    {matchingFollowUps.length > 0 && <section className="rounded-lg border bg-card"><h3 className="border-b px-3 py-2 text-xs font-semibold">Waiting for follow-up <span className="text-muted-foreground">{matchingFollowUps.length}</span></h3>{matchingFollowUps.map((item) => <div key={item.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0"><button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => { setDashboardSection('followups'); setFocusedFollowUp(item.id); setActiveView('tasks'); }}>{item.text}</button>{item.noteId && <Button variant="ghost" size="xs" onClick={() => navigateToNote(item.noteId || null)}>Source</Button>}<Button variant="outline" size="xs" onClick={() => updateFollowUp(item.id, { status: 'resolved' })}>Resolve</Button></div>)}</section>}
    {matchingTasks.length === 0 && matchingFollowUps.length === 0 && <div className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">Nothing needs action right now.</div>}
  </section>;
}
