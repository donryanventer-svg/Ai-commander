import React, { useState, useRef, useEffect } from 'react';
import {
  SlidersHorizontal,
  Mic,
  Paperclip,
  ArrowUp,
  Copy,
  Volume2,
  Edit2,
  ThumbsUp,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  Cpu,
  Terminal,
  VolumeX,
} from 'lucide-react';
import { Message, Model, Attachment, SteeringParams, MessageBlock, VoiceSettings } from '../types';
import { ModelSwitcher } from './ModelSwitcher';

function parseTextChunks(chunk: string, blocks: MessageBlock[]) {
  const paragraphs = chunk.split(/\n\n+/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const isList = lines.length > 1 && lines.every((l) => /^[-*+•]\s+|^\d+\.\s+/.test(l.trim()));
    if (isList) {
      blocks.push({
        isList: true,
        items: lines.map((l) => l.replace(/^[-*+•]\s+|^\d+\.\s+/, '').trim()),
      });
    } else {
      blocks.push({ isP: true, text: trimmed });
    }
  }
}

function parseMarkdownToBlocks(rawText: string): MessageBlock[] {
  if (!rawText) return [];
  const blocks: MessageBlock[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = rawText.substring(lastIndex, match.index).trim();
      if (textBefore) {
        parseTextChunks(textBefore, blocks);
      }
    }
    blocks.push({
      isCode: true,
      lang: match[1] || 'code',
      text: match[2].trimEnd(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < rawText.length) {
    const remaining = rawText.substring(lastIndex).trim();
    if (remaining) {
      parseTextChunks(remaining, blocks);
    }
  }

  return blocks.length > 0 ? blocks : [{ isP: true, text: rawText }];
}

interface ChatViewProps {
  threadTitle: string;
  onRenameTitle: (title: string) => void;
  messages: Message[];
  currentModel: Model;
  allModels: Model[];
  params: SteeringParams;
  paramsDrawerOpen: boolean;
  onToggleParamsDrawer: () => void;
  onSelectModel: (model: Model) => void;
  onOpenModelLabNew: () => void;
  onOpenCompare: () => void;
  onOpenVoice: () => void;
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  onTeachCorrection: (msgId: string, correctedText: string) => void;
  onShowToast: (msg: string) => void;
  isStreaming: boolean;
  voiceSettings?: VoiceSettings;
  onOpenHuggingFaceModal?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  threadTitle,
  onRenameTitle,
  messages,
  currentModel,
  allModels,
  params,
  paramsDrawerOpen,
  onToggleParamsDrawer,
  onSelectModel,
  onOpenModelLabNew,
  onOpenCompare,
  onOpenVoice,
  onSendMessage,
  onTeachCorrection,
  onShowToast,
  isStreaming,
  voiceSettings,
  onOpenHuggingFaceModal,
}) => {
  const [composerText, setComposerText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dictationActive, setDictationActive] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(threadTitle);
  const [readingAloudId, setReadingAloudId] = useState<string | null>(null);
  const [openThinkingIds, setOpenThinkingIds] = useState<Record<string, boolean>>({});
  const [correctingMsgId, setCorrectingMsgId] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setTitleDraft(threadTitle);
  }, [threadTitle]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Speech Recognition setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.onresult = (e: any) => {
          let transcript = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            transcript += e.results[i][0].transcript;
          }
          if (transcript.trim()) {
            setComposerText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };
        recog.onerror = () => {
          setDictationActive(false);
        };
        recog.onend = () => {
          setDictationActive(false);
        };
        recognitionRef.current = recog;
      }
    }
  }, []);

  const toggleDictation = () => {
    if (!recognitionRef.current) {
      onShowToast('Web Speech Recognition not supported in this browser. Dictation simulated.');
      setDictationActive(!dictationActive);
      if (!dictationActive) {
        setTimeout(() => {
          setComposerText((prev) =>
            prev ? `${prev} enforce zero-downtime concurrency rules` : 'Enforce zero-downtime concurrency rules'
          );
          setDictationActive(false);
        }, 2200);
      }
      return;
    }

    if (dictationActive) {
      recognitionRef.current.stop();
      setDictationActive(false);
    } else {
      try {
        recognitionRef.current.start();
        setDictationActive(true);
        onShowToast('Listening... Speak clearly into your microphone.');
      } catch (err) {
        recognitionRef.current.stop();
        setDictationActive(false);
      }
    }
  };

  const handleSend = () => {
    if (!composerText.trim() && attachments.length === 0) return;
    if (isStreaming) return;

    onSendMessage(composerText.trim(), attachments);
    setComposerText('');
    setAttachments([]);
    if (dictationActive && recognitionRef.current) {
      recognitionRef.current.stop();
      setDictationActive(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = Array.from(files).map((f: File) => ({
      id: `att-${Date.now()}-${Math.random()}`,
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
      type: f.type,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
    onShowToast(`Attached ${newAttachments.length} document(s) to prompt context`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleThinking = (msgId: string) => {
    setOpenThinkingIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    onShowToast('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleReadAloud = (text: string, msgId: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onShowToast('Speech synthesis not available in this browser');
      return;
    }

    if (readingAloudId === msgId) {
      window.speechSynthesis.cancel();
      setReadingAloudId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceSettings?.speechRate || 1.05;
    utterance.pitch = voiceSettings?.speechPitch || 1.0;
    if (voiceSettings?.voiceName && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.name === voiceSettings.voiceName);
      if (match) utterance.voice = match;
    }
    utterance.onend = () => setReadingAloudId(null);
    utterance.onerror = () => setReadingAloudId(null);
    setReadingAloudId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const submitCorrection = (msgId: string) => {
    if (!correctionDraft.trim()) return;
    onTeachCorrection(msgId, correctionDraft.trim());
    setCorrectingMsgId(null);
    setCorrectionDraft('');
  };

  return (
    <div id="chat-view-container" className="flex-1 flex flex-col h-full min-h-0 relative">
      {/* Top Bar */}
      <div
        id="chat-topbar"
        className="h-14 flex-none flex items-center justify-between px-3 md:px-6 border-b z-10"
        style={{
          borderColor: 'var(--color-divider)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        {/* Thread Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2 md:pr-4">
          {renamingTitle ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onRenameTitle(titleDraft.trim() || 'Untitled');
                  setRenamingTitle(false);
                }
                if (e.key === 'Escape') setRenamingTitle(false);
              }}
              onBlur={() => {
                onRenameTitle(titleDraft.trim() || 'Untitled');
                setRenamingTitle(false);
              }}
              autoFocus
              className="bg-[#111111] text-[#f3f3f3] font-semibold px-2 py-1 rounded border border-[#c5a47e] text-sm max-w-sm focus:outline-none"
            />
          ) : (
            <button
              type="button"
              id="btn-rename-thread-title"
              onClick={() => setRenamingTitle(true)}
              title="Click to rename discussion thread"
              className="text-left font-semibold text-sm text-[#f3f3f3] truncate hover:text-[#c5a47e] transition-colors cursor-pointer py-1 px-1.5 -ml-1.5 rounded hover:bg-[#141414]"
            >
              {threadTitle || 'New Discussion'}
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-none">
          {/* Model Switcher */}
          <ModelSwitcher
            currentModel={currentModel}
            allModels={allModels}
            onSelectModel={onSelectModel}
            onOpenModelLabNew={onOpenModelLabNew}
            onOpenCompare={onOpenCompare}
            onOpenHuggingFaceModal={onOpenHuggingFaceModal}
          />

          {/* Parameters Drawer Toggle */}
          <button
            type="button"
            id="btn-toggle-params-drawer"
            onClick={onToggleParamsDrawer}
            title="Model steering and parameters"
            className={`blueprint h-[34px] w-[34px] flex items-center justify-center rounded-sm transition-colors cursor-pointer border ${
              paramsDrawerOpen
                ? 'bg-[#c5a47e]/15 text-[#ffffff] border-[#c5a47e]/40'
                : 'bg-[#111111] text-[#a3a3a3] hover:text-[#f3f3f3] hover:bg-[#181818] border-[#262626]'
            }`}
          >
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Voice Mode Talk Button */}
          <button
            type="button"
            id="btn-open-voice-mode"
            onClick={onOpenVoice}
            title="Talk to Forge (Live Voice Mode)"
            className="blueprint h-[34px] flex items-center gap-2 px-3 bg-[#111111] hover:bg-[#181818] text-[#c5a47e] hover:text-[#d8b995] font-semibold text-xs rounded-sm transition-colors cursor-pointer border border-[#262626] shadow-sm tracking-wide uppercase font-mono"
          >
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <span className="flex items-end gap-0.5 h-3.5">
              <span className="w-0.5 bg-[#c5a47e] rounded-full eq-bar-1" />
              <span className="w-0.5 bg-[#c5a47e] rounded-full eq-bar-2" />
              <span className="w-0.5 bg-[#c5a47e] rounded-full eq-bar-3" />
            </span>
            <span>Talk</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        id="messages-scroll-area"
        className="flex-1 overflow-y-auto min-h-0 px-6 py-6 space-y-6 sophisticated-dot-grid"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-lg bg-[#c5a47e]/10 border border-[#c5a47e]/30 flex items-center justify-center text-[#c5a47e] mb-2">
                <Terminal className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-serif tracking-normal text-[#f3f3f3] italic">
                Forge Control Engine
              </h2>
              <p className="text-xs text-[#888888] max-w-md leading-relaxed">
                Active base: <span className="text-[#c5a47e] font-medium">{currentModel.name}</span>.
                Sampling temperature <span className="font-mono text-[#c5a47e]">{params.temperature.toFixed(2)}</span>.
                Send prompts with strict negative constraints or inspect the fine-tuning lab.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isReading = readingAloudId === msg.id;

            if (isUser) {
              return (
                <div key={msg.id} className="flex flex-col items-end gap-1.5 pl-12">
                  {/* Attached files */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {msg.files.map((file) => (
                        <div
                          key={file.id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300 font-mono"
                        >
                          <FileText className="w-3 h-3 text-sky-400" />
                          <span>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className="max-w-[85%] bg-[#c5a47e]/15 border border-[#c5a47e]/30 text-[#f3f3f3] px-4 py-2.5 rounded-lg text-sm leading-relaxed whitespace-pre-wrap selection:bg-[#c5a47e] selection:text-[#080808]">
                    {msg.text}
                  </div>
                </div>
              );
            }

            // Assistant message
            const allText =
              msg.text ||
              (msg.blocks
                ? msg.blocks.map((b) => b.text || (b.items ? b.items.join('\n') : '')).join('\n')
                : '');

            return (
              <div key={msg.id} className="flex items-start gap-3.5 pr-12 group">
                {/* Engine Avatar */}
                <div className="w-7 h-7 flex-none rounded bg-[#0f0f0f] border border-[#c5a47e]/40 flex items-center justify-center text-[#c5a47e] mt-0.5 shadow-sm">
                  <Terminal className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  {/* Collapsible Reasoning Process / Thinking */}
                  {msg.hasThinking && msg.thinkingText && (
                    <div className="blueprint bg-[#0a0a0a] border border-[#222222] rounded p-2.5 text-xs">
                      <i className="corner tl" />
                      <i className="corner tr" />
                      <button
                        type="button"
                        onClick={() => toggleThinking(msg.id)}
                        className="w-full flex items-center justify-between text-left text-[#c5a47e] font-semibold cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#c5a47e]" />
                          <span className="tracking-wide">Reasoning Trace & Negative Constraint Check</span>
                        </div>
                        {openThinkingIds[msg.id] ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[#737373]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#737373]" />
                        )}
                      </button>
                      {openThinkingIds[msg.id] && (
                        <div className="mt-2 pt-2 border-t border-[#1f1f1f] text-[11px] text-[#888888] font-mono leading-relaxed whitespace-pre-wrap">
                          {msg.thinkingText}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Render Message Blocks (pre-structured or parsed from markdown) */}
                  {(() => {
                    const displayBlocks =
                      msg.blocks && msg.blocks.length > 0
                        ? msg.blocks
                        : msg.text
                        ? parseMarkdownToBlocks(msg.text)
                        : [];

                    if (displayBlocks.length === 0) {
                      return (
                        <div className="text-sm text-[#e0e0e0] leading-relaxed">
                          {msg.streaming && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[#c5a47e] font-mono">
                              <span className="inline-block w-1.5 h-3.5 bg-[#c5a47e] animate-pulse" />
                              <span>Generating inference trace...</span>
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3 text-sm text-[#e0e0e0] leading-relaxed">
                        {displayBlocks.map((b, idx) => {
                          if (b.isP) {
                            return (
                              <p key={idx} className="whitespace-pre-wrap">
                                {b.text}
                              </p>
                            );
                          }
                          if (b.isList && b.items) {
                            return (
                              <ul key={idx} className="space-y-1.5 my-2">
                                {b.items.map((it, iIdx) => (
                                  <li key={iIdx} className="flex items-start gap-2">
                                    <span className="text-[#c5a47e] font-bold leading-relaxed">+</span>
                                    <span className="flex-1">{it}</span>
                                  </li>
                                ))}
                              </ul>
                            );
                          }
                          if (b.isCode) {
                            return (
                              <div
                                key={idx}
                                className="blueprint my-3 bg-[#080808] border border-[#1f1f1f] rounded-sm overflow-hidden"
                              >
                                <i className="corner tl" />
                                <i className="corner tr" />
                                <i className="corner bl" />
                                <i className="corner br" />
                                <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f0f0f] border-b border-[#1f1f1f]">
                                  <span className="font-mono text-[11px] text-[#737373] tracking-wider">
                                    {b.lang || 'code'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(b.text || '', `${msg.id}-${idx}`)}
                                    className="flex items-center gap-1 text-[11px] text-[#888888] hover:text-[#f3f3f3] transition-colors cursor-pointer"
                                  >
                                    {copiedId === `${msg.id}-${idx}` ? (
                                      <>
                                        <Check className="w-3 h-3 text-[#c5a47e]" />
                                        <span className="text-[#c5a47e] font-mono">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-3.5 overflow-x-auto text-xs font-mono text-[#f3f3f3] leading-relaxed">
                                  <code>{b.text}</code>
                                </pre>
                              </div>
                            );
                          }
                          return null;
                        })}

                        {msg.streaming && (
                          <span className="inline-block w-1.5 h-3.5 bg-[#c5a47e] ml-1 animate-pulse align-middle" />
                        )}
                      </div>
                    );
                  })()}

                  {/* Correction Editor Box */}
                  {correctingMsgId === msg.id && (
                    <div className="blueprint bg-[#0a0a0a] border border-[#c5a47e]/60 p-3 rounded-sm space-y-2.5 mt-2">
                      <i className="corner tl" />
                      <i className="corner tr" />
                      <i className="corner bl" />
                      <i className="corner br" />
                      <div className="flex items-center justify-between text-xs text-[#c5a47e] font-semibold">
                        <div className="flex items-center gap-1.5">
                          <Edit2 className="w-3.5 h-3.5 text-[#c5a47e]" />
                          <span>Teach Model: Provide Corrected Output or Rule</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCorrectingMsgId(null)}
                          className="text-[#737373] hover:text-[#f3f3f3]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={correctionDraft}
                        onChange={(e) => setCorrectionDraft(e.target.value)}
                        placeholder="Type what the model should have produced, or the negative constraint rule it violated..."
                        rows={3}
                        className="w-full bg-[#111111] border border-[#262626] rounded p-2 text-xs text-[#f3f3f3] placeholder-[#555555] focus:border-[#c5a47e] focus:outline-none"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCorrectingMsgId(null)}
                          className="px-2.5 py-1 text-xs text-[#888888] hover:text-[#f3f3f3]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => submitCorrection(msg.id)}
                          className="blueprint px-3 py-1 bg-[#c5a47e] hover:bg-[#d8b995] text-[#080808] font-semibold text-xs rounded transition-colors cursor-pointer tracking-wide uppercase font-mono"
                        >
                          <i className="corner tl" />
                          <i className="corner tr" />
                          <i className="corner bl" />
                          <i className="corner br" />
                          Save as Rule & Exemplar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Bar under Assistant */}
                  {!msg.streaming && (
                    <div className="flex items-center gap-1 pt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      {/* Copy Entire Message */}
                      <button
                        type="button"
                        onClick={() => handleCopy(allText, msg.id)}
                        title="Copy message"
                        className="p-1.5 text-[#737373] hover:text-[#f3f3f3] hover:bg-[#181818] rounded transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-[#c5a47e]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Read Aloud */}
                      <button
                        type="button"
                        onClick={() => handleReadAloud(allText, msg.id)}
                        title={isReading ? 'Stop read aloud' : 'Read aloud'}
                        className={`p-1.5 rounded transition-colors ${
                          isReading
                            ? 'text-[#c5a47e] bg-[#c5a47e]/20'
                            : 'text-[#737373] hover:text-[#f3f3f3] hover:bg-[#181818]'
                        }`}
                      >
                        {isReading ? (
                          <span className="flex items-end gap-0.5 h-3.5 px-0.5">
                            <span className="w-0.5 bg-[#c5a47e] rounded-full eq-bar-1" />
                            <span className="w-0.5 bg-[#c5a47e] rounded-full eq-bar-2" />
                            <span className="w-0.5 bg-[#c5a47e] rounded-full eq-bar-3" />
                          </span>
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Teach / Correct */}
                      <button
                        type="button"
                        onClick={() => {
                          setCorrectingMsgId(msg.id);
                          setCorrectionDraft(allText);
                        }}
                        title="Teach model correction"
                        className="p-1.5 text-[#737373] hover:text-[#c5a47e] hover:bg-[#181818] rounded transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Thumbs Up Feedback */}
                      <button
                        type="button"
                        onClick={() =>
                          onShowToast('Response logged as positive reward in training buffer')
                        }
                        title="Reward: Good technical response"
                        className="p-1.5 text-[#737373] hover:text-[#c5a47e] hover:bg-[#181818] rounded transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer Area */}
      <div
        id="chat-composer"
        className="flex-none px-3 md:px-6 pb-2.5 md:pb-5 pt-2 border-t"
        style={{
          borderColor: 'var(--color-divider)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="blueprint relative bg-[#0a0a0a] border border-[#222222] rounded-sm p-3 shadow-lg focus-within:border-[#c5a47e]/80 transition-colors"
            style={{ backgroundColor: 'var(--color-bg)' }}
          >
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            {/* Dictation Active Screen Overlay */}
            {dictationActive && (
              <div className="absolute inset-0 bg-[#080808]/95 z-20 flex items-center justify-between px-4 rounded-sm border border-[#c5a47e]/50">
                <div className="flex items-center gap-3">
                  <span className="flex items-end gap-1 h-5">
                    <span className="w-1 bg-[#c5a47e] rounded-full eq-bar-1" />
                    <span className="w-1 bg-[#c5a47e] rounded-full eq-bar-2" />
                    <span className="w-1 bg-[#c5a47e] rounded-full eq-bar-3" />
                    <span className="w-1 bg-[#c5a47e] rounded-full eq-bar-4" />
                    <span className="w-1 bg-[#c5a47e] rounded-full eq-bar-5" />
                  </span>
                  <span className="text-xs font-semibold text-[#c5a47e] tracking-wide">
                    Listening — speak prompt clearly into microphone
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleDictation}
                  className="px-2.5 py-1 bg-[#1a1a1a] hover:bg-[#222222] text-[#f3f3f3] text-xs font-medium rounded transition-colors border border-[#333333]"
                >
                  Stop Recording
                </button>
              </div>
            )}

            {/* Attachment Chips */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-[#1c1c1c]">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#111111] border border-[#262626] rounded text-xs text-[#f3f3f3]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#c5a47e]" />
                    <span className="truncate max-w-[180px]">{att.name}</span>
                    <span className="text-[10px] text-[#737373] font-mono">({att.size})</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-0.5 text-[#737373] hover:text-[#f3f3f3]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input Textarea */}
            <textarea
              id="chat-composer-textarea"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Send prompt or instruction to ${currentModel.name}...`}
              rows={2}
              className="w-full bg-transparent text-sm text-[#f3f3f3] placeholder-[#555555] focus:outline-none resize-none leading-relaxed"
            />

            {/* Bottom Controls */}
            <div className="flex items-center justify-between mt-2 pt-1">
              <div className="flex items-center gap-1 text-[#737373]">
                {/* File Attachment */}
                <button
                  type="button"
                  id="btn-attach-document"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach context document"
                  className="p-1.5 text-[#737373] hover:text-[#f3f3f3] hover:bg-[#181818] rounded transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  className="hidden"
                />

                {/* Voice Dictation */}
                <button
                  type="button"
                  id="btn-composer-dictation"
                  onClick={toggleDictation}
                  title="Voice dictation"
                  className={`p-1.5 rounded transition-colors ${
                    dictationActive
                      ? 'text-[#c5a47e] bg-[#c5a47e]/20'
                      : 'text-[#737373] hover:text-[#f3f3f3] hover:bg-[#181818]'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <span className="hidden sm:inline-block text-[10px] font-mono text-[#555555] select-none">
                  Enter to send · Shift+Enter for newline
                </span>
                <button
                  type="button"
                  id="btn-send-message"
                  onClick={handleSend}
                  disabled={(!composerText.trim() && attachments.length === 0) || isStreaming}
                  className={`blueprint w-8 h-8 flex items-center justify-center rounded-sm transition-all ${
                    composerText.trim() || attachments.length > 0
                      ? 'bg-[#c5a47e] hover:bg-[#d8b995] text-[#080808] cursor-pointer shadow-md'
                      : 'bg-[#1a1a1a] text-[#555555] cursor-not-allowed opacity-50'
                  }`}
                >
                  <i className="corner tl" />
                  <i className="corner tr" />
                  <i className="corner bl" />
                  <i className="corner br" />
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
