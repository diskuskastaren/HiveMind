import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { useStore } from '../store/store';
import { version } from '../../package.json';
import { exportAllData } from '../utils/export';
import { CustomSelect } from './ui/CustomSelect';

type SettingsTab = 'appearance' | 'ai' | 'recording' | 'teams' | 'data';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
  { id: 'ai', label: 'AI & Summarization', icon: <Bot className="w-4 h-4" /> },
  { id: 'recording', label: 'Recording', icon: <Mic className="w-4 h-4" /> },
  { id: 'teams', label: 'Teams', icon: <Video className="w-4 h-4" /> },
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
const WHISPER_COST_PER_MIN = 0.003; // $0.003/min — gpt-4o-mini-transcribe (half the cost of whisper-1)

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
        Transcription cost is the same regardless of model. Mic mode uses browser speech recognition — no transcription charge. Prices from openai.com/api/pricing, ~100 wpm assumed.
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
  const [clearConfirm, setClearConfirm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle');
  const [currentDataDir, setCurrentDataDir] = useState<string>('');
  const [isCustomDataDir, setIsCustomDataDir] = useState(false);
  const [dataDirChanging, setDataDirChanging] = useState(false);

  // Sync draft when settings change from outside (e.g. migration)
  useEffect(() => {
    setApiKeyDraft(settings.openaiApiKey);
  }, [settings.openaiApiKey]);

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
    const onAvailable = () => { setUpdateCheckStatus('available'); cleanup(); };
    const onNotAvailable = () => { setUpdateCheckStatus('up-to-date'); cleanup(); };
    const onError = () => { setUpdateCheckStatus('error'); cleanup(); };
    const cleanup = () => {
      updater.offUpdateAvailable(onAvailable);
      updater.offUpdateNotAvailable(onNotAvailable);
      updater.offError(onError);
    };
    updater.onUpdateAvailable(onAvailable);
    updater.onUpdateNotAvailable(onNotAvailable);
    updater.onError(onError);
    await updater.check();
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

                <div className="flex items-start justify-between gap-4 py-1">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dark mode</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                      Reduces eye strain during long sessions. Toggle instantly with the moon icon in the sidebar.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.darkMode}
                    onClick={() => updateSettings({ darkMode: !settings.darkMode })}
                    className={`flex-shrink-0 relative w-10 h-6 rounded-full transition-colors ${
                      settings.darkMode ? 'bg-gray-700 dark:bg-gray-300' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform flex items-center justify-center ${
                        settings.darkMode ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    >
                      {settings.darkMode
                        ? <Moon className="w-2.5 h-2.5 text-gray-600 dark:text-gray-700" />
                        : <Sun className="w-2.5 h-2.5 text-amber-400" />}
                    </span>
                  </button>
                </div>
              </>
            )}

            {/* ── AI tab ─────────────────────────────────────────── */}
            {activeTab === 'ai' && (
              <>
                <SectionHeading>OpenAI API</SectionHeading>

                <SettingRow
                  label="API Key"
                  hint="Used for system audio transcription and meeting summaries. Stored locally — never sent anywhere except OpenAI."
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
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Current data folder</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all leading-relaxed">{currentDataDir}</p>
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
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2 leading-relaxed">
                  Changing the folder copies your existing data to the new location and restarts the app.
                  Point both computers to the same shared drive to access your data from anywhere.
                </p>

                {isCustomDataDir && (window as any).electronStore?.resetDataDir && (
                  <button
                    onClick={handleResetDataDir}
                    disabled={dataDirChanging}
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
                      disabled={clearConfirm !== 'DELETE'}
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
