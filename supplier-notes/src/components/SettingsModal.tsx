import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
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
  Moon,
  Sun,
  RefreshCw,
  History,
} from 'lucide-react';
import { useStore } from '../store/store';
import { version } from '../../package.json';
import { exportAllData } from '../utils/export';
import { CustomSelect } from './ui/CustomSelect';
import type { LocalWhisperModelSize, TranscriptionProviderId } from '../services/transcription';
import { LOCAL_SUMMARY_MODELS } from '../services/summary';
import type { LocalSummaryModelId, SummaryProviderId } from '../services/summary';

type SettingsTab = 'appearance' | 'ai' | 'recording' | 'teams' | 'releases' | 'data';
type StorageHealth = 'ok' | 'missing' | 'unreachable' | 'error' | 'unknown';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
  { id: 'ai', label: 'AI & Summarization', icon: <Bot className="w-4 h-4" /> },
  { id: 'recording', label: 'Recording', icon: <Mic className="w-4 h-4" /> },
  { id: 'teams', label: 'Teams', icon: <Video className="w-4 h-4" /> },
  { id: 'releases', label: 'Version history', icon: <History className="w-4 h-4" /> },
  { id: 'data', label: 'Data & Storage', icon: <Database className="w-4 h-4" /> },
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

const LOCAL_WHISPER_MODELS: Array<{ value: LocalWhisperModelSize; label: string; hint: string }> = [
  { value: 'tiny', label: 'Tiny', hint: 'Fastest, lowest accuracy' },
  { value: 'base', label: 'Base', hint: 'Recommended first local model' },
  { value: 'small', label: 'Small', hint: 'Better accuracy, slower' },
  { value: 'medium', label: 'Medium', hint: 'Best local accuracy, needs more RAM' },
];

const LOCAL_SUMMARY_MODEL_OPTIONS: Array<{ value: LocalSummaryModelId; label: string }> = [
  ...Object.values(LOCAL_SUMMARY_MODELS).map((model) => ({
    value: model.id,
    label: `${model.label} (${model.sizeLabel})`,
  })),
];

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
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Estimated cost — 1 hour meeting
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2">
        <span>Model</span>
        <span className="text-right">Transcription</span>
        <span className="text-right">Summary</span>
        <span className="text-right">Total</span>
      </div>

      {/* Per-model rows */}
      <div className="space-y-0.5">
        {GPT_MODELS.map((m) => {
          const { gptCost, total } = estimateMeetingCost(m.value, minutes);
          const isActive = m.value === activeModel;
          const summaryLabel = gptCost < 0.01 ? '<$0.01' : `$${gptCost.toFixed(2)}`;
          return (
            <div
              key={m.value}
              className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center text-xs rounded px-2 py-1.5 -mx-2 transition-colors ${
                isActive ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span className={`truncate ${isActive ? 'font-medium' : ''}`}>{m.label}</span>
              <span className={`font-mono text-right ${isActive ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                ${whisperCost.toFixed(2)}
              </span>
              <span className={`font-mono text-right ${isActive ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                {summaryLabel}
              </span>
              <span className={`font-mono text-right font-semibold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                ${total.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed pt-0.5">
        Transcription cost is the same regardless of model. Mic mode uses browser speech recognition — no transcription charge. Transcription via Groq Whisper Large V3 Turbo ($0.04/hr). Summary prices from openai.com/api/pricing, ~100 wpm assumed.
      </p>
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">{children}</h3>;
}

function Divider() {
  return <div className="border-t border-gray-100 dark:border-gray-800" />;
}

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const getExportData = useStore((s) => s.getExportData);
  const importData = useStore((s) => s.importData);

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
  const [storageHealth, setStorageHealth] = useState<StorageHealth>('unknown');
  const [storageMessage, setStorageMessage] = useState('');
  const [dataDirChanging, setDataDirChanging] = useState(false);
  const [githubReleases, setGithubReleases] = useState<Array<{ tag_name: string; body: string | null; published_at: string | null }>>([]);
  const [githubReleasesLoading, setGithubReleasesLoading] = useState(false);
  const [githubReleasesError, setGithubReleasesError] = useState<string | null>(null);
  const [localModelStatus, setLocalModelStatus] = useState<any>(null);
  const [localModelLoading, setLocalModelLoading] = useState(false);
  const [localModelError, setLocalModelError] = useState('');
  const [localSummaryStatus, setLocalSummaryStatus] = useState<any>(null);
  const [localSummaryLoading, setLocalSummaryLoading] = useState(false);
  const [localSummaryDeleting, setLocalSummaryDeleting] = useState(false);
  const [localSummaryError, setLocalSummaryError] = useState('');

  // Sync drafts when settings change from outside (e.g. migration)
  useEffect(() => {
    setApiKeyDraft(settings.openaiApiKey);
  }, [settings.openaiApiKey]);

  useEffect(() => {
    setGroqKeyDraft(settings.groqApiKey ?? '');
  }, [settings.groqApiKey]);

  const refreshStorageInfo = () => {
    const electronStore = (window as any).electronStore;
    if (electronStore?.getDataDir) {
      electronStore.getDataDir().then((result: { dir: string; isCustom: boolean; status?: StorageHealth; message?: string }) => {
        setCurrentDataDir(result?.dir || '');
        setIsCustomDataDir(result?.isCustom ?? false);
        setStorageHealth(result?.status ?? 'unknown');
        setStorageMessage(result?.message ?? '');
      }).catch(() => {
        setStorageHealth('error');
        setStorageMessage('Could not check the current data folder.');
      });
    }
  };

  // Load current data directory path
  useEffect(() => {
    refreshStorageInfo();
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

  const refreshLocalModelStatus = useCallback(() => {
    const localApi = (window as any).electronTranscription;
    if (!localApi?.getStatus) {
      setLocalModelStatus({ electronAvailable: false });
      return;
    }
    localApi.getStatus(settings.localTranscriptionModel)
      .then((status: any) => setLocalModelStatus({ electronAvailable: true, ...status }))
      .catch((e: any) => setLocalModelError(e?.message ?? 'Could not check local transcription status.'));
  }, [settings.localTranscriptionModel]);

  useEffect(() => {
    if (activeTab === 'recording') refreshLocalModelStatus();
  }, [activeTab, refreshLocalModelStatus]);

  const handleDownloadLocalModel = async () => {
    const localApi = (window as any).electronTranscription;
    if (!localApi?.downloadModel) return;
    setLocalModelLoading(true);
    setLocalModelError('');
    try {
      const result = await localApi.downloadModel(settings.localTranscriptionModel);
      if (!result?.ok) {
        setLocalModelError(result?.error || 'Model download failed.');
      }
      refreshLocalModelStatus();
    } catch (e: any) {
      setLocalModelError(e?.message ?? 'Model download failed.');
    } finally {
      setLocalModelLoading(false);
    }
  };

  const refreshLocalSummaryStatus = useCallback(() => {
    const localApi = (window as any).electronSummary;
    if (!localApi?.getStatus) {
      setLocalSummaryStatus({ electronAvailable: false });
      return;
    }
    localApi.getStatus(settings.localSummaryModel)
      .then((status: any) => setLocalSummaryStatus({ electronAvailable: true, ...status }))
      .catch((e: any) => setLocalSummaryError(e?.message ?? 'Could not check local summary status.'));
  }, [settings.localSummaryModel]);

  useEffect(() => {
    if (activeTab === 'ai') refreshLocalSummaryStatus();
  }, [activeTab, refreshLocalSummaryStatus]);

  const handleDownloadLocalSummaryModel = async () => {
    const localApi = (window as any).electronSummary;
    if (!localApi?.downloadModel) return;
    setLocalSummaryLoading(true);
    setLocalSummaryError('');
    try {
      const result = await localApi.downloadModel(settings.localSummaryModel);
      if (!result?.ok) {
        setLocalSummaryError(result?.error || 'Local summary model install failed.');
      }
      refreshLocalSummaryStatus();
    } catch (e: any) {
      setLocalSummaryError(e?.message ?? 'Local summary model install failed.');
    } finally {
      setLocalSummaryLoading(false);
    }
  };

  const handleDeleteLocalSummaryModel = async () => {
    const localApi = (window as any).electronSummary;
    if (!localApi?.deleteModel) return;
    const modelLabel = LOCAL_SUMMARY_MODELS[settings.localSummaryModel].label;
    const ok = confirm(`Uninstall ${modelLabel}? This deletes the local model file. You can install it again later.`);
    if (!ok) return;
    setLocalSummaryDeleting(true);
    setLocalSummaryError('');
    try {
      const result = await localApi.deleteModel(settings.localSummaryModel);
      if (!result?.ok) {
        setLocalSummaryError(result?.error || 'Local summary model uninstall failed.');
      }
      refreshLocalSummaryStatus();
    } catch (e: any) {
      setLocalSummaryError(e?.message ?? 'Local summary model uninstall failed.');
    } finally {
      setLocalSummaryDeleting(false);
    }
  };

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
        alert('Data imported successfully!');
      } catch {
        alert('Invalid backup file. Please select a valid supplier-notes backup JSON.');
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

  const handleResetDataDir = async () => {
    const electronStore = (window as any).electronStore;
    if (!electronStore?.resetDataDir) return;
    if (!confirm('Reset data folder to the default location? The app will restart.')) return;
    setDataDirChanging(true);
    try {
      await electronStore.resetDataDir();
    } finally {
      setDataDirChanging(false);
    }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') toggleSettings();
  };

  const storageIsProtected = storageHealth === 'unreachable' || storageHealth === 'error';
  const storageStatusLabel =
    storageHealth === 'ok'
      ? 'Connected'
      : storageHealth === 'missing'
        ? 'Empty folder'
        : storageHealth === 'unreachable'
          ? 'Unavailable'
          : storageHealth === 'error'
            ? 'Blocked'
            : 'Checking';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={toggleSettings} />

      {/* Modal panel */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex w-[740px] h-[85vh] overflow-hidden">

        {/* Left nav */}
        <div className="w-48 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col py-5 flex-shrink-0">
          <div className="px-5 pb-4">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Settings</span>
          </div>
          <nav className="flex flex-col gap-0.5 px-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-5 pt-4">
            <span className="text-xs text-gray-400 dark:text-gray-500">v{version}</span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            <button
              onClick={toggleSettings}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* ── Appearance tab ──────────────────────────────────── */}
            {activeTab === 'appearance' && (
              <>
                <SectionHeading>Theme</SectionHeading>

                <div className="space-y-2 py-1">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Color theme</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                    Choose your preferred color scheme. You can also cycle through themes with the icon in the sidebar footer.
                  </p>
                  <div className="flex gap-2 pt-1">
                    {([
                      { id: 'light',      label: 'Light',      icon: <Sun className="w-4 h-4" /> },
                      { id: 'dark',       label: 'Dark',       icon: <Moon className="w-4 h-4" /> },
                      { id: 'ladysucker', label: 'Ladysucker', icon: <img src={import.meta.env.BASE_URL + 'icon.png'} alt="" className="w-4 h-4 object-contain" /> },
                    ] as const).map(({ id, label, icon }) => {
                      const active = settings.theme === id;
                      return (
                        <button
                          key={id}
                          onClick={() => updateSettings({ theme: id })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                            active
                              ? 'border-gray-700 dark:border-gray-300 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                        >
                          {icon}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── AI tab ─────────────────────────────────────────── */}
            {activeTab === 'ai' && (
              <>
                <SectionHeading>Groq API (Transcription)</SectionHeading>

                <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">How to get a free Groq key</p>
                  <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Go to <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">console.groq.com/keys</a></li>
                    <li>Sign up or log in (free)</li>
                    <li>Click <strong className="text-gray-600 dark:text-gray-300">Create API Key</strong>, copy it</li>
                    <li>Paste it below — starts with <code className="font-mono">gsk_</code></li>
                  </ol>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Free tier: ~8 hrs of transcription/day.</p>
                </div>

                <SettingRow
                  label="Groq API Key"
                  hint="Used for system audio transcription via Groq Whisper. Stored locally — never sent anywhere except Groq."
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showGroqKey ? 'text' : 'password'}
                        value={groqKeyDraft}
                        onChange={(e) => setGroqKeyDraft(e.target.value)}
                        onBlur={saveGroqKey}
                        placeholder="gsk_…"
                        className="w-full pr-9 pl-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGroqKey((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showGroqKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={handleTestGroqKey}
                      disabled={!groqKeyDraft.trim() || groqTestStatus === 'testing'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      {groqTestStatus === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {groqTestStatus === 'ok' && <Check className="w-3.5 h-3.5 text-green-500" />}
                      {groqTestStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                      {groqTestStatus === 'idle' && null}
                      {groqTestStatus === 'testing' ? 'Testing…' : groqTestStatus === 'ok' ? 'Valid!' : groqTestStatus === 'error' ? 'Failed' : 'Test key'}
                    </button>
                  </div>
                  {groqTestStatus === 'error' && groqTestError && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{groqTestError}</p>
                  )}
                  {settings.groqApiKey && groqTestStatus !== 'ok' && (
                    <p className="text-xs text-green-600 dark:text-green-400">✓ Groq key saved</p>
                  )}
                </SettingRow>

                <Divider />
                <SectionHeading>OpenAI API (Summarization)</SectionHeading>

                <SettingRow
                  label="OpenAI API Key"
                  hint="Used for generating meeting summaries. Stored locally — never sent anywhere except OpenAI."
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKeyDraft}
                        onChange={(e) => setApiKeyDraft(e.target.value)}
                        onBlur={saveApiKey}
                        placeholder="sk-…"
                        className="w-full pr-9 pl-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={handleTestApiKey}
                      disabled={!apiKeyDraft.trim() || testStatus === 'testing'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      {testStatus === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {testStatus === 'ok' && <Check className="w-3.5 h-3.5 text-green-500" />}
                      {testStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                      {testStatus === 'idle' && null}
                      {testStatus === 'testing' ? 'Testing…' : testStatus === 'ok' ? 'Valid!' : testStatus === 'error' ? 'Failed' : 'Test key'}
                    </button>
                  </div>
                  {testStatus === 'error' && testError && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{testError}</p>
                  )}
                  {settings.openaiApiKey && testStatus !== 'ok' && (
                    <p className="text-xs text-green-600 dark:text-green-400">✓ API key saved</p>
                  )}
                </SettingRow>

                <Divider />
                <SectionHeading>Summarization</SectionHeading>

                <SettingRow
                  label="Summary mode"
                  hint="Cloud sends transcripts to OpenAI. Local keeps transcript text on this device and uses the installed local model."
                >
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'openai', title: 'Cloud', description: 'OpenAI summary - fast, sends transcript externally' },
                      { id: 'local', title: 'Local/Offline', description: 'Private, slower, requires local model install' },
                    ] as Array<{ id: SummaryProviderId; title: string; description: string }>).map((option) => {
                      const active = settings.summaryProvider === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => updateSettings({ summaryProvider: option.id })}
                          className={`text-left rounded-lg border p-3 transition-colors ${
                            active
                              ? 'border-gray-700 dark:border-gray-300 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                              active ? 'border-gray-700 dark:border-gray-200 bg-gray-800 dark:bg-gray-200' : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {active && <Check className="w-2.5 h-2.5 text-white dark:text-gray-900" />}
                            </span>
                            {option.title}
                          </span>
                          <span className="block text-xs mt-1.5 leading-relaxed text-gray-400 dark:text-gray-500">
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SettingRow>

                {settings.summaryProvider === 'local' && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-3">
                    <SettingRow label="Local summary model" hint="Models stay in your local app data folder after install. The main app installer stays smaller.">
                      <CustomSelect
                        value={settings.localSummaryModel}
                        onChange={(value) => updateSettings({ localSummaryModel: value as LocalSummaryModelId })}
                        options={LOCAL_SUMMARY_MODEL_OPTIONS}
                        className="w-full px-3 py-1.5 text-sm dark:text-gray-100"
                      />
                    </SettingRow>

                    <SettingRow
                      label="Load Local AI on app start"
                      hint="Starts a background llama.cpp server and keeps the selected local model in memory for faster questions. Uses RAM while the app is open."
                    >
                      <button
                        onClick={() => updateSettings({ localAiLoadOnStartup: !settings.localAiLoadOnStartup })}
                        role="switch"
                        aria-checked={settings.localAiLoadOnStartup}
                        className={`self-start flex items-center gap-2 px-2 py-1.5 text-sm rounded-full border transition-colors ${
                          settings.localAiLoadOnStartup
                            ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <span className={`relative w-8 h-4 rounded-full transition-colors ${
                          settings.localAiLoadOnStartup ? 'bg-green-600 dark:bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                            settings.localAiLoadOnStartup ? 'translate-x-4' : 'translate-x-0.5'
                          }`} />
                        </span>
                        <span className="font-medium">
                          {settings.localAiLoadOnStartup ? 'On' : 'Off'}
                        </span>
                      </button>
                    </SettingRow>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Local summary engine
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          {localSummaryStatus?.electronAvailable === false
                            ? 'Only available in the Electron app.'
                            : localSummaryStatus?.binaryAvailable
                              ? 'Bundled llama.cpp runtime is ready.'
                              : localSummaryStatus?.bundledRuntimeAvailable
                                ? 'Runtime is bundled and will be unpacked on first use.'
                                : 'Local summary runtime is missing from this install.'}
                        </p>
                        {(localSummaryStatus?.binaryPath || localSummaryStatus?.binDir) && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono break-all mt-1">
                            {localSummaryStatus?.binaryPath || localSummaryStatus?.binDir}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                        localSummaryStatus?.binaryAvailable || localSummaryStatus?.bundledRuntimeAvailable
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {localSummaryStatus?.binaryAvailable || localSummaryStatus?.bundledRuntimeAvailable ? 'Ready' : 'Runtime missing'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {localSummaryStatus?.modelLabel || LOCAL_SUMMARY_MODELS[settings.localSummaryModel].label}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {localSummaryStatus?.modelAvailable
                            ? `Installed${localSummaryStatus.modelSizeBytes ? ` - ${(localSummaryStatus.modelSizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB` : ''}`
                            : `Missing locally - ${LOCAL_SUMMARY_MODELS[settings.localSummaryModel].sizeLabel} download`}
                        </p>
                        {localSummaryStatus?.lowMemory && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            This machine has limited RAM for this model. Close other apps before summarizing.
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={refreshLocalSummaryStatus}
                          className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-white dark:hover:bg-gray-700 dark:text-gray-300 transition-colors"
                        >
                          Refresh
                        </button>
                        <button
                          onClick={handleDownloadLocalSummaryModel}
                          disabled={localSummaryLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                        >
                          {localSummaryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {localSummaryLoading ? 'Installing...' : localSummaryStatus?.modelAvailable ? 'Re-install model' : 'Install local summary model'}
                        </button>
                        {localSummaryStatus?.modelAvailable && (
                          <button
                            onClick={handleDeleteLocalSummaryModel}
                            disabled={localSummaryDeleting || localSummaryLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                          >
                            {localSummaryDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            {localSummaryDeleting ? 'Uninstalling...' : 'Uninstall model'}
                          </button>
                        )}
                      </div>
                    </div>

                    {localSummaryError && (
                      <p className="text-xs text-red-500 dark:text-red-400">{localSummaryError}</p>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      Installing downloads the model file only. Meeting transcripts are never sent with that request, and once installed, local summaries work offline.
                    </p>
                  </div>
                )}

                <SettingRow label="GPT Model" hint="gpt-4o-mini is recommended — fast and cheap. Use gpt-4o for higher-quality summaries.">
                  <CustomSelect
                    value={settings.gptModel}
                    onChange={(v) => updateSettings({ gptModel: v })}
                    className="w-full px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
                    options={GPT_MODELS}
                  />
                </SettingRow>

                <CostEstimatePanel activeModel={settings.gptModel} />

                <div className="grid grid-cols-2 gap-4">
                  <SettingRow
                    label="Temperature"
                    hint="Controls how the AI writes the summary. Lower = sticks closely to what was said. Higher = more varied phrasing. For meeting notes, keep this low."
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={settings.temperature}
                          onChange={(e) => updateSettings({ temperature: Math.max(0, Math.min(1, Number(e.target.value))) })}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-300 w-8 text-right">
                          {settings.temperature.toFixed(2).replace(/\.?0+$/, '') || '0'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                        <span>0 — always the same</span>
                        <span>1 — more varied</span>
                      </div>
                      <span
                        className={`self-start text-xs font-medium px-2 py-0.5 rounded-full ${
                          settings.temperature <= 0.3
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : settings.temperature <= 0.6
                            ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                            : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        }`}
                      >
                        {settings.temperature <= 0.3
                          ? '✓ Good for meeting notes'
                          : settings.temperature <= 0.6
                          ? 'Balanced'
                          : 'More creative — summaries may vary'}
                      </span>
                    </div>
                  </SettingRow>
                </div>

                <SettingRow
                  label="Custom summary instructions"
                  hint='Appended to the system prompt. E.g. "Always respond in French" or "Focus on pricing and delivery risks".'
                >
                  <textarea
                    value={settings.customSummaryInstructions}
                    onChange={(e) => updateSettings({ customSummaryInstructions: e.target.value })}
                    placeholder="Optional extra instructions for the AI…"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </SettingRow>
              </>
            )}

            {/* ── Recording tab ───────────────────────────────────── */}
            {activeTab === 'recording' && (
              <>
                <SectionHeading>Audio</SectionHeading>

                <SettingRow label="Default audio source" hint="The mode pre-selected when opening the recording screen.">
                  <div className="flex gap-2">
                    {(['mic', 'system'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => updateSettings({ defaultAudioMode: m })}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-lg border transition-colors ${
                          settings.defaultAudioMode === m
                            ? 'bg-gray-100 dark:bg-white/10 border-gray-400 dark:border-white/30 text-gray-900 dark:text-white font-medium'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        {m === 'mic' ? 'Mic only' : 'All audio (system)'}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <Divider />
                <SectionHeading>Transcription</SectionHeading>

                <SettingRow
                  label="Transcription mode"
                  hint="Cloud is fastest and sends audio to Groq. Local keeps audio on this device and runs through whisper.cpp."
                >
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      {
                        id: 'groq',
                        title: 'Cloud',
                        description: 'Groq Whisper - fastest, sends audio externally',
                      },
                      {
                        id: 'local',
                        title: 'Local/Offline',
                        description: 'Private, slower, requires local model',
                      },
                    ] as Array<{ id: TranscriptionProviderId; title: string; description: string }>).map((option) => {
                      const active = settings.transcriptionProvider === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => updateSettings({ transcriptionProvider: option.id })}
                          className={`text-left rounded-lg border p-3 transition-colors ${
                            active
                              ? 'border-gray-700 dark:border-gray-300 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                              active ? 'border-gray-700 dark:border-gray-200 bg-gray-800 dark:bg-gray-200' : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {active && <Check className="w-2.5 h-2.5 text-white dark:text-gray-900" />}
                            </span>
                            {option.title}
                          </span>
                          <span className="block text-xs mt-1.5 leading-relaxed text-gray-400 dark:text-gray-500">
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SettingRow>

                {settings.transcriptionProvider === 'local' && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-3">
                    <SettingRow label="Local model" hint="Base is a good starting point. Larger models need more memory and take longer.">
                      <CustomSelect
                        value={settings.localTranscriptionModel}
                        onChange={(value) => updateSettings({ localTranscriptionModel: value as LocalWhisperModelSize })}
                        options={LOCAL_WHISPER_MODELS.map((m) => ({ value: m.value, label: `${m.label} - ${m.hint}` }))}
                        className="w-full px-3 py-1.5 text-sm dark:text-gray-100"
                      />
                    </SettingRow>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Local engine
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          {localModelStatus?.electronAvailable === false
                            ? 'Only available in the Electron app.'
                            : localModelStatus?.binaryAvailable
                              ? localModelStatus?.binaryBundled
                                ? 'Bundled whisper.cpp runtime is ready.'
                                : 'whisper.cpp runtime found in your local data folder.'
                              : 'Local runtime is missing from this install.'}
                        </p>
                        {(localModelStatus?.binaryAvailable ? localModelStatus?.binaryPath : localModelStatus?.bundledBinDir || localModelStatus?.binDir) && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono break-all mt-1">
                            {localModelStatus?.binaryAvailable ? localModelStatus.binaryPath : localModelStatus?.bundledBinDir || localModelStatus.binDir}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                        localModelStatus?.binaryAvailable
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {localModelStatus?.binaryAvailable ? 'Ready' : 'Runtime missing'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {settings.localTranscriptionModel} model
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {localModelStatus?.modelAvailable
                            ? `${localModelStatus.modelBundled ? 'Bundled' : 'Downloaded'}${localModelStatus.modelSizeBytes ? ` - ${(localModelStatus.modelSizeBytes / 1024 / 1024).toFixed(0)} MB` : ''}`
                            : 'Missing locally'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={refreshLocalModelStatus}
                          className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-white dark:hover:bg-gray-700 dark:text-gray-300 transition-colors"
                        >
                          Refresh
                        </button>
                        <button
                          onClick={handleDownloadLocalModel}
                          disabled={localModelLoading || !!localModelStatus?.modelBundled}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                        >
                          {localModelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {localModelLoading ? 'Downloading...' : localModelStatus?.modelBundled ? 'Bundled' : localModelStatus?.modelAvailable ? 'Re-download' : 'Download'}
                        </button>
                      </div>
                    </div>

                    {localModelError && (
                      <p className="text-xs text-red-500 dark:text-red-400">{localModelError}</p>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      The base model is bundled for plug-and-play offline transcription. Other model sizes are optional downloads. Recording chunks are sent only to Electron and saved as short-lived temp files that are deleted after each transcription attempt.
                    </p>
                  </div>
                )}

                <SettingRow
                  label="Chunk interval (seconds)"
                  hint="How often audio is sent for transcription. Shorter = more real-time but more API calls."
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={15}
                      max={120}
                      step={15}
                      value={settings.chunkIntervalSeconds}
                      onChange={(e) => updateSettings({ chunkIntervalSeconds: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">
                      {settings.chunkIntervalSeconds}s
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 -mt-1">
                    <span>15s (real-time)</span>
                    <span>120s (fewer calls)</span>
                  </div>
                </SettingRow>

                <SettingRow
                  label="Auto-stop after (hours)"
                  hint="Recording automatically stops after this duration as a safety net."
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={settings.autoStopHours}
                      onChange={(e) => updateSettings({ autoStopHours: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">
                      {settings.autoStopHours}h
                    </span>
                  </div>
                </SettingRow>
              </>
            )}

            {/* ── Teams tab ───────────────────────────────────────── */}
            {activeTab === 'teams' && (
              <>
                <SectionHeading>Microsoft Teams Integration</SectionHeading>

                <div className="flex items-start justify-between gap-4 py-1">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Teams meeting detection</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                      When enabled, the app detects when you join a Teams meeting and shows a prompt to start recording.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.teamsEnabled}
                    onClick={() => updateSettings({ teamsEnabled: !settings.teamsEnabled })}
                    className={`flex-shrink-0 relative w-10 h-6 rounded-full transition-colors ${
                      settings.teamsEnabled ? 'bg-gray-700 dark:bg-gray-300' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        settings.teamsEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong>Note:</strong> Changes to Teams integration take effect after restarting the app.
                </div>

                <Divider />

                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">How to set up Teams integration</p>
                  <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Open Microsoft Teams → Settings → Privacy</li>
                    <li>Enable <strong>Third-party app API</strong></li>
                    <li>Restart this app — it will pair automatically when you join a meeting</li>
                  </ol>
                </div>
              </>
            )}

            {/* ── Version history tab (GitHub releases, read-only) ─── */}
            {activeTab === 'releases' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading>Release notes</SectionHeading>
                  <button
                    onClick={fetchGithubReleases}
                    disabled={githubReleasesLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${githubReleasesLoading ? 'animate-spin' : ''}`} />
                    {githubReleasesLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                  Fetched from GitHub. Only published releases are shown.
                </p>

                {githubReleasesError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
                    {githubReleasesError}
                  </div>
                )}

                {!githubReleasesError && githubReleasesLoading && githubReleases.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading releases…</p>
                )}

                {!githubReleasesError && !githubReleasesLoading && githubReleases.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No releases found.</p>
                )}

                {!githubReleasesError && (githubReleases.length > 0 || githubReleasesLoading) && (
                  <div className="space-y-3">
                    {githubReleases.map((r) => (
                      <div key={r.tag_name} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{r.tag_name}</p>
                        {r.published_at && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                            {new Date(r.published_at).toLocaleString()}
                          </p>
                        )}
                        {r.body ? (
                          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mt-2 whitespace-pre-wrap">{r.body}</p>
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">No release notes.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Data tab ────────────────────────────────────────── */}
            {activeTab === 'data' && (
              <>
                <SectionHeading>Backup & Restore</SectionHeading>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleExport}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 transition-colors"
                  >
                    <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    Export backup
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    Import backup
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImport}
                  />
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                  Exports all projects, suppliers, notes, tasks, decisions, and follow-ups as a JSON file.
                  Settings (including your API key) are not included in the export.
                </p>

                <Divider />
                <SectionHeading>Storage</SectionHeading>

                {/* Current data folder path */}
                {currentDataDir && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Current data folder</p>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                        storageIsProtected
                          ? 'text-red-500 dark:text-red-400'
                          : storageHealth === 'ok'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {storageStatusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all leading-relaxed">{currentDataDir}</p>
                  </div>
                )}

                {(storageMessage || storageIsProtected) && (
                  <div className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed flex gap-2 ${
                    storageIsProtected
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
                  }`}>
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p>{storageMessage || 'Storage protection is active.'}</p>
                      {storageIsProtected && isCustomDataDir && (
                        <p>Combobulator is refusing to overwrite data until the shared drive is reachable again.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleOpenFolder}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 transition-colors flex-1"
                  >
                    <FolderOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    Open folder
                  </button>

                  {(window as any).electronStore?.changeDataDir && (
                    <button
                      onClick={handleChangeDataDir}
                      disabled={dataDirChanging}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-1"
                    >
                      <FolderOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      {dataDirChanging ? 'Changing…' : 'Change folder…'}
                    </button>
                  )}

                  <button
                    onClick={refreshStorageInfo}
                    disabled={dataDirChanging}
                    className="px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Retry check
                  </button>
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2 leading-relaxed">
                  Changing the folder copies your existing data to the new location and restarts the app.
                  Point both computers to the same shared drive to access your data from anywhere.
                </p>

                {isCustomDataDir && (window as any).electronStore?.resetDataDir && (
                  <button
                    onClick={handleResetDataDir}
                    disabled={dataDirChanging || storageIsProtected}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Reset to default folder
                  </button>
                )}

                <Divider />
                {(window as any).electronUpdater && (
                  <>
                    <SectionHeading>Application</SectionHeading>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleCheckForUpdates}
                          disabled={updateCheckStatus === 'checking'}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${updateCheckStatus === 'checking' ? 'animate-spin' : ''}`} />
                          Check for updates
                        </button>
                        {updateCheckStatus === 'checking' && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">Checking…</span>
                        )}
                        {updateCheckStatus === 'up-to-date' && (
                          <span className="text-xs text-green-500 dark:text-green-400">You're up to date</span>
                        )}
                        {updateCheckStatus === 'available' && (
                          <span className="text-xs text-blue-500 dark:text-blue-400">Update available — downloading…</span>
                        )}
                        {updateCheckStatus === 'error' && (
                          <span className="text-xs text-red-400">Could not check for updates</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">v{version}</span>
                    </div>
                    <Divider />
                  </>
                )}

                {/* Danger zone */}
                <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">Danger zone</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Permanently deletes all projects, suppliers, notes, tasks, decisions, and follow-ups.
                    <strong> This cannot be undone.</strong> Export a backup first.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={clearConfirm}
                      onChange={(e) => setClearConfirm(e.target.value)}
                      placeholder='Type DELETE to confirm'
                      className="flex-1 px-3 py-1.5 text-sm border border-red-200 dark:border-red-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 dark:placeholder-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <button
                      onClick={handleClearData}
                      disabled={clearConfirm !== 'DELETE' || storageIsProtected}
                      className="px-4 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Clear all data
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
