import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, FileText, Loader2, Search, Send, Settings, X } from 'lucide-react';
import { useStore } from '../store/store';
import { buildLocalSearchContext, searchLocalCorpus, type LocalSearchResult } from '../utils/localSearch';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: LocalSearchResult[];
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 rounded"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export function LocalAssistantModal() {
  const toggleLocalAssistant = useStore((s) => s.toggleLocalAssistant);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const localSummaryModel = useStore((s) => s.settings.localSummaryModel);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const setActiveView = useStore((s) => s.setActiveView);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [lastSources, setLastSources] = useState<LocalSearchResult[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [warming, setWarming] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressStage, setProgressStage] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshStatus = useCallback(() => {
    const api = (window as any).electronSummary;
    if (!api?.getStatus) {
      setStatus({ electronAvailable: false });
      return;
    }
    api.getStatus(localSummaryModel)
      .then((result: any) => {
        setStatus({ electronAvailable: true, ...result });
        setServerStatus(result?.serverStatus || null);
      })
      .catch((e: any) => setError(e?.message ?? 'Could not check local AI status.'));
    api.getServerStatus?.(localSummaryModel)
      .then((result: any) => setServerStatus(result))
      .catch(() => {});
  }, [localSummaryModel]);

  useEffect(() => {
    refreshStatus();
    inputRef.current?.focus();
  }, [refreshStatus]);

  useEffect(() => {
    const api = (window as any).electronSummary;
    if (!api?.onProgress) return;
    return api.onProgress((payload: any) => {
      if (payload?.requestId && activeRequestId && payload.requestId !== activeRequestId) return;
      setProgressStage(payload?.stage || '');
      setProgressMessage(payload?.message || '');
    });
  }, [activeRequestId]);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  const openSettingsForModel = () => {
    toggleLocalAssistant();
    toggleSettings();
  };

  const warmLocalAi = async () => {
    const api = (window as any).electronSummary;
    if (!api?.startServer) return;
    setWarming(true);
    setError('');
    setProgressStage('server-loading');
    setProgressMessage('Loading the selected local model into the background server...');
    setStartedAt(Date.now());
    try {
      const result = await api.startServer(localSummaryModel);
      if (!result?.ok) throw new Error(result?.error || 'Could not start local AI server.');
      setServerStatus(result);
    } catch (e: any) {
      setError(e?.message ?? 'Could not start local AI server.');
    } finally {
      setWarming(false);
      setStartedAt(null);
      refreshStatus();
    }
  };

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || isThinking) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setIsThinking(true);
    setProgressStage('searching');
    setProgressMessage('Searching local app data...');
    setStartedAt(Date.now());
    const requestId = crypto.randomUUID();
    setActiveRequestId(requestId);
    const shouldSearch = searchEnabled && question.length >= 4;
    const sources = shouldSearch
      ? searchLocalCorpus(question, { projects, suppliers, notes, tasks, decisions }, 8)
      : [];
    setLastSources(sources);

    try {
      const api = (window as any).electronSummary;
      if (!api?.ask) throw new Error('Local AI is only available in the Electron app.');
      setProgressStage('starting');
      setProgressMessage('Starting local model process...');
      const result = await api.ask(question, localSummaryModel, {
        requestId,
        messages,
        context: buildLocalSearchContext(sources),
        maxTokens: sources.length > 0 ? 700 : 220,
        temperature: 0.7,
        timeoutMs: 120000,
      });
      if (!result?.ok) throw new Error(result?.error || 'Local AI failed.');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.answer || '',
          sources,
        },
      ]);
    } catch (e: any) {
      setError(e?.message ?? 'Local AI failed.');
    } finally {
      setIsThinking(false);
      setStartedAt(null);
      setActiveRequestId('');
      refreshStatus();
    }
  }, [input, isThinking, localSummaryModel, messages, refreshStatus, searchEnabled, projects, suppliers, notes, tasks, decisions]);

  const openSource = (source: LocalSearchResult) => {
    if (source.noteId) {
      navigateToNote(source.noteId);
      setActiveView('notes');
      toggleLocalAssistant();
      return;
    }
    if (source.kind === 'task') {
      setActiveView('notes');
      setRightPanelTab('tasks');
      setEditingTask(source.id);
      toggleLocalAssistant();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={toggleLocalAssistant} />
      <div className="relative w-[720px] h-[78vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Bot className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Local AI</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {serverStatus?.ready ? `${serverStatus.modelLabel || 'Local model'} loaded in memory` : status?.modelLabel || 'Local model'} - offline answers over local app data
            </p>
          </div>
          <div className="flex-1" />
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
            serverStatus?.ready
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : status?.modelAvailable && (status?.binaryAvailable || status?.bundledRuntimeAvailable)
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}>
            {serverStatus?.ready ? 'Loaded' : status?.modelAvailable && (status?.binaryAvailable || status?.bundledRuntimeAvailable) ? 'Files ready' : 'Model missing'}
          </span>
          <button
            onClick={toggleLocalAssistant}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm">
                <Bot className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Ask across your workspace</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                  Searches notes, transcripts, tasks, and decisions locally, then asks the selected model with the best matches.
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-gray-900 dark:bg-gray-700 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}>
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.role === 'assistant' && (
                  <div className="mt-2 space-y-2">
                    {message.sources && message.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {message.sources.slice(0, 4).map((source, index) => (
                          <button
                            key={`${source.kind}-${source.id}`}
                            onClick={() => openSource(source)}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/70 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
                            title={source.title}
                          >
                            <FileText className="w-2.5 h-2.5" />
                            [{index + 1}] {source.kind}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end -mr-1">
                      <CopyButton text={message.content} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {(isThinking || warming) && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 p-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{progressMessage || 'Thinking locally...'}</span>
                <span className="ml-auto tabular-nums">{elapsed}s</span>
              </div>
              <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gray-500 dark:bg-gray-300 transition-all ${
                    progressStage === 'searching' ? 'w-1/5' :
                    progressStage === 'checking' ? 'w-2/5' :
                    progressStage === 'loading' || progressStage === 'server-loading' ? 'w-3/5' :
                    progressStage === 'generating' ? 'w-4/5' :
                    progressStage === 'finalizing' ? 'w-4/5' :
                    progressStage === 'done' ? 'w-full' :
                    'w-1/4'
                  }`}
                />
              </div>
              {(progressStage === 'loading' || progressStage === 'server-loading') && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  If this is the first question, the selected model is being loaded from disk into RAM. This can take a long time on CPU.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-2">
              <p>{error}</p>
              {error.toLowerCase().includes('missing') && (
                <button
                  onClick={openSettingsForModel}
                  className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
                >
                  <Settings className="w-3 h-3" />
                  Install local model
                </button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 p-4 flex-shrink-0">
          {lastSources.length > 0 && (
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">Sources</span>
              {lastSources.slice(0, 6).map((source, index) => (
                <button
                  key={`${source.kind}-${source.id}`}
                  onClick={() => openSource(source)}
                  className="text-[10px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 whitespace-nowrap"
                >
                  [{index + 1}] {source.title}
                </button>
              ))}
            </div>
          )}
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => setSearchEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors ${
                searchEnabled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
              }`}
            >
              <Search className="w-3 h-3" />
              {searchEnabled ? 'Search app data' : 'General chat'}
            </button>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {serverStatus?.ready ? 'Warm local server' : 'Local only'}
            </span>
          </div>
          {!serverStatus?.ready && status?.modelAvailable && status?.serverBinaryAvailable && (
            <button
              onClick={warmLocalAi}
              disabled={warming || isThinking}
              className="mb-2 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50"
            >
              {warming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
              Load model into memory
            </button>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question..."
              rows={2}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="self-end p-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
