/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Bot,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Send,
  Camera,
  MessageSquareWarning,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Database,
  Eye,
  FileCheck,
} from 'lucide-react';
import { Member } from '../types';

interface TelegramWebhookManagerProps {
  members: Member[];
}

export const TelegramWebhookManager: React.FC<TelegramWebhookManagerProps> = ({ members }) => {
  const [webhookStatus, setWebhookStatus] = useState<'checking' | 'active' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [hasBotToken, setHasBotToken] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tester' | 'messages' | 'receipts' | 'complaints'>('tester');
  const [copiedLink, setCopiedLink] = useState(false);

  // Simulation test state
  const [simulating, setSimulating] = useState(false);
  const [simTestType, setSimTestType] = useState<'start' | 'photo' | 'complaint' | 'admin_reply'>('start');
  const [simSelectedMemberId, setSimSelectedMemberId] = useState<string>(members[0]?.id || 'MEM-001');
  const [simText, setSimText] = useState<string>('/start');
  const [simReceiptCaption, setSimReceiptCaption] = useState<string>('የ2018 መስከረም ወር ክፍያ ደረሰኝ');
  const [simComplaintText, setSimComplaintText] = useState<string>('የባንክ ክፍያ ፈጽሜ በመዝገብ ላይ አልተካተተም፣ እባክዎ ይረዱኝ');
  const [simAdminReplyText, setSimAdminReplyText] = useState<string>('ቺሁን');
  const [testResult, setTestResult] = useState<any>(null);

  // Firestore records state
  const [messagesList, setMessagesList] = useState<any[]>([]);
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
  const [complaintsList, setComplaintsList] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/telegram-webhook`;

  const checkWebhook = async () => {
    setWebhookStatus('checking');
    try {
      // 1. Check GET endpoint
      const res = await fetch('/api/telegram-webhook');
      const text = await res.text();
      if (res.ok && text.includes('Webhook is active')) {
        setWebhookStatus('active');
        setStatusMessage(text);
      } else {
        setWebhookStatus('error');
        setStatusMessage(text || 'Unexpected response');
      }

      // 2. Check diagnostic status
      const statusRes = await fetch('/api/telegram-webhook/status');
      if (statusRes.ok) {
        const data = await statusRes.json();
        setHasBotToken(Boolean(data.hasBotToken));
      }
    } catch (err: any) {
      setWebhookStatus('error');
      setStatusMessage(err.message || 'Failed to connect to /api/telegram-webhook');
    }
  };

  const fetchRecords = async () => {
    setLoadingRecords(true);
    try {
      const [msgRes, rcptRes, compRes] = await Promise.all([
        fetch('/api/telegram-webhook/messages'),
        fetch('/api/telegram-webhook/receipts'),
        fetch('/api/telegram-webhook/complaints'),
      ]);

      if (msgRes.ok) {
        const d = await msgRes.json();
        setMessagesList(d.messages || []);
      }
      if (rcptRes.ok) {
        const d = await rcptRes.json();
        setReceiptsList(d.receipts || []);
      }
      if (compRes.ok) {
        const d = await compRes.json();
        setComplaintsList(d.complaints || []);
      }
    } catch (err) {
      console.error('Failed to load webhook records:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    checkWebhook();
    fetchRecords();
  }, []);

  const handleRunSimulation = async () => {
    setSimulating(true);
    setTestResult(null);

    const chosenMember = members.find((m) => m.id === simSelectedMemberId) || members[0];
    let payload: any = {
      action: simTestType,
      senderName: chosenMember?.fullName || 'ተጠቃሚ',
      fromId: 77889900,
    };

    if (simTestType === 'start') {
      payload.text = simText.trim() || `/start ${chosenMember?.id}`;
    } else if (simTestType === 'photo') {
      payload.text = simReceiptCaption;
      payload.fileId = `AgACAgQAAxkBAAE_${Date.now()}_sample_receipt_photo`;
    } else if (simTestType === 'complaint') {
      payload.text = `/complaint ${simComplaintText}`;
    } else if (simTestType === 'admin_reply') {
      payload.text = simAdminReplyText || 'ቺሁን';
      payload.isAdmin = true;
      payload.action = 'admin_reply';
      payload.replyToText = `⚠️ አዲስ አባል ቅሬታ/አስተያየት ተመዝግቧል!\n🆔 የቅሬታ መለያ፦ comp_test_sample\n👤 ከላኪ፡ ${chosenMember?.fullName || 'ተጠቃሚ'} (ID: 77889900)\n📝 ቅሬታ፡ የባንክ ክፍያ አልተመዘገበም`;
    }

    try {
      const res = await fetch('/api/telegram-webhook/test-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setTestResult({
        success: res.ok,
        data,
        type: simTestType,
      });
      // Refresh stored records
      await fetchRecords();
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to simulate',
      });
    } finally {
      setSimulating(false);
    }
  };

  const copyWebhookCommand = () => {
    const command = `curl -F "url=${webhookUrl}" https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook`;
    navigator.clipboard.writeText(command);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-sm overflow-hidden space-y-6 p-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-neutral-100">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold">
                Telegram Webhook API
              </span>
              <span className="text-neutral-300">/</span>
              <span className="text-xs font-mono text-neutral-500">/api/telegram-webhook</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-neutral-900 mt-0.5">
              የቴሌግራም ቦት ዌብሁክ እና የዳታቤዝ ግንኙነት (Webhook Endpoint)
            </h3>
            <p className="text-xs text-neutral-500">
              የቴሌግራም መልእክቶችን፣ የደረሰኝ ፎቶዎችን እና የአባላት ቅሬታዎችን በFirestore የሚያስቀምጥ የቀጥታ መገናኛ
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${
              webhookStatus === 'active'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : webhookStatus === 'checking'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {webhookStatus === 'active' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : webhookStatus === 'checking' ? (
              <RefreshCw className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              {webhookStatus === 'active'
                ? 'ዌብሁክ ነቅቷል (200 OK)'
                : webhookStatus === 'checking'
                ? 'እየተፈተሸ ነው...'
                : 'ግንኙነት አልተገኘም'}
            </span>
          </div>

          <button
            onClick={checkWebhook}
            className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
            title="ድጋሚ ፈትሽ"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ፈትሽ</span>
          </button>
        </div>
      </div>

      {/* Endpoint URL and Setup Box */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Endpoint Details */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
            የዌብሁክ ይፋዊ አድራሻ (Webhook URL)
          </span>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-neutral-200 text-xs font-mono text-neutral-800 overflow-x-auto">
            <span className="text-emerald-700 font-bold shrink-0">POST & GET</span>
            <span className="truncate">{webhookUrl}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
            <span>GET መልስ፡ &ldquo;{statusMessage || 'Webhook is active'}&rdquo;</span>
            <span className="font-mono text-neutral-400">Response &lt; 1s (HTTP 200)</span>
          </div>
        </div>

        {/* Telegram Bot Token State */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              TELEGRAM_BOT_TOKEN ሚስጥራዊ ቁልፍ
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                hasBotToken ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {hasBotToken ? 'የተዋቀረ (Configured)' : 'አልተዋቀረም (Env Variable)'}
            </span>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            ቦት ቶከኑ በአገልጋዩ (Server-side) ብቻ በ <code>TELEGRAM_BOT_TOKEN</code> ኢንቫይሮንመንት ይቀመጣል፤ በUI ላይ በፍጹም አይጋለጥም።
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={copyWebhookCommand}
              className="text-xs text-sky-700 hover:text-sky-800 font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'ትእዛዙ ተቀድቷል (Copied)' : 'setWebhook ትእዛዝ ቅዳ (Copy cURL)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 border-b border-neutral-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('tester')}
          className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'tester'
              ? 'bg-neutral-900 text-white border-b-2 border-neutral-900'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>የቀጥታ ሙከራ (Simulate & Test)</span>
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'messages'
              ? 'bg-neutral-900 text-white border-b-2 border-neutral-900'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>የገቡ መልእክቶች ({messagesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('receipts')}
          className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'receipts'
              ? 'bg-neutral-900 text-white border-b-2 border-neutral-900'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Camera className="w-3.5 h-3.5 text-amber-500" />
          <span>የደረሰኝ ፎቶዎች ({receiptsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('complaints')}
          className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'complaints'
              ? 'bg-neutral-900 text-white border-b-2 border-neutral-900'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <MessageSquareWarning className="w-3.5 h-3.5 text-rose-500" />
          <span>የአባላት ቅሬታዎች ({complaintsList.length})</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchRecords}
            disabled={loadingRecords}
            className="px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-900 bg-neutral-100 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="መረጃዎችን አድስ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
            <span>አድስ</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Interactive Tester */}
      {activeTab === 'tester' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100">
            <h4 className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-sky-600" />
              <span>የቴሌግራም ቦት ተግባራትን በቀጥታ ይሞክሩ (Webhook Test Suite)</span>
            </h4>
            <p className="text-xs text-sky-800 mt-1">
              ይህ ሞካሪ ልክ ከቴሌግራም ቦት እንደተላከ ሙሉ የ JSON Update በማዘጋጀት ወደ <code>/api/telegram-webhook</code> ይልካል፤ መልእክቱን በ Firestore ያስቀምጣል እንዲሁም አውቶማቲክ ምላሹን ያመነጫል።
            </p>
          </div>

          {/* Test Action Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => {
                setSimTestType('start');
                setSimText('/start');
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                simTestType === 'start'
                  ? 'bg-emerald-50 border-emerald-400 shadow-xs'
                  : 'bg-white border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-neutral-900">
                <Send className="w-4 h-4 text-emerald-600" />
                <span>1. የ /start ትእዛዝ</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                የግል ክፍያ መረጃ፣ የትውልድና ወርሃዊ መዋጮ እና CBE አካውንት መመለሱን ያረጋግጡ
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSimTestType('photo')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                simTestType === 'photo'
                  ? 'bg-amber-50 border-amber-400 shadow-xs'
                  : 'bg-white border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-neutral-900">
                <Camera className="w-4 h-4 text-amber-600" />
                <span>2. የደረሰኝ ፎቶ መላክ</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                የደረሰኝ File ID ተለይቶ በ Firestore &ldquo;receipts&rdquo; መቀመጡንና አድሚን መጠቆሙን ያረጋግጡ
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSimTestType('complaint')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                simTestType === 'complaint'
                  ? 'bg-rose-50 border-rose-400 shadow-xs'
                  : 'bg-white border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-neutral-900">
                <MessageSquareWarning className="w-4 h-4 text-rose-600" />
                <span>3. ቅሬታ መላክ (/complaint)</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                ቅሬታው ተጣርቶ በ Firestore &ldquo;complaints&rdquo; መዝገብ ውስጥ መቀመጡን ያረጋግጡ
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSimTestType('admin_reply');
                setSimAdminReplyText('ቺሁን');
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                simTestType === 'admin_reply'
                  ? 'bg-purple-50 border-purple-400 shadow-xs'
                  : 'bg-white border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-neutral-900">
                <ShieldAlert className="w-4 h-4 text-purple-600" />
                <span>4. የአድሚን መልስ (ቺሁን)</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                አድሚን ቅሬታ ላይ Reply ሲያደርግ ለአባሉ ብቻ መልሱ መተላለፉን እና አዲስ አባል አለመፈጠሩን ያረጋግጡ
              </p>
            </button>
          </div>

          {/* Test Inputs */}
          <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  የሙከራ አባል ይምረጡ (የግል ክፍያ ለማየት)
                </label>
                <select
                  value={simSelectedMemberId}
                  onChange={(e) => {
                    const mId = e.target.value;
                    setSimSelectedMemberId(mId);
                    if (simTestType === 'start') {
                      setSimText(`/start ${mId}`);
                    }
                  }}
                  className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-3 py-2 text-neutral-800"
                >
                  {members.slice(0, 30).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.id} - {m.generation}ኛ ትውልድ - {m.familyName})
                    </option>
                  ))}
                </select>
              </div>

              {simTestType === 'start' && (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    የመልእክት ጽሁፍ (Command)
                  </label>
                  <input
                    type="text"
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder="/start ወይም /start MEM-022"
                    className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-3 py-2 font-mono text-neutral-800"
                  />
                </div>
              )}

              {simTestType === 'photo' && (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    የደረሰኝ መግለጫ (Caption)
                  </label>
                  <input
                    type="text"
                    value={simReceiptCaption}
                    onChange={(e) => setSimReceiptCaption(e.target.value)}
                    placeholder="የክፍያ ደረሰኝ..."
                    className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-3 py-2 text-neutral-800"
                  />
                </div>
              )}

              {simTestType === 'complaint' && (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    የቅሬታው ዝርዝር
                  </label>
                  <input
                    type="text"
                    value={simComplaintText}
                    onChange={(e) => setSimComplaintText(e.target.value)}
                    placeholder="ቅሬታዎን እዚህ ይጻፉ..."
                    className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-3 py-2 text-neutral-800"
                  />
                </div>
              )}

              {simTestType === 'admin_reply' && (
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">
                    የአድሚን መልስ ጽሁፍ (Admin Reply)
                  </label>
                  <input
                    type="text"
                    value={simAdminReplyText}
                    onChange={(e) => setSimAdminReplyText(e.target.value)}
                    placeholder="ቺሁን ወይም የተስተካከለ መረጃ..."
                    className="w-full text-xs bg-white border border-purple-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    አድሚኑ ቅሬታ ላይ Reply ሲያደርግ መልሱ በቀጥታ ለአባሉ ይተላለፋል፤ &quot;ቺሁን&quot; ተብሎ ቢመለስም አዲስ የይስሙላ አባል (MEM-8512) አይፈጠርም።
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-neutral-500">
                የሚላከው ሩት፡ <code>POST /api/telegram-webhook</code>
              </span>
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating}
                className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {simulating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>ሙከራውን አሂድ (Run Webhook Test)</span>
              </button>
            </div>
          </div>

          {/* Test Output Console */}
          {testResult && (
            <div
              className={`p-4 rounded-2xl border text-xs animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2 font-bold mb-2">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {testResult.success
                    ? 'የዌብሁክ ጥሪው በተሳካ ሁኔታ ተፈጽሟል! (HTTP 200 OK)'
                    : 'ሙከራው አልተሳካም'}
                </span>
              </div>
              <p className="text-[11px] opacity-90 mb-2">
                መልእክቱ ወዲያውኑ በ Firestore ተመዝግቧል። ውጤቱን ከታች ባሉት ታቦች መመልከት ይችላሉ።
              </p>
              <pre className="p-3 bg-neutral-900 text-neutral-100 rounded-xl overflow-x-auto text-[11px] font-mono">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Stored Messages in Firestore */}
      {activeTab === 'messages' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-neutral-800">
              በ Firestore &ldquo;telegramMessages&rdquo; የተቀመጡ የቀጥታ መልእክቶች ({messagesList.length})
            </h4>
            <span className="text-[11px] text-neutral-400">ከቅርብ ጊዜ ወደ ኋላ</span>
          </div>

          {messagesList.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
              እስካሁን ምንም የተመዘገበ መልእክት የለም። ከላይ ባለው &ldquo;የቀጥታ ሙከራ&rdquo; ክፍል የመጀመሪያውን መልእክት መሞከር ይችላሉ።
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-2xl overflow-hidden max-h-96 overflow-y-auto">
              {messagesList.map((msg, i) => (
                <div key={msg.id || i} className="p-3.5 hover:bg-neutral-50 text-xs flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-800">
                      {msg.firstName || 'ስም የሌለው'} <span className="font-mono font-normal text-neutral-400">(ID: {msg.fromId})</span>
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleString('am-ET') : ''}
                    </span>
                  </div>
                  <div className="bg-neutral-100/80 px-2.5 py-1 rounded-lg text-neutral-700 font-mono text-[11px] break-all">
                    {msg.text || (msg.fileId ? `[የፎቶ File ID: ${msg.fileId}]` : '(ባዶ መልእክት)')}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-neutral-400">
                    <span>Chat ID: {msg.chatId}</span>
                    <span>Message ID: {msg.messageId}</span>
                    {msg.fileId && <span className="text-amber-600 font-bold">ፎቶ ተያይዟል</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Stored Receipts */}
      {activeTab === 'receipts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-amber-500" />
              <span>የተላኩ የክፍያ ደረሰኞች መዝገብ (&ldquo;receipts&rdquo; ስብስብ)</span>
            </h4>
            <span className="text-[11px] text-neutral-400">ጠቅላላ፡ {receiptsList.length}</span>
          </div>

          {receiptsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
              ምንም የደረሰኝ ፎቶ አልተላከም።
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {receiptsList.map((rcpt, i) => (
                <div key={rcpt.id || i} className="p-3.5 rounded-2xl border border-neutral-200 bg-neutral-50/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900">{rcpt.firstName || 'አባል'}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      {rcpt.status || 'pending'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-600 bg-white p-2 rounded-xl border border-neutral-200">
                    <span className="text-neutral-400 block text-[10px]">Telegram File ID:</span>
                    <span className="break-all">{rcpt.fileId}</span>
                  </div>
                  {rcpt.caption && (
                    <p className="text-[11px] text-neutral-700 italic">
                      &ldquo;{rcpt.caption}&rdquo;
                    </p>
                  )}
                  <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-1 border-t border-neutral-200/50">
                    <span>From ID: {rcpt.fromId}</span>
                    <span>{rcpt.createdAt ? new Date(rcpt.createdAt).toLocaleDateString('am-ET') : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Stored Complaints */}
      {activeTab === 'complaints' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <MessageSquareWarning className="w-4 h-4 text-rose-500" />
              <span>የአባላት ቅሬታዎች እና አስተያየቶች (&ldquo;complaints&rdquo; ስብስብ)</span>
            </h4>
            <span className="text-[11px] text-neutral-400">ጠቅላላ፡ {complaintsList.length}</span>
          </div>

          {complaintsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
              ምንም የተመዘገበ ቅሬታ የለም።
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-2xl overflow-hidden max-h-96 overflow-y-auto">
              {complaintsList.map((comp, i) => (
                <div key={comp.id || i} className="p-3.5 hover:bg-neutral-50 text-xs flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900">
                      {comp.firstName || 'አባል'} <span className="font-mono text-neutral-400">(ID: {comp.fromId})</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800">
                      {comp.status || 'open'}
                    </span>
                  </div>
                  <p className="text-neutral-800 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100 leading-relaxed text-xs">
                    {comp.complaintText}
                  </p>
                  <div className="text-[10px] text-neutral-400 flex items-center justify-between">
                    <span>Chat ID: {comp.chatId}</span>
                    <span>{comp.createdAt ? new Date(comp.createdAt).toLocaleString('am-ET') : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
