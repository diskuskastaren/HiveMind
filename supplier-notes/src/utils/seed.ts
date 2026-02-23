import type { Project, Supplier, Note, Task, Decision } from '../types';

const PROJ_RAD = 'seed-proj-radius';
const PROJ_T2 = 'seed-proj-torrent2';

const LUX = 'seed-lux';
const SIG = 'seed-sig';

const N_LUX_0120 = 'seed-n-lux-0120';
const N_LUX_0205 = 'seed-n-lux-0205';
const N_SIG_0202 = 'seed-n-sig-0202';
const N_SIG_0205 = 'seed-n-sig-0205';
const N_SIG_0216 = 'seed-n-sig-0216';
const N_SIG_0223 = 'seed-n-sig-0223';

const d = (s: string) => new Date(s).getTime();

export const seedProjects: Project[] = [
  { id: PROJ_RAD, name: 'Radius', color: '#6366f1', archived: false, createdAt: d('2026-01-15T09:00') },
  { id: PROJ_T2, name: 'Torrent 2', color: '#dc2626', archived: false, createdAt: d('2026-01-15T09:00') },
];

export const seedSuppliers: Supplier[] = [
  { id: LUX, name: 'Luxshare', pinned: true, defaultTemplate: 'standard', color: '#3b82f6', projectIds: [PROJ_RAD], createdAt: d('2026-01-20T09:00') },
  { id: SIG, name: 'Sigma', pinned: true, defaultTemplate: 'standard', color: '#8b5cf6', projectIds: [PROJ_RAD, PROJ_T2], createdAt: d('2026-02-02T09:00') },
];

export const seedNotes: Note[] = [
  {
    id: N_LUX_0120,
    projectId: PROJ_RAD,
    supplierId: LUX,
    title: 'PCBA Rework — D33 Diode',
    attendees: '',
    createdAt: d('2026-01-20T09:00'),
    updatedAt: d('2026-01-20T10:00'),
    content: [
      '<p>Luxshare are currently reworking the PCBA by replacing the <strong>D33 Diode</strong> with a <strong>0 Ohm resistor</strong> at the same size.</p>',
      '<p>They can\'t just change the voltage to 3.3V from 5V — then they need to change the PCB.</p>',
      '<p>Pump driver is always at 5V — they say it is <strong>not programmable</strong>. It is basically fixed at 5V.</p>',
    ].join(''),
  },
  {
    id: N_LUX_0205,
    projectId: PROJ_RAD,
    supplierId: LUX,
    title: 'DVT Approval & CNY Planning',
    attendees: '',
    createdAt: d('2026-02-05T09:00'),
    updatedAt: d('2026-02-05T10:00'),
    content: [
      '<p>Luxshare don\'t know when PCB manufacturer will be back from CNY. They will probably be back after Luxshare.</p>',
      '<p>They are afraid that <strong>Joyo will delay PVT</strong> after CNY.</p>',
      '<p>Luxshare need our approval (with the caveat of issues from issue tracker) for them to proceed.</p>',
      '<p>They want us to <strong>send back golden samples</strong> that are good.</p>',
      '<p>We need Luxshare <strong>BoM discussion</strong> to be sorted out before we can approve DVT.</p>',
    ].join(''),
  },
  {
    id: N_SIG_0202,
    projectId: PROJ_RAD,
    supplierId: SIG,
    title: 'USB Issues & EMC Testing',
    attendees: '',
    createdAt: d('2026-02-02T09:00'),
    updatedAt: d('2026-02-02T10:30'),
    content: [
      '<h2>USB Connectivity Issues</h2>',
      '<p>USB Connectivity issues occurs only if we do a factory reset — then the USB detection can fail.</p>',
      '<ul>',
      '<li><p>Sigma needs a couple of days to fix it. They are optimistic of their solution.</p></li>',
      '<li><p>4 people are working on this topic.</p></li>',
      '<li><p>Only happens when you do a factory reset.</p></li>',
      '</ul>',
      '<h2>EMC Fail (Vincent mail)</h2>',
      '<p>Sigma interpret it as not taking responsibility of design issues…</p>',
      '<p><strong>Option A:</strong> Communicate with Lux and ask the conditions of the testing. Sigma can spend days/weeks trying to figure out what is wrong. Sigma can make another test and provide full report and have it sent to Luxshare.</p>',
      '<p><strong>Option B:</strong> Sigma does pre-EMC test and tries to reproduce EMC test lab procedure but without cert. When they get results, they can see what has failed or not and fix the problem.</p>',
      '<p>Sigma can secure the lab <strong>17th of February</strong>. Will try to get access earlier.</p>',
      '<p>Sigma can do lab test with DVT and make sure we get a version of that PCB that passes the EMC test before CNY is over. Have a version that works and passes by the <strong>19th of February</strong>. Marcin can also push for earlier lab schedule.</p>',
      '<h2>Topic for Next Meeting</h2>',
      '<p>Sigma wants to program everything at once in the factory but Luxshare wants to program the pump driver prior. Luxshare is doing it their way now — let them continue, but another approach would likely cut cost.</p>',
    ].join(''),
  },
  {
    id: N_SIG_0205,
    projectId: PROJ_RAD,
    supplierId: SIG,
    title: 'PCB Changes & Bug Status',
    attendees: '',
    createdAt: d('2026-02-05T14:00'),
    updatedAt: d('2026-02-05T15:00'),
    content: [
      '<ul>',
      '<li><p>Sigma will do the PCB changes and production documentation (soldering adjustments).</p></li>',
      '<li><p>Marcin talked with his manager on concerns of delays — Sigma can\'t change hours of already booked ones and remaining hours will be <strong>~15% discount</strong>.</p></li>',
      '<li><p>Finalizing what Sigma didn\'t manage before: release, fixing documentation, a feature + testing + teaching Chinese supplier to perform the firmware upgrader. Assumed <strong>less than a week</strong>. Components J3 and J4 are not needed.</p></li>',
      '<li><p>USB stuck seems to be <strong>fixed now for Radius</strong>, trying to fix it for APH as well.</p></li>',
      '<li><p>One bug on the Torrent 2 after performing factory reset.</p></li>',
      '<li><p>Torrent effect does not work on Radius as expected.</p></li>',
      '</ul>',
    ].join(''),
  },
  {
    id: N_SIG_0216,
    projectId: PROJ_RAD,
    supplierId: SIG,
    title: 'Pump Curve, Temps & Effect Bugs',
    attendees: '',
    createdAt: d('2026-02-16T09:00'),
    updatedAt: d('2026-02-16T11:00'),
    content: [
      '<h2>Radius Pump Curve</h2>',
      '<p>The span is only between 2700–3400 RPM. Is it possible to get the RPM lower than 2700?</p>',
      '<p><strong>Sigma:</strong> We are not controlling with the PWM directly. This pump controller has its own logic that keeps the pump at a certain level. We need to talk with Luxshare to know the lower and upper limit.</p>',
      '<p>Right now we have two hardcoded limits — one on the firmware and one on the AP — that caps it to 50%–100% adjustability.</p>',
      '<p>TODO: Ask Luxshare — even if we remove the firmware limit, it will still rely on the IC not going below "minimum operating speed". Can we feed 0% PWM input for longer periods to the controller and it will still work?</p>',
      '<p>TODO: Discuss how the Pump cooling tab should look. Sigma will remove the firmware limit and change AP Radius tab Y-axis to Min. RPM / Max. RPM. Make the curve linear from min to max.</p>',

      '<h2>CPU / GPU Temperature Monitoring</h2>',
      '<p>Are we sure we can get CPU-temp info from the motherboard to be displayed in Adjust Pro without any background programs communicating with the webapp? What more info can we get?</p>',
      '<p>TODO: Sigma will look up if they can view CPU-/GPU-temp.</p>',

      '<h2>AIO_PUMP / CPU_FAN Header</h2>',
      '<p>Is there a difference? Do we need to plug into one or the other?</p>',
      '<ul>',
      '<li><p>If you do not have an AIO_PUMP header — go to CPU_FAN, otherwise go to AIO_PUMP.</p></li>',
      '<li><p>AP will override whatever default RPM speed motherboard sends.</p></li>',
      '</ul>',

      '<h2>Radius Start-up Effect Bugs in AP</h2>',
      '<p>Effects <strong>not working</strong>:</p>',
      '<ul>',
      '<li><p>Summer Sky</p></li>',
      '<li><p>Glistening Ice</p></li>',
      '<li><p>Pink Sapphire</p></li>',
      '<li><p>Lunar Mist</p></li>',
      '<li><p>Campfire</p></li>',
      '</ul>',
      '<p>TODO: Send email describing these effect bugs.</p>',

      '<h2>Torrent 2 LED Color Matching</h2>',
      '<p>Case LED strips not matching colors with fans/AIO. Cedar Smoke effect visualizes this well.</p>',
      '<p>Can\'t really do something about it — only changing the LEDs of Torrent to be similar brand/type as the fans/Radius would fix it.</p>',

      '<h2>General Updates</h2>',
      '<ul>',
      '<li><p>USB connectivity problems are <strong>solved for Radius</strong>. Trying to solve for APH as well.</p></li>',
      '<li><p>Windows Dynamic Lighting does work most of the time.</p></li>',
      '</ul>',
    ].join(''),
  },
  {
    id: N_SIG_0223,
    projectId: PROJ_T2,
    supplierId: SIG,
    title: 'LED Failure & QC SOP',
    attendees: '',
    createdAt: d('2026-02-23T09:00'),
    updatedAt: d('2026-02-23T09:30'),
    content: [
      '<p>TODO: What happens if an LED dies on the Torrent 2 / Radius — are they still recognized as the device in Adjust Pro or not?</p>',
      '<p>TODO: Go through the QC SOP APH document and see what is relevant or not.</p>',
      '<p><em>Ring in Victor när vi snackar T2 QC SOP</em></p>',
    ].join(''),
  },
];

let taskSeq = 0;
const tid = () => `seed-task-${++taskSeq}`;

export const seedTasks: Task[] = [
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0202,
    title: 'Fix USB connectivity issue after factory reset',
    status: 'done', priority: 'high', owner: 'Sigma', dueDate: '2026-02-06', tags: ['usb', 'radius'], createdAt: d('2026-02-02T10:00'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0202,
    title: 'Secure EMC lab (target Feb 17, push for earlier)',
    status: 'done', priority: 'high', owner: 'Marcin', dueDate: '2026-02-17', tags: ['emc'], createdAt: d('2026-02-02T10:05'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0202,
    title: 'Run pre-EMC test to reproduce lab procedure, get passing PCB version by Feb 19',
    status: 'doing', priority: 'high', owner: 'Sigma', dueDate: '2026-02-19', tags: ['emc', 'pcb'], createdAt: d('2026-02-02T10:10'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: LUX, noteId: N_LUX_0205,
    title: 'Send back golden samples to Luxshare',
    status: 'open', priority: 'high', owner: '', dueDate: '', tags: ['dvt', 'samples'], createdAt: d('2026-02-05T09:30'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: LUX, noteId: N_LUX_0205,
    title: 'Sort out BoM discussion before DVT approval',
    status: 'open', priority: 'high', owner: '', dueDate: '', tags: ['bom', 'dvt'], createdAt: d('2026-02-05T09:35'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0205,
    title: 'Complete PCB changes and production documentation',
    status: 'doing', priority: 'medium', owner: 'Sigma', dueDate: '', tags: ['pcb'], createdAt: d('2026-02-05T14:30'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0205,
    title: 'Finalize release, documentation, feature, testing & teach Chinese supplier firmware upgrader',
    status: 'doing', priority: 'medium', owner: 'Sigma', dueDate: '', tags: ['firmware', 'release'], createdAt: d('2026-02-05T14:35'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0216,
    title: 'Ask Luxshare: can we feed 0% PWM to pump controller for longer periods? What is the lower limit?',
    status: 'open', priority: 'medium', owner: '', dueDate: '', tags: ['pump', 'pwm', 'luxshare'], createdAt: d('2026-02-16T09:30'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0216,
    title: 'Discuss pump cooling tab UI — Sigma removes firmware limit, AP Y-axis becomes Min/Max RPM with linear curve',
    status: 'open', priority: 'medium', owner: 'Sigma', dueDate: '', tags: ['pump', 'ap-ui'], createdAt: d('2026-02-16T09:35'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0216,
    title: 'Look up if CPU/GPU temp can be read from motherboard and displayed in Adjust Pro',
    status: 'open', priority: 'medium', owner: 'Sigma', dueDate: '', tags: ['temperature', 'ap'], createdAt: d('2026-02-16T09:40'),
  },
  {
    id: tid(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0216,
    title: 'Send email describing Radius start-up effect bugs (Summer Sky, Glistening Ice, Pink Sapphire, Lunar Mist, Campfire)',
    status: 'open', priority: 'medium', owner: '', dueDate: '', tags: ['effects', 'bugs', 'radius'], createdAt: d('2026-02-16T10:00'),
  },
  {
    id: tid(), projectId: PROJ_T2, supplierId: SIG, noteId: N_SIG_0223,
    title: 'Investigate: what happens if LED dies on Torrent 2 / Radius — still recognized in AP?',
    status: 'open', priority: 'low', owner: '', dueDate: '', tags: ['led', 'torrent2', 'radius'], createdAt: d('2026-02-23T09:10'),
  },
  {
    id: tid(), projectId: PROJ_T2, supplierId: SIG, noteId: N_SIG_0223,
    title: 'Go through QC SOP APH document — identify relevant items (ring in Victor for T2)',
    status: 'open', priority: 'medium', owner: '', dueDate: '', tags: ['qc', 'sop', 'aph'], createdAt: d('2026-02-23T09:15'),
  },
];

let decSeq = 0;
const did = () => `seed-dec-${++decSeq}`;

export const seedDecisions: Decision[] = [
  {
    id: did(), projectId: PROJ_RAD, supplierId: LUX, noteId: N_LUX_0120,
    text: 'Replace D33 Diode with 0 Ohm resistor on PCBA (same size)',
    createdAt: d('2026-01-20T09:30'),
  },
  {
    id: did(), projectId: PROJ_RAD, supplierId: LUX, noteId: N_LUX_0120,
    text: 'Pump driver stays at 5V — it is not programmable (fixed)',
    createdAt: d('2026-01-20T09:35'),
  },
  {
    id: did(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0202,
    text: 'Let Luxshare continue programming pump driver their way (prior to final programming) — revisit for cost saving later',
    createdAt: d('2026-02-02T10:20'),
  },
  {
    id: did(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0216,
    text: 'AIO_PUMP vs CPU_FAN: use AIO_PUMP if available, otherwise CPU_FAN — AP overrides default motherboard RPM',
    createdAt: d('2026-02-16T09:50'),
  },
  {
    id: did(), projectId: PROJ_RAD, supplierId: SIG, noteId: N_SIG_0216,
    text: 'Torrent 2 LED color mismatch with fans/AIO cannot be fixed — would require changing LED brand/type in hardware',
    createdAt: d('2026-02-16T10:30'),
  },
];

export function getSeedData() {
  return {
    version: 2 as const,
    exportedAt: Date.now(),
    projects: seedProjects,
    suppliers: seedSuppliers,
    notes: seedNotes,
    tasks: seedTasks,
    decisions: seedDecisions,
  };
}
