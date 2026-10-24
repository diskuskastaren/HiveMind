import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Mic,
  Video,
  Database,
  Eye,
  EyeOff,
  Check,
  Loader2,
  AlertCircle,
  FolderOpen,
  Download,
  Upload,
  Trash2,
  Palette,
  RefreshCw,
  History,
  Info,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store/store';
import { version } from '../../package.json';
import { exportAllData } from '../utils/export';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type SettingsTab = 'appearance' | 'ai' | 'recording' | 'teams' | 'releases' | 'data';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette className="size-4" /> },
  { id: 'ai', label: 'AI & Summarization', icon: <Bot className="size-4" /> },
  { id: 'recording', label: 'Recording', icon: <Mic className="size-4" /> },
  { id: 'teams', label: 'Teams', icon: <Video className="size-4" /> },
  { id: 'releases', label: 'Version history', icon: <History className="size-4" /> },
  { id: 'data', label: 'Data & Storage', icon: <Database className="size-4" /> },
];

const GPT_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (fast, cheap)' },
  { value: 'gpt-4o', label: 'GPT-4o (best quality)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'o1-mini', label: 'o1-mini (reasoning)' },
];

// Prices per 1M tokens (source: openai.com/api/pricing)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini':  { input: 0.15,  output: 0.60  },
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4-turbo':  { input: 10.00, output: 30.00 },
  'o1-mini':      { input: 3.00,  output: 12.00 },
};
const WHISPER_COST_PER_MIN = 0.000667; // $0.04/hr — Groq whisper-large-v3-turbo (~4.5x cheaper than gpt-4o-mini-transcribe)

// Estimate cost for an N-minute system-audio meeting
function estimateMeetingCost(model: string, minutes: number) {
  const wordsPerMin = 100; // average spoken words per minute
  const words = minutes * wordsPerMin;
  const inputTokens = Math.round(words * 1.3);
  const outputTokens = Math.min(2000, Math.max(300, Math.round(words * 0.15)));
  const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
  const gptCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  const whisperCost = minutes * WHISPER_COST_PER_MIN;
  return { gptCost, whisperCost, total: gptCost + whisperCost };
}

function CostEstimatePanel({ activeModel }: { activeModel: string }) {
  const minutes = 60;
  const whisperCost = minutes * WHISPER_COST_PER_MIN;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-sidebar p-3.5">
      <p className="text-xs font-semibold">Estimated cost — 1 hour meeting</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">Model</span>
        <span className="text-right text-muted-foreground">Transcription</span>
        <span className="text-right text-muted-foreground">Summary</span>
        <span className="text-right text-muted-foreground">Total</span>
        {GPT_MODELS.map((m) => {
          const { gptCost, total } = estimateMeetingCost(m.value, minutes);
          const isActive = m.value === activeModel;
          const summaryLabel = gptCost < 0.01 ? '<$0.01' : `$${gptCost.toFixed(2)}`;
          const tone = isActive ? 'text-foreground' : 'text-muted-foreground';
          return (
            <div key={m.value} className="contents">
              <span className={cn('truncate', tone, isActive && 'font-medium')}>{m.label}</span>
              <span className={cn('text-right font-mono', tone)}>${whisperCost.toFixed(2)}</span>
              <span className={cn('text-right font-mono', tone)}>{summaryLabel}</span>
              <span className={cn('text-right font-mono font-semibold', tone)}>${total.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        Transcription cost is the same regardless of model. Mic mode uses browser speech recognition — no transcription charge. Transcription via Groq Whisper Large V3 Turbo ($0.04/hr). Summary prices from openai.com/api/pricing, ~100 wpm assumed.
      </p>
    </div>
  );
}

function SettingRow({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-ui">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionHeading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-sm font-semibold">{children}</h3>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-border" />;
}

function KeyStatus({ status, error, saved, savedLabel }: { status: 'idle' | 'testing' | 'ok' | 'error'; error: string; saved: boolean; savedLabel: string }) {
  if (status === 'error' && error) return <p className="text-xs text-destructive">{error}</p>;
  if (status === 'ok')
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <Check className="size-3.5" /> Key is valid and saved
      </p>
    );
  if (saved)
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <Check className="size-3.5" /> {savedLabel}
      </p>
    );
  return null;
}

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const getExportData = useStore((s) => s.getExportData);
  const importData = useStore((s) => s.importData);
  const openConfirmDialog = useStore((s) => s.openConfirmDialog);

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.openaiApiKey);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqKeyDraft, setGroqKeyDraft] = useState(settings.groqApiKey ?? '');
  const [groqTestStatus, setGroqTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [groqTestError, setGroqTestError] = useState('');
  const [clearConfirm, setClearConfirm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle');
  const [currentDataDir, setCurrentDataDir] = useState<string>('');
  const [isCustomDataDir, setIsCustomDataDir] = useState(false);
  const [dataDirChanging, setDataDirChanging] = useState(false);
  const [githubReleases, setGithubReleases] = useState<Array<{ tag_name: string; body: string | null; published_at: string | null }>>([]);
  const [githubReleasesLoading, setGithubReleasesLoading] = useState(false);
  const [githubReleasesError, setGithubReleasesError] = useState<string | null>(null);

  // Sync drafts when settings change from outside (e.g. migration)
  useEffect(() => {
    setApiKeyDraft(settings.openaiApiKey);
  }, [settings.openaiApiKey]);

  useEffect(() => {
    setGroqKeyDraft(settings.groqApiKey ?? '');
  }, [settings.groqApiKey]);

  // Load current data directory path
  useEffect(() => {
    const electronStore = (window as any).electronStore;
    if (electronStore?.getDataDir) {
      electronStore.getDataDir().then((result: { dir: string; isCustom: boolean }) => {
        setCurrentDataDir(result?.dir || '');
        setIsCustomDataDir(result?.isCustom ?? false);
      });
    }
  }, []);

  // Fetch GitHub releases when Version history tab is open
  const fetchGithubReleases = () => {
    setGithubReleasesLoading(true);
    setGithubReleasesError(null);
    fetch('https://api.github.com/repos/diskuskastaren/HiveMind/releases', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Repo or releases not found' : `HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Array<{ tag_name: string; body: string | null; published_at: string | null; draft?: boolean }>) => {
        const published = (data || []).filter((r) => !r.draft).slice(0, 30);
        setGithubReleases(published);
      })
      .catch((e: Error) => setGithubReleasesError(e?.message ?? 'Failed to load releases'))
      .finally(() => setGithubReleasesLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'releases') fetchGithubReleases();
  }, [activeTab]);

  const saveApiKey = () => {
    updateSettings({ openaiApiKey: apiKeyDraft.trim() });
  };

  const handleTestApiKey = async () => {
    const key = apiKeyDraft.trim();
    if (!key) return;
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        updateSettings({ openaiApiKey: key });
        setTestStatus('ok');
        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setTestError(err?.error?.message ?? `HTTP ${res.status}`);
        setTestStatus('error');
      }
    } catch (e: any) {
      setTestError(e?.message ?? 'Network error');
      setTestStatus('error');
    }
  };

  const saveGroqKey = () => {
    updateSettings({ groqApiKey: groqKeyDraft.trim() });
  };

  const handleTestGroqKey = async () => {
    const key = groqKeyDraft.trim();
    if (!key) return;
    setGroqTestStatus('testing');
    setGroqTestError('');
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        updateSettings({ groqApiKey: key });
        setGroqTestStatus('ok');
        setTimeout(() => setGroqTestStatus('idle'), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setGroqTestError(err?.error?.message ?? `HTTP ${res.status}`);
        setGroqTestStatus('error');
      }
    } catch (e: any) {
      setGroqTestError(e?.message ?? 'Network error');
      setGroqTestStatus('error');
    }
  };

  const handleExport = () => {
    exportAllData(getExportData());
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        importData(data);
        toast.success('Data imported successfully');
      } catch {
        toast.error('Invalid backup file', { description: 'Please select a valid Combobulator backup JSON.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    const electronStore = (window as any).electronStore;
    if (electronStore?.openFolder) {
      await electronStore.openFolder();
    } else if (electronStore?.getPath) {
      const filePath: string = await electronStore.getPath();
      const folder = filePath.replace(/[^\\/]+$/, '');
      const openExternal = (window as any).electronOpenExternal?.open;
      if (openExternal) openExternal('file:///' + folder.replace(/\\/g, '/'));
    }
  };

  const handleChangeDataDir = async () => {
    const electronStore = (window as any).electronStore;
    if (!electronStore?.changeDataDir) return;
    setDataDirChanging(true);
    try {
      await electronStore.changeDataDir();
      // App will relaunch — no further action needed
    } finally {
      setDataDirChanging(false);
    }
  };

  const handleResetDataDir = () => {
    const electronStore = (window as any).electronStore;
    if (!electronStore?.resetDataDir) return;
    openConfirmDialog({
      title: 'Reset data folder?',
      message: 'Reset the data folder to the default location? The app will restart.',
      confirmLabel: 'Reset folder',
      onConfirm: async () => {
        setDataDirChanging(true);
        try {
          await electronStore.resetDataDir();
        } finally {
          setDataDirChanging(false);
        }
      },
    });
  };

  const handleCheckForUpdates = async () => {
    const updater = (window as any).electronUpdater;
    if (!updater) return;
    setUpdateCheckStatus('checking');
    try {
      const result = await updater.check();
      setUpdateCheckStatus(result?.status ?? 'up-to-date');
    } catch {
      setUpdateCheckStatus('error');
    }
  };

  const handleClearData = () => {
    if (clearConfirm !== 'DELETE') return;
    useStore.setState({
      projects: [],
      suppliers: [],
      notes: [],
      tasks: [],
      decisions: [],
      followUps: [],
      activeProjectId: null,
      openTabs: [],
      activeTabId: null,
      activeNoteId: null,
    });
    setClearConfirm('');
    toggleSettings();
  };

  const keyInput = (
    id: string,
    value: string,
    setValue: (v: string) => void,
    onSave: () => void,
    show: boolean,
    setShow: (fn: (v: boolean) => boolean) => void,
    placeholder: string,
    status: 'idle' | 'testing' | 'ok' | 'error',
    onTest: () => void,
  ) => (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onSave}
          placeholder={placeholder}
          className="pr-9 font-mono text-ui"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide key' : 'Show key'}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      <Button variant="outline" onClick={onTest} disabled={!value.trim() || status === 'testing'}>
        {status === 'testing' && <Loader2 className="animate-spin" />}
        {status === 'ok' && <Check className="text-success" />}
        {status === 'error' && <AlertCircle className="text-destructive" />}
        {status === 'testing' ? 'Testing…' : status === 'ok' ? 'Valid' : status === 'error' ? 'Failed' : 'Test key'}
      </Button>
    </div>
  );

  const rangeRow = (
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    display: string,
    label: string,
  ) => (
    <div className="flex items-center gap-4">
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label} className="flex-1" />
      <span className="w-12 text-right font-mono text-ui">{display}</span>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && toggleSettings()}>
      <DialogContent showCloseButton={false} className="flex h-[85vh] max-h-[720px] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogDescription className="sr-only">Application settings</DialogDescription>
        {/* Left nav */}
        <nav aria-label="Settings sections" className="flex w-56 shrink-0 flex-col gap-0.5 border-r bg-sidebar px-2.5 py-4">
          <DialogTitle className="px-2 pb-3 text-base font-semibold">Settings</DialogTitle>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-ui whitespace-nowrap text-subtle-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground [&_svg]:text-muted-foreground',
                activeTab === tab.id && 'bg-sidebar-accent font-medium text-foreground [&_svg]:text-primary',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <span className="mt-auto px-2 font-mono text-2xs text-muted-foreground">Combobulator v{version}</span>
        </nav>

        {/* Content area */}
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b pr-4 pl-7">
            <h2 className="text-base font-semibold">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <Button variant="ghost" size="icon-sm" onClick={toggleSettings} aria-label="Close settings" className="text-muted-foreground">
              <X />
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-7 py-6">
            {/* ── Appearance ── */}
            {activeTab === 'appearance' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Theme</span>
                  <span className="text-ui text-muted-foreground">
                    Light and dark use the same components — only the color tokens change. You can also switch with the icon in the sidebar footer.
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                  {(
                    [
                      { id: 'light', label: 'Light', bg: '#ffffff', side: '#fafafa', line: '#e4e4e7', text: '#18181b', muted: '#d4d4d8', accent: '#4f46e5' },
                      { id: 'dark', label: 'Dark', bg: '#0a0a0b', side: '#111113', line: '#27272a', text: '#fafafa', muted: '#3f3f46', accent: '#818cf8' },
                    ] as const
                  ).map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateSettings({ theme: t.id })}
                        className={cn(
                          'flex flex-col gap-2.5 rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-border-strong',
                          active && 'border-primary ring-2 ring-primary/30 hover:border-primary',
                        )}
                      >
                        <span aria-hidden="true" className="flex h-24 overflow-hidden rounded-lg border" style={{ backgroundColor: t.bg, borderColor: t.line }}>
                          <span className="w-[30%] border-r" style={{ backgroundColor: t.side, borderColor: t.line }} />
                          <span className="flex flex-1 flex-col gap-1.5 p-3">
                            <span className="h-2 w-[70%] rounded-sm" style={{ backgroundColor: t.text }} />
                            <span className="h-1.5 w-[90%] rounded-sm" style={{ backgroundColor: t.muted }} />
                            <span className="h-1.5 w-[60%] rounded-sm" style={{ backgroundColor: t.muted }} />
                            <span className="mt-auto h-3 w-9 rounded-sm" style={{ backgroundColor: t.accent }} />
                          </span>
                        </span>
                        <span className="flex items-center justify-between text-ui font-medium">
                          {t.label}
                          {active && <Check className="size-4 text-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── AI & Summarization ── */}
            {activeTab === 'ai' && (
              <>
                <SectionHeading aside="Transcription">Groq API</SectionHeading>
                <div className="flex flex-col gap-1.5 rounded-lg border bg-sidebar p-3.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">How to get a free Groq key</p>
                  <ol className="list-inside list-decimal space-y-1 leading-relaxed">
                    <li>
                      Go to{' '}
                      <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        console.groq.com/keys
                      </a>
                    </li>
                    <li>Sign up or log in (free)</li>
                    <li>
                      Click <strong className="text-foreground">Create API Key</strong>, copy it
                    </li>
                    <li>
                      Paste it below — starts with <code className="font-mono">gsk_</code>
                    </li>
                  </ol>
                  <p className="text-2xs">Free tier: ~8 hrs of transcription/day.</p>
                </div>
                <SettingRow
                  label="Groq API key"
                  htmlFor="groq-key"
                  hint="Used for system audio transcription via Groq Whisper. Stored locally — never sent anywhere except Groq."
                >
                  {keyInput('groq-key', groqKeyDraft, setGroqKeyDraft, saveGroqKey, showGroqKey, setShowGroqKey, 'gsk_…', groqTestStatus, handleTestGroqKey)}
                  <KeyStatus status={groqTestStatus} error={groqTestError} saved={!!settings.groqApiKey} savedLabel="Groq key saved" />
                </SettingRow>

                <Divider />
                <SectionHeading aside="Summarization">OpenAI API</SectionHeading>
                <SettingRow
                  label="OpenAI API key"
                  htmlFor="openai-key"
                  hint="Used for generating meeting summaries. Stored locally — never sent anywhere except OpenAI."
                >
                  {keyInput('openai-key', apiKeyDraft, setApiKeyDraft, saveApiKey, showApiKey, setShowApiKey, 'sk-…', testStatus, handleTestApiKey)}
                  <KeyStatus status={testStatus} error={testError} saved={!!settings.openaiApiKey} savedLabel="API key saved" />
                </SettingRow>

                <Divider />
                <SectionHeading>Summarization</SectionHeading>
                <SettingRow label="GPT model" htmlFor="gpt-model" hint="gpt-4o-mini is recommended — fast and cheap. Use gpt-4o for higher-quality summaries.">
                  <Select value={settings.gptModel} onValueChange={(v) => updateSettings({ gptModel: v })}>
                    <SelectTrigger id="gpt-model" className="w-full max-w-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GPT_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <CostEstimatePanel activeModel={settings.gptModel} />

                <SettingRow
                  label="Temperature"
                  hint="Controls how the AI writes the summary. Lower = sticks closely to what was said. Higher = more varied phrasing. For meeting notes, keep this low."
                >
                  <div className="flex max-w-md flex-col gap-2">
                    {rangeRow(
                      settings.temperature,
                      0,
                      1,
                      0.05,
                      (v) => updateSettings({ temperature: Math.max(0, Math.min(1, v)) }),
                      settings.temperature.toFixed(2).replace(/\.?0+$/, '') || '0',
                      'Temperature',
                    )}
                    <div className="flex justify-between text-2xs text-muted-foreground">
                      <span>0 — always the same</span>
                      <span>1 — more varied</span>
                    </div>
                    <span
                      className={cn(
                        'inline-flex h-5 items-center self-start rounded-full px-2 text-2xs font-medium',
                        settings.temperature <= 0.3
                          ? 'bg-success-soft text-success'
                          : settings.temperature <= 0.6
                            ? 'bg-warning-soft text-warning'
                            : 'bg-recording-soft text-recording',
                      )}
                    >
                      {settings.temperature <= 0.3 ? 'Good for meeting notes' : settings.temperature <= 0.6 ? 'Balanced' : 'More creative — summaries may vary'}
                    </span>
                  </div>
                </SettingRow>

                <SettingRow
                  label="Custom summary instructions"
                  htmlFor="custom-instructions"
                  hint='Appended to the system prompt. E.g. "Always respond in French" or "Focus on pricing and delivery risks".'
                >
                  <Textarea
                    id="custom-instructions"
                    value={settings.customSummaryInstructions}
                    onChange={(e) => updateSettings({ customSummaryInstructions: e.target.value })}
                    placeholder="Optional extra instructions for the AI…"
                    rows={3}
                  />
                </SettingRow>
              </>
            )}

            {/* ── Recording ── */}
            {activeTab === 'recording' && (
              <>
                <SectionHeading>Audio</SectionHeading>
                <SettingRow label="Default audio source" hint="The mode pre-selected when opening the recording screen.">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={settings.defaultAudioMode}
                    onValueChange={(v) => v && updateSettings({ defaultAudioMode: v as 'mic' | 'system' })}
                    className="self-start"
                    aria-label="Default audio source"
                  >
                    <ToggleGroupItem value="mic" className="px-4">
                      <Mic /> Mic only
                    </ToggleGroupItem>
                    <ToggleGroupItem value="system" className="px-4">
                      <Mic /> All audio (system)
                    </ToggleGroupItem>
                  </ToggleGroup>
                </SettingRow>

                <Divider />
                <SectionHeading>Transcription</SectionHeading>
                <SettingRow label="Chunk interval" hint="How often audio is sent for transcription. Shorter = more real-time but more API calls.">
                  <div className="flex max-w-md flex-col gap-1.5">
                    {rangeRow(
                      settings.chunkIntervalSeconds,
                      15,
                      120,
                      15,
                      (v) => updateSettings({ chunkIntervalSeconds: v }),
                      `${settings.chunkIntervalSeconds}s`,
                      'Chunk interval in seconds',
                    )}
                    <div className="flex justify-between text-2xs text-muted-foreground">
                      <span>15s (real-time)</span>
                      <span>120s (fewer calls)</span>
                    </div>
                  </div>
                </SettingRow>
                <SettingRow label="Auto-stop after" hint="Recording automatically stops after this duration as a safety net.">
                  <div className="max-w-md">
                    {rangeRow(
                      settings.autoStopHours,
                      1,
                      8,
                      1,
                      (v) => updateSettings({ autoStopHours: v }),
                      `${settings.autoStopHours}h`,
                      'Auto-stop after hours',
                    )}
                  </div>
                </SettingRow>
              </>
            )}

            {/* ── Teams ── */}
            {activeTab === 'teams' && (
              <>
                <div className="flex items-start gap-4 rounded-lg border p-4">
                  <Label htmlFor="teams-enabled" className="flex flex-1 flex-col items-start gap-1">
                    <span className="text-sm font-medium">Teams meeting detection</span>
                    <span className="text-ui leading-relaxed font-normal text-muted-foreground">
                      When enabled, the app detects when you join a Teams meeting and shows a prompt to start recording.
                    </span>
                  </Label>
                  <Switch id="teams-enabled" checked={settings.teamsEnabled} onCheckedChange={(v) => updateSettings({ teamsEnabled: v })} />
                </div>
                <div role="note" className="flex gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-ui text-warning">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>Changes to Teams integration take effect after restarting the app.</span>
                </div>
                <Divider />
                <div className="flex flex-col gap-3">
                  <SectionHeading>How to set up Teams integration</SectionHeading>
                  {[
                    'Open Microsoft Teams → Settings → Privacy',
                    <>
                      Enable <strong>Third-party app API</strong>
                    </>,
                    'Restart this app — it will pair automatically when you join a meeting',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3 text-ui">
                      <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-2xs font-semibold text-subtle-foreground">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Version history (GitHub releases, read-only) ── */}
            {activeTab === 'releases' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-ui text-muted-foreground">Fetched from GitHub. Only published releases are shown.</p>
                  <Button variant="outline" size="sm" onClick={fetchGithubReleases} disabled={githubReleasesLoading}>
                    <RefreshCw className={githubReleasesLoading ? 'animate-spin' : undefined} />
                    {githubReleasesLoading ? 'Loading…' : 'Refresh'}
                  </Button>
                </div>

                {githubReleasesError && (
                  <div className="rounded-lg bg-recording-soft px-3.5 py-3 text-ui text-recording">{githubReleasesError}</div>
                )}
                {!githubReleasesError && githubReleasesLoading && githubReleases.length === 0 && (
                  <p className="text-ui text-muted-foreground">Loading releases…</p>
                )}
                {!githubReleasesError && !githubReleasesLoading && githubReleases.length === 0 && (
                  <p className="text-ui text-muted-foreground">No releases found.</p>
                )}
                {!githubReleasesError && githubReleases.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {githubReleases.map((r) => (
                      <div key={r.tag_name} className="flex flex-col gap-1.5 rounded-lg border px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ui font-semibold">{r.tag_name}</span>
                          {r.tag_name.replace(/^v/, '') === version && (
                            <span className="inline-flex h-5 items-center rounded-full bg-success-soft px-2 text-2xs font-medium text-success">Installed</span>
                          )}
                        </div>
                        {r.published_at && <p className="text-2xs text-muted-foreground">{new Date(r.published_at).toLocaleString()}</p>}
                        {r.body ? (
                          <p className="text-ui leading-relaxed whitespace-pre-wrap text-subtle-foreground">{r.body}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No release notes.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Data & Storage ── */}
            {activeTab === 'data' && (
              <>
                <div className="flex flex-col gap-3">
                  <SectionHeading>Backup &amp; restore</SectionHeading>
                  <p className="text-ui text-muted-foreground">
                    Exports all projects, suppliers, notes, tasks, decisions, and follow-ups as a JSON file. Settings (including your API keys) are not included.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleExport}>
                      <Download /> Export backup
                    </Button>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload /> Import backup
                    </Button>
                    <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
                  </div>
                </div>

                <Divider />
                <div className="flex flex-col gap-3">
                  <SectionHeading>Storage</SectionHeading>
                  {currentDataDir && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Current data folder</span>
                      <code className="block rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-subtle-foreground">{currentDataDir}</code>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                      <FolderOpen /> Open folder
                    </Button>
                    {(window as any).electronStore?.changeDataDir && (
                      <Button variant="outline" size="sm" onClick={handleChangeDataDir} disabled={dataDirChanging}>
                        <FolderOpen /> {dataDirChanging ? 'Changing…' : 'Change folder…'}
                      </Button>
                    )}
                    {isCustomDataDir && (window as any).electronStore?.resetDataDir && (
                      <Button variant="ghost" size="sm" onClick={handleResetDataDir} disabled={dataDirChanging} className="text-muted-foreground">
                        Reset to default folder
                      </Button>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Changing the folder copies your existing data to the new location and restarts the app. Point both computers to the same shared drive to access your data from anywhere.
                  </p>
                </div>

                {(window as any).electronUpdater && (
                  <>
                    <Divider />
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
                      <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium">Application</span>
                        <span className="flex items-center gap-1.5 text-ui text-muted-foreground">
                          <span className="font-mono">v{version}</span>
                          {updateCheckStatus === 'checking' && <span>· Checking…</span>}
                          {updateCheckStatus === 'up-to-date' && <span className="text-success">· You’re up to date</span>}
                          {updateCheckStatus === 'available' && <span className="text-primary">· Update available — downloading…</span>}
                          {updateCheckStatus === 'error' && <span className="text-destructive">· Could not check for updates</span>}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleCheckForUpdates} disabled={updateCheckStatus === 'checking'}>
                        <RefreshCw className={updateCheckStatus === 'checking' ? 'animate-spin' : undefined} />
                        Check for updates
                      </Button>
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-recording-soft p-4">
                  <div className="flex items-center gap-2">
                    <Trash2 className="size-4 text-destructive" />
                    <p className="text-sm font-semibold text-destructive">Danger zone</p>
                  </div>
                  <p className="text-ui leading-relaxed text-subtle-foreground">
                    Permanently deletes all projects, suppliers, notes, tasks, decisions, and follow-ups. <strong>This cannot be undone.</strong> Export a backup first.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={clearConfirm}
                      aria-label="Type DELETE to confirm"
                      onChange={(e) => setClearConfirm(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="max-w-60 bg-background"
                    />
                    <Button variant="destructive" onClick={handleClearData} disabled={clearConfirm !== 'DELETE'}>
                      Clear all data
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
