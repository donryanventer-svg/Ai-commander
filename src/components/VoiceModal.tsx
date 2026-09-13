import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Terminal, Volume2, Sparkles } from 'lucide-react';
import { Model, SteeringParams, VoiceSettings } from '../types';

interface VoiceModalProps {
  open: boolean;
  currentModel: Model;
  params: SteeringParams;
  voiceSettings?: VoiceSettings;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<string>;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({
  open,
  currentModel,
  params,
  voiceSettings,
  onClose,
  onSendMessage,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!open) {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Initialize speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = true;
        recog.onresult = (e: any) => {
          let text = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            text += e.results[i][0].transcript;
          }
          setUserTranscript(text);
        };
        recog.onend = () => {
          setIsListening(false);
        };
        recognitionRef.current = recog;
      }
    }

    startListening();

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [open]);

  if (!open) return null;

  const startListening = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setUserTranscript('');
    setStatus('listening');
    setIsListening(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        // already started or retry
      }
    } else {
      // Fallback simulated input after 2.5 seconds
      setTimeout(() => {
        setUserTranscript('Analyze the distributed concurrency boundaries.');
        handleProcessSpeech('Analyze the distributed concurrency boundaries.');
      }, 2500);
    }
  };

  const stopListeningAndProcess = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
    if (userTranscript.trim()) {
      handleProcessSpeech(userTranscript.trim());
    } else {
      setStatus('idle');
    }
  };

  const handleProcessSpeech = async (query: string) => {
    setStatus('thinking');
    try {
      const reply = await onSendMessage(query);
      setAssistantReply(reply);
      speakReply(reply);
    } catch (err) {
      setStatus('idle');
    }
  };

  const speakReply = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setStatus('idle');
      return;
    }

    setStatus('speaking');
    setIsSpeaking(true);

    // Strip code blocks or formatting for clean voice reading
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block generated in workspace.')
      .replace(/[*_#`+]/g, '')
      .slice(0, 400);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = voiceSettings?.speechRate || 1.05;
    utterance.pitch = voiceSettings?.speechPitch || 1.0;
    if (voiceSettings?.voiceName && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.name === voiceSettings.voiceName);
      if (match) utterance.voice = match;
    }
    utterance.onend = () => {
      setIsSpeaking(false);
      setStatus('idle');
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setStatus('idle');
    };
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080808]/95 backdrop-blur-md flex flex-col items-center justify-between p-8 text-[#f3f3f3] animate-in fade-in duration-200 select-none">
      {/* Top Header */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#c5a47e]">
          <Terminal className="w-4 h-4" />
          <span className="font-mono text-xs uppercase tracking-[0.14em] font-semibold">
            Forge Voice Link · {currentModel.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-[#737373] hover:text-[#f3f3f3] hover:bg-[#181818] rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Central Visualizer Orb */}
      <div className="flex flex-col items-center justify-center space-y-8 my-auto text-center max-w-lg">
        <div className="relative w-40 h-40 flex items-center justify-center">
          {/* Animated concentric rings */}
          {status === 'listening' && (
            <>
              <div className="absolute inset-0 rounded-full border border-[#c5a47e]/40 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-[#c5a47e]/60 animate-pulse" />
            </>
          )}
          {status === 'speaking' && (
            <>
              <div className="absolute inset-0 rounded-full border border-[#c5a47e]/50 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-[#c5a47e]/70 animate-pulse" />
            </>
          )}
          {status === 'thinking' && (
            <div className="absolute inset-0 rounded-full border-2 border-[#c5a47e]/80 border-t-transparent animate-spin" />
          )}

          {/* Central orb */}
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
              status === 'listening'
                ? 'bg-[#c5a47e] shadow-[#c5a47e]/40 scale-105'
                : status === 'speaking'
                ? 'bg-[#c5a47e] shadow-[#c5a47e]/50 scale-105'
                : status === 'thinking'
                ? 'bg-[#141414] shadow-[#c5a47e]/20 border border-[#c5a47e]/30'
                : 'bg-[#141414] border border-[#222222] shadow-2xl'
            }`}
          >
            {status === 'speaking' ? (
              <Volume2 className="w-10 h-10 text-[#080808] animate-bounce" />
            ) : status === 'thinking' ? (
              <Sparkles className="w-10 h-10 text-[#c5a47e] animate-pulse" />
            ) : (
              <Mic
                className={`w-10 h-10 ${
                  status === 'listening' ? 'text-[#080808]' : 'text-[#737373]'
                }`}
              />
            )}
          </div>
        </div>

        {/* Live Status Label */}
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-[#c5a47e] font-semibold">
            {status === 'listening' && 'Listening to prompt...'}
            {status === 'thinking' && 'Synthesizing response under active constraints...'}
            {status === 'speaking' && 'Streaming speech...'}
            {status === 'idle' && 'Tap microphone to speak'}
          </div>

          {/* Transcript preview */}
          {userTranscript && (
            <p className="text-sm text-[#e0e0e0] italic px-4 font-serif">"{userTranscript}"</p>
          )}

          {assistantReply && status === 'speaking' && (
            <p className="text-xs text-[#888888] line-clamp-3 max-w-md px-4 leading-relaxed font-mono">
              {assistantReply}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center gap-4">
        {isListening ? (
          <button
            type="button"
            onClick={stopListeningAndProcess}
            className="h-12 px-6 bg-[#c5a47e] hover:bg-[#d8b995] text-[#080808] font-bold text-xs rounded-full flex items-center gap-2 cursor-pointer shadow-lg transition-colors uppercase font-mono tracking-wider"
          >
            <MicOff className="w-4 h-4" />
            <span>Process Speech</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={startListening}
            className="h-12 px-6 bg-[#141414] hover:bg-[#1f1f1f] text-[#c5a47e] font-bold text-xs rounded-full flex items-center gap-2 cursor-pointer border border-[#c5a47e]/40 shadow-lg transition-colors uppercase font-mono tracking-wider"
          >
            <Mic className="w-4 h-4" />
            <span>Start Speaking</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="h-12 px-5 bg-[#141414] hover:bg-[#1a1a1a] text-[#888888] hover:text-[#f3f3f3] text-xs font-semibold rounded-full cursor-pointer transition-colors border border-[#222222]"
        >
          End Call
        </button>
      </div>
    </div>
  );
};
