import React, { useState, useEffect, useMemo } from 'react';
import {
  Smartphone,
  Globe,
  Lock,
  Send,
  X,
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Copy,
  Radio,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Settings,
  Zap,
  Sun,
  Maximize2,
  LockOpen,
  Power,
  RotateCw,
  Palette,
  Eye,
  Sliders,
  ShieldCheck,
  BatteryCharging,
  Signal
} from 'lucide-react';
import { ALL_DEVICES, getRandomDevice } from '../data/allDevices.ts';
import { getRandomIndonesiaLocation, IndonesiaLocation } from '../data/indonesiaLocations.ts';
import { safeApiFetch } from '../lib/zeDataSync.ts';
import { DotGameLogo } from './DotGameLogo.tsx';

export interface SenderItem {
  id: string;
  phone: string;
  formattedPhone?: string;
  connectedAt?: number;
  status: 'connected' | 'pairing' | 'connecting' | 'disconnected' | 'error';
  pairingCode?: string;
  deviceName?: string;
  lastError?: string;
}

const HOME_TYPING_LINES = [
  'selamat datang bro...',
  'seneng banget lu udah mampir kesini...',
  'pilih aja mau ke SENDER atau BUG di bawah.',
] as const;

const HomeWelcomeTypewriter = React.memo(function HomeWelcomeTypewriter() {
  const [typedLines, setTypedLines] = useState<string[]>(['', '', '']);
  const [activeTypingLine, setActiveTypingLine] = useState<number>(0);
  const [typingDone, setTypingDone] = useState<boolean>(false);
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  useEffect(() => {
    const blinkTimer = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 520);
    return () => clearInterval(blinkTimer);
  }, []);

  useEffect(() => {
    if (typingDone) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;
    let lineIdx = 0;
    let charIdx = 0;

    const step = () => {
      if (cancelled) return;
      const fullLine = HOME_TYPING_LINES[lineIdx];
      if (charIdx < fullLine.length) {
        charIdx += 1;
        const currentSlice = fullLine.slice(0, charIdx);
        setActiveTypingLine(lineIdx);
        setTypedLines((prev) => {
          const next = [...prev];
          next[lineIdx] = currentSlice;
          return next;
        });
        timerId = setTimeout(step, 58);
      } else if (lineIdx < HOME_TYPING_LINES.length - 1) {
        lineIdx += 1;
        charIdx = 0;
        timerId = setTimeout(() => {
          if (!cancelled) {
            setActiveTypingLine(lineIdx);
            step();
          }
        }, 550);
      } else {
        timerId = setTimeout(() => {
          if (!cancelled) {
            setTypingDone(true);
          }
        }, 380);
      }
    };

    timerId = setTimeout(step, 320);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [typingDone]);

  return (
    <div className="max-w-[300px] space-y-2 text-left bg-transparent">
      {HOME_TYPING_LINES.map((_, idx) => {
        const text = typedLines[idx];
        const isVisible = idx <= activeTypingLine || typingDone;
        if (!isVisible && !text) return null;
        const showCursor =
          (!typingDone && idx === activeTypingLine) ||
          (typingDone && idx === HOME_TYPING_LINES.length - 1);
        return (
          <p
            key={idx}
            className="text-[12px] leading-relaxed text-white font-sans font-normal tracking-wide bg-transparent drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
          >
            {text}
            {showCursor && (
              <span
                className={`inline-block w-[1.5px] h-[13px] bg-white align-middle ml-0.5 transition-opacity duration-100 ${
                  cursorVisible ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}
          </p>
        );
      })}
    </div>
  );
});

const LockScreenOverlay = React.memo(function LockScreenOverlay({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const [lockScreenTime, setLockScreenTime] = useState(() =>
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [lockScreenDate, setLockScreenDate] = useState(() =>
    new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLockScreenTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setLockScreenDate(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[1000008] bg-black/95 flex flex-col justify-between p-8 text-center select-none animate-in fade-in duration-100">
      {/* Top Status */}
      <div className="flex items-center justify-between text-white/60 text-[11px] font-slant px-2">
        <span className="flex items-center gap-1.5"><Signal size={12} /> 5G</span>
        <span className="flex items-center gap-1"><Lock size={13} className="text-white" /> TERKUNCI</span>
        <span className="flex items-center gap-1"><BatteryCharging size={13} className="text-white" /> 89%</span>
      </div>

      {/* Center Digital Clock */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-2">
        <div className="text-6xl font-slant text-white font-black tracking-widest drop-shadow-[0_0_24px_rgba(255,255,255,0.4)]">
          {lockScreenTime}
        </div>
        <p className="text-sm font-slant text-white/70 tracking-wider">
          {lockScreenDate}
        </p>

        <div className="mt-6 px-4 py-2 rounded-2xl border border-white/20 bg-white/5 max-w-xs shadow-3d-bl">
          <p className="text-[10px] font-slant text-white/80 tracking-wide">
            ZE.PROJECT SECURE SYSTEM
          </p>
          <p className="text-[9px] text-white/50">
            Semua koneksi terenkripsi &amp; siap beroperasi
          </p>
        </div>
      </div>

      {/* Bottom Unlock Button */}
      <div className="pt-4">
        <button
          type="button"
          onClick={onUnlock}
          className="mx-auto px-8 py-3.5 rounded-full border-2 border-white bg-white/10 hover:bg-white/20 active:scale-95 text-white font-slant text-xs tracking-widest shadow-3d-bl flex items-center justify-center gap-2 cursor-pointer transition-transform duration-75"
        >
          <LockOpen size={16} /> BUKA KUNCI LAYAR
        </button>
      </div>
    </div>
  );
});

export default function LutvoidBugSystem({ onClose }: { onClose: () => void }) {
  // Lock body scroll and set html/body overflow to hidden while modal is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevMargin = document.body.style.margin;
    const prevPadding = document.body.style.padding;

    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0px';
    document.body.style.padding = '0px';

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.margin = prevMargin;
      document.body.style.padding = prevPadding;
    };
  }, []);

  // Current view: 'home' (Video 1) | 'console' (Video 2) | 'sender' (Halaman Sender Hitam) | 'control' (Control Menu)
  const [currentView, setCurrentView] = useState<'home' | 'console' | 'sender' | 'control'>('home');

  // Control Simulator Visual & Hardware States
  const [screenPower, setScreenPower] = useState<boolean>(true);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isFlashlightOn, setIsFlashlightOn] = useState<boolean>(false);
  const [isLockScreenOpen, setIsLockScreenOpen] = useState<boolean>(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  // Toggle selection state for Control Panel cards (default: null / unselected)
  const [selectedControlCard, setSelectedControlCard] = useState<'power' | 'target_screen' | 'flashlight' | 'lockscreen' | null>(null);

  // Target input & selections in Console (default: null / unselected when opened)
  const [targetInput, setTargetInput] = useState('');
  const [selectedTargetType, setSelectedTargetType] = useState<'nomor' | 'group' | null>(null);
  const [selectedPayload, setSelectedPayload] = useState<'foreclose' | 'crash_lag' | null>(null);
  const [selectedSenderSource, setSelectedSenderSource] = useState<'global' | 'private' | null>(null);

  // Senders list state loaded directly from backend WhatsApp engine (/api/wa/senders)
  const [senders, setSenders] = useState<SenderItem[]>([]);
  const [isLoadingSenders, setIsLoadingSenders] = useState(false);

  const activeSenderCount = useMemo(() => {
    return senders.filter((s) => s.status === 'connected').length;
  }, [senders]);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchRealSenders = async (silent = true) => {
    if (!silent) setIsLoadingSenders(true);
    try {
      const res = await safeApiFetch<{ success?: boolean; senders?: any[] }>('/api/wa/senders', {
        timeoutMs: 6000
      });
      if (res.ok && res.data?.success && Array.isArray(res.data.senders)) {
        setSenders(
          res.data.senders.map((s) => ({
            id: String(s.id),
            phone: String(s.formattedPhone || (s.phone ? `+${s.phone}` : s.id)),
            formattedPhone: s.formattedPhone,
            connectedAt: s.connectedAt,
            status: s.status || 'disconnected',
            pairingCode: s.pairingCode,
            deviceName: s.deviceName || 'WhatsApp Linked Device',
            lastError: s.lastError
          }))
        );
      }
    } catch {
      if (!silent) showToast('Gagal memuat daftar sender dari server');
    } finally {
      if (!silent) setIsLoadingSenders(false);
    }
  };

  useEffect(() => {
    fetchRealSenders(true);
  }, []);

  // =========================================================================
  // INPUT VALIDATION LOGIC
  // =========================================================================
  const isInputValid = useMemo(() => {
    if (!selectedTargetType) return false;
    const val = targetInput.trim();
    if (!val) return false;

    if (selectedTargetType === 'nomor') {
      const digitsOnly = val.replace(/\D/g, '');
      const hasLetters = /[a-zA-Z]/.test(val);
      if (hasLetters) return false;
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    } else {
      return val.startsWith('https://') && val.length > 15;
    }
  }, [targetInput, selectedTargetType]);

  const validationError = useMemo(() => {
    if (!selectedTargetType) return null;
    const val = targetInput.trim();
    if (!val) return null;

    if (selectedTargetType === 'nomor') {
      const hasLetters = /[a-zA-Z]/.test(val);
      if (hasLetters) {
        return 'Nomor tidak valid (hanya boleh angka)';
      }
      const digitsOnly = val.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        return `Nomor tidak valid (minimal 10 digit angka, saat ini: ${digitsOnly.length})`;
      }
      if (digitsOnly.length > 15) {
        return 'Nomor tidak valid (maksimal 15 digit angka)';
      }
      return null;
    } else {
      if (!val.startsWith('https://')) {
        return 'Tautan grup tidak valid (harus diawali https://)';
      }
      return null;
    }
  }, [targetInput, selectedTargetType]);

  // =========================================================================
  // SENDER PAIRING LOGIC (REAL WHATSAPP 8-DIGIT PAIRING CODE VIA BAILEYS)
  // =========================================================================
  const [showAddSenderModal, setShowAddSenderModal] = useState(false);
  const [inputPhone, setInputPhone] = useState('');
  const [pairingStep, setPairingStep] = useState<'input' | 'code' | 'success'>('input');
  const [generatedPairingCode, setGeneratedPairingCode] = useState('');
  const [activePairingSenderId, setActivePairingSenderId] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'pairing' | 'connecting' | 'connected' | 'disconnected' | 'error'>('pairing');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [countdown, setCountdown] = useState(180);

  useEffect(() => {
    let timer: any;
    if (showAddSenderModal && pairingStep === 'code' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => (c > 1 ? c - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showAddSenderModal, pairingStep, countdown]);

  // Poll real Baileys WhatsApp connection status while awaiting device link
  useEffect(() => {
    if (!showAddSenderModal || pairingStep !== 'code' || !activePairingSenderId) return;

    let cancelled = false;
    const pollStatus = async () => {
      const res = await safeApiFetch<{ success?: boolean; sender?: any }>(
        `/api/wa/status/${encodeURIComponent(activePairingSenderId)}`,
        { timeoutMs: 5000 }
      );
      if (cancelled || !res.ok || !res.data?.success || !res.data.sender) return;

      const s = res.data.sender;
      setPairingStatus(s.status);
      if (s.lastError) setPairingError(s.lastError);

      if (s.status === 'connected') {
        await fetchRealSenders(true);
        setPairingStep('success');
        showToast(`✅ WhatsApp ${s.formattedPhone || inputPhone} benar-benar terhubung!`);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [showAddSenderModal, pairingStep, activePairingSenderId]);

  const handleRequestPairingCode = async () => {
    const cleanDigits = inputPhone.trim().replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 10 || cleanDigits.length > 15) {
      showToast('⚠️ Masukkan nomor WhatsApp valid (10-15 digit angka)!');
      return;
    }

    setIsRequestingPairing(true);
    setPairingError(null);
    try {
      const res = await safeApiFetch<{
        success?: boolean;
        sender?: any;
        pairingCode?: string;
        message?: string;
      }>('/api/wa/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanDigits }),
        timeoutMs: 25000
      });

      if (!res.ok || !res.data?.success) {
        const errMsg = res.data?.message || 'Gagal meminta kode pairing resmi WhatsApp.';
        setPairingError(errMsg);
        showToast('⚠️ ' + errMsg);
        return;
      }

      const sender = res.data.sender;
      if (sender?.id) setActivePairingSenderId(String(sender.id));

      if (sender?.status === 'connected') {
        await fetchRealSenders(true);
        setPairingStatus('connected');
        setPairingStep('success');
        showToast(`✅ WhatsApp ${sender.formattedPhone || cleanDigits} sudah terhubung!`);
        return;
      }

      const code = res.data.pairingCode || sender?.pairingCode || '';
      if (!code) {
        const msg = 'Server belum menerima kode pairing dari WhatsApp.';
        setPairingError(msg);
        showToast('⚠️ ' + msg);
        return;
      }

      setGeneratedPairingCode(code);
      setPairingStatus('pairing');
      setPairingStep('code');
      setCountdown(180);
      await fetchRealSenders(true);
    } finally {
      setIsRequestingPairing(false);
    }
  };

  const handleConfirmLinked = async () => {
    if (!activePairingSenderId) {
      showToast('⚠️ Sesi pairing tidak ditemukan.');
      return;
    }
    const res = await safeApiFetch<{ success?: boolean; sender?: any }>(
      `/api/wa/status/${encodeURIComponent(activePairingSenderId)}`,
      { timeoutMs: 5000 }
    );
    const sender = res.ok && res.data?.success ? res.data.sender : null;
    if (sender?.status === 'connected') {
      await fetchRealSenders(true);
      setPairingStatus('connected');
      setPairingStep('success');
      showToast(`✅ WhatsApp ${sender.formattedPhone || inputPhone} berhasil terhubung!`);
    } else {
      const errMsg = 'Belum terhubung! Masukkan kode 8 digit di WhatsApp HP Anda terlebih dahulu.';
      setPairingError(errMsg);
      showToast('⚠️ ' + errMsg);
    }
  };

  const handleCopyCode = () => {
    if (!generatedPairingCode) return;
    navigator.clipboard?.writeText(generatedPairingCode);
    setCopiedCode(true);
    showToast('Kode berhasil disalin: ' + generatedPairingCode);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDeleteSender = async (id: string) => {
    await safeApiFetch(`/api/wa/senders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      timeoutMs: 6000
    }).catch(() => {});
    setSenders((prev) => prev.filter((s) => s.id !== id));
    showToast('Sender berhasil dihapus');
  };

  // =========================================================================
  // FAKE TRANSMISSION LOADING (Gimmick Animasi Loading Seolah Beneran)
  // =========================================================================
  const [isSendingBug, setIsSendingBug] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendStepText, setSendStepText] = useState('');
  const [sendDone, setSendDone] = useState(false);
  const canSendBug = Boolean(selectedTargetType) && isInputValid && Boolean(selectedPayload) && activeSenderCount > 0;

  // =========================================================================
  // DEVICE & INDONESIA LOCATION ANALYSIS SYSTEM
  // =========================================================================
  const [deviceAnalysisStatus, setDeviceAnalysisStatus] = useState<'idle' | 'analyzing' | 'done'>('idle');
  const [simulatedDevice, setSimulatedDevice] = useState<{ fullName: string; model: string; os: string } | null>(null);
  const [simulatedLocation, setSimulatedLocation] = useState<IndonesiaLocation | null>(null);

  // Target Device Validation: Target number must be valid + analysis complete
  const isTargetDeviceReady = useMemo(() => {
    return (
      Boolean(selectedTargetType === 'nomor') &&
      isInputValid &&
      deviceAnalysisStatus === 'done' &&
      simulatedDevice !== null
    );
  }, [selectedTargetType, isInputValid, deviceAnalysisStatus, simulatedDevice]);

  // Target Reset Simulator States (Isolated from global UI state)
  const [showTargetResetConfirm, setShowTargetResetConfirm] = useState(false);
  const [isResettingTarget, setIsResettingTarget] = useState(false);
  const [targetResetProgress, setTargetResetProgress] = useState(0);
  const [targetResetStep, setTargetResetStep] = useState('');
  const [targetResetDone, setTargetResetDone] = useState(false);
  const [targetDeviceStatusLabel, setTargetDeviceStatusLabel] = useState('ONLINE / READY');
  const [lastUpdatedTime, setLastUpdatedTime] = useState('');

  useEffect(() => {
    if (!selectedTargetType || selectedTargetType === 'group') {
      setDeviceAnalysisStatus('idle');
      setSimulatedDevice(null);
      setSimulatedLocation(null);
      return;
    }

    const val = targetInput.trim();
    if (!val) {
      setDeviceAnalysisStatus('idle');
      setSimulatedDevice(null);
      setSimulatedLocation(null);
      return;
    }

    setDeviceAnalysisStatus('analyzing');
    const timer = setTimeout(() => {
      setSimulatedDevice(getRandomDevice());
      setSimulatedLocation(getRandomIndonesiaLocation());
      setDeviceAnalysisStatus('done');
      const now = new Date();
      setLastUpdatedTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
      setTargetDeviceStatusLabel('ONLINE / READY');
    }, 1500);

    return () => clearTimeout(timer);
  }, [targetInput, selectedTargetType]);

  const handleRandomizeDeviceAndLocation = () => {
    if (!selectedTargetType || selectedTargetType === 'group' || !targetInput.trim()) return;
    setDeviceAnalysisStatus('analyzing');
    showToast('↻ Memperbarui konfigurasi perangkat & node jaringan...');
    setTimeout(() => {
      const nextDev = getRandomDevice();
      const nextLoc = getRandomIndonesiaLocation();
      setSimulatedDevice(nextDev);
      setSimulatedLocation(nextLoc);
      setDeviceAnalysisStatus('done');
      const now = new Date();
      setLastUpdatedTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
      setTargetDeviceStatusLabel('ONLINE / READY');
      showToast(`Data diperbarui: ${nextDev.model} • ${nextLoc.kotaKabupaten}`);
    }, 1500);
  };

  // Target Reset Execution (Does not wipe the UI/form state)
  const handleStartTargetReset = () => {
    if (!isTargetDeviceReady) return;
    setShowTargetResetConfirm(false);
    setIsResettingTarget(true);
    setTargetResetProgress(5);
    setTargetResetDone(false);
    setTargetResetStep('Mengirim sinyal reset ke session gateway target...');

    setTimeout(() => {
      setTargetResetProgress(28);
      setTargetResetStep(`Menutup proses background pada ${simulatedDevice?.model || 'Target'}...`);
    }, 600);

    setTimeout(() => {
      setTargetResetProgress(62);
      setTargetResetStep('Menginisialisasi soft reboot sistem target...');
    }, 1300);

    setTimeout(() => {
      setTargetResetProgress(88);
      setTargetResetStep('Memverifikasi status cache & memori...');
    }, 2000);

    setTimeout(() => {
      setTargetResetProgress(100);
      setTargetResetStep('Proses reset target selesai! Sistem berhasil di-reboot.');
      setTargetResetDone(true);
      setTargetDeviceStatusLabel('REBOOTED / STABLE');
      const now = new Date();
      setLastUpdatedTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
      showToast(`Target ${simulatedDevice?.model} berhasil di-reset`);
    }, 2800);
  };

  const handleExecuteGlobalReset = () => {
    setTargetInput('');
    setSelectedTargetType(null);
    setSelectedPayload(null);
    setSelectedSenderSource(null);
    setSelectedControlCard(null);
    setDeviceAnalysisStatus('idle');
    setSimulatedDevice(null);
    setSimulatedLocation(null);
    // Reset all control parameters
    setScreenPower(true);
    setIsFullScreen(false);
    setIsFlashlightOn(false);
    setIsLockScreenOpen(false);
    setShowResetConfirmModal(false);
    showToast('Seluruh konfigurasi berhasil diatur ulang');
  };

  const handleStartSendBug = async () => {
    if (!selectedTargetType) {
      showToast('⚠️ Silakan pilih mode BUG NOMOR atau BAN GRUB!');
      return;
    }

    if (!selectedPayload) {
      showToast('⚠️ Silakan pilih tipe bug terlebih dahulu!');
      return;
    }

    const connectedSender = senders.find((s) => s.status === 'connected');
    if (!connectedSender || activeSenderCount === 0) {
      showToast('⚠️ Sender belum terhubung! Tautkan WhatsApp sender terlebih dahulu.');
      return;
    }

    if (!isInputValid) {
      showToast('⚠️ Harap isi target dengan format yang valid!');
      return;
    }

    setIsSendingBug(true);
    setSendProgress(15);
    setSendDone(false);
    setSendStepText('Menghubungkan ke sesi WhatsApp Sender...');

    setTimeout(() => {
      setSendProgress((p) => (p < 55 ? 55 : p));
      setSendStepText(`Mengirim vector payload [${(selectedPayload || 'PAYLOAD').toUpperCase()}]...`);
    }, 350);

    try {
      const res = await safeApiFetch<{ success?: boolean; message?: string }>('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: connectedSender.id,
          target: targetInput.trim(),
          targetType: selectedTargetType,
          payloadType: selectedPayload
        }),
        timeoutMs: 25000
      });

      if (res.ok && res.data?.success) {
        setSendProgress(100);
        setSendStepText(res.data.message || 'Transmisi selesai! Payload berhasil dikirimkan.');
        setSendDone(true);
        showToast(res.data.message || 'Berhasil dikirim melalui WhatsApp!');
      } else {
        const errMsg = res.data?.message || 'Gagal mengirim melalui WhatsApp Sender.';
        setSendProgress(100);
        setSendStepText('Gagal: ' + errMsg);
        setSendDone(true);
        showToast('⚠️ ' + errMsg);
      }
    } catch {
      setSendProgress(100);
      setSendStepText('Gagal menghubungi server WhatsApp gateway.');
      setSendDone(true);
      showToast('⚠️ Koneksi server WhatsApp gagal.');
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] w-screen h-screen h-[100dvh] max-h-[100dvh] m-0 p-0 overflow-hidden flex flex-col font-slant select-none bg-transparent">
      
      {/* =================================================================== */}
      {/* 1. LAYER BACKGROUND SINKRON: Tembus langsung ke VideoBackground     */}
      {/* =================================================================== */}
      <div className="fixed inset-0 -z-10 w-full h-full bg-black/40 pointer-events-none select-none" />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000000] bg-black/95 text-white px-5 py-2.5 rounded-full shadow-3d-bl text-xs flex items-center gap-2 border border-white/30">
          <AlertCircle size={14} className="text-white shrink-0" />
          <span className="font-slant tracking-wide">{toastMessage}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. HALAMAN BERANDA MENU BUG (LUAR SAJA - TYPEWRITER + 2 MENU KECIL)  */}
      {/* =================================================================== */}
      {currentView === 'home' && (
        <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-transparent">
          {/* Top Bar: VNJAVA.PROJECT & Exit Button */}
          <div className="relative z-20 pt-4 px-5 flex items-center justify-between">
            <h1 className="text-sm tracking-wider text-white font-slant drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              VNJAVA.PROJECT
            </h1>

            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-full bg-black/65 hover:bg-black/90 border border-white/25 text-white text-[11px] font-slant flex items-center gap-1.5 cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
            >
              <X size={14} /> KELUAR
            </button>
          </div>

          {/* Top-Left Typewriter Text (tanpa bubble putih, transparan di atas background hitam grid) */}
          <div className="relative z-20 flex-1 pt-7 px-5 flex flex-col items-start justify-start">
            <HomeWelcomeTypewriter />
          </div>

          {/* Bottom Small Menus: [SENDER] & [BUG] langsung muncul dari awal */}
          <div className="relative z-20 pb-8 px-6 min-h-[64px] flex items-center justify-center">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentView('sender')}
                className="px-4 py-1.5 rounded-full bg-black/65 hover:bg-black/90 border border-white/25 text-white text-[11px] font-slant tracking-wider flex items-center gap-1.5 cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
              >
                <Smartphone size={12} className="text-white/85" />
                <span>SENDER</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('console')}
                className="px-4 py-1.5 rounded-full bg-black/65 hover:bg-black/90 border border-white/25 text-white text-[11px] font-slant tracking-wider flex items-center gap-1.5 cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
              >
                <DotGameLogo size={14} glow={false} />
                <span>BUG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. HALAMAN MENU BUG CONSOLE (VIDEO 2)                              */}
      {/* =================================================================== */}
      {currentView === 'console' && (
        <div className="relative w-full h-full flex flex-col bg-transparent overflow-y-auto no-scrollbar">
          
          {/* Sticky Header with translucent glass */}
          <div className="sticky top-0 z-30 bg-black/75 px-4 py-3 flex items-center justify-between border-b border-white/15">
            <button
              onClick={() => setCurrentView('home')}
              className="px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white text-[11px] font-slant flex items-center gap-1.5 cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
            >
              <ArrowLeft size={14} /> KEMBALI
            </button>

            <span className="text-xs font-slant text-white tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              CONSOLE PANEL
            </span>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
            >
              <X size={15} />
            </button>
          </div>

          {/* Console Main Body Container */}
          <div className="p-4 space-y-4 max-w-md mx-auto w-full pb-8">
            
            {/* Top Banner Card: Halo Girl Video with ZE.io PROJECT label */}
            <div className="ze-bug-gpu-card relative w-full h-44 rounded-[26px] overflow-hidden border border-white/25 shadow-3d-bl bg-black/80 flex items-center justify-center">
              <video
                src="/assets/aistudio/ssstik.io_1793231239969_f00ac994_c5cdd032.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40 pointer-events-none" />

              {/* Top-Left Title Overlay matching Video 2 */}
              <div className="absolute top-3.5 left-4 pointer-events-none">
                <h2 className="text-base font-slant text-white tracking-wider drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  VNJAVA
                </h2>
                <h3 className="text-lg font-slant text-white tracking-widest drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] -mt-1">
                  PROJECT
                </h3>
              </div>
            </div>

            {/* Target Input Field (Point 2 & Point 3) */}
            <div className="space-y-1.5">
              <div className={`relative w-full rounded-full border bg-black/65 px-4 py-3 shadow-3d-bl flex items-center gap-2 ${
                validationError ? 'border-red-500/80' : isInputValid ? 'border-emerald-500/60 focus-within:border-white' : 'border-white/30 focus-within:border-white'
              }`}>
                <span className="text-xs text-white/70 font-slant whitespace-nowrap">
                  {selectedTargetType === 'group' ? 'TAUTAN GRUB |' : selectedTargetType === 'nomor' ? 'NO |' : 'TARGET |'}
                </span>
                <input
                  type="text"
                  placeholder={selectedTargetType === 'group' ? 'https://chat.whatsapp.com/...' : '08123456789 atau 628xxx'}
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-full bg-transparent text-sm text-white font-slant tracking-wider outline-none placeholder:text-white/30"
                />
                {targetInput && (
                  <button
                    onClick={() => setTargetInput('')}
                    className="text-white/40 hover:text-white cursor-pointer shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Validation Error Message */}
              {validationError && (
                <p className="text-[11px] text-red-500 font-slant px-3 tracking-wide">
                  ⚠️ {validationError}
                </p>
              )}
            </div>

            {/* Row 1: BUG NOMOR vs BAN GRUB (TOGGLE SELECTION) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedTargetType((prev) => (prev === 'nomor' ? null : 'nomor'));
                  setTargetInput('');
                }}
                className={`py-3 rounded-full text-xs font-slant tracking-wider transition-transform duration-75 active:scale-95 cursor-pointer flex items-center justify-center ${
                  selectedTargetType === 'nomor'
                    ? 'border-2 border-white shadow-3d-bl-active bg-white/20 text-white'
                    : 'border border-white/15 shadow-3d-bl bg-black/60 text-white/75 hover:text-white hover:border-white/30'
                }`}
              >
                BUG NOMOR
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTargetType((prev) => (prev === 'group' ? null : 'group'));
                  setTargetInput('');
                }}
                className={`py-3 rounded-full text-xs font-slant tracking-wider transition-transform duration-75 active:scale-95 cursor-pointer flex items-center justify-center ${
                  selectedTargetType === 'group'
                    ? 'border-2 border-white shadow-3d-bl-active bg-white/20 text-white'
                    : 'border border-white/15 shadow-3d-bl bg-black/60 text-white/75 hover:text-white hover:border-white/30'
                }`}
              >
                BAN GRUB
              </button>
            </div>

            {/* Row 2: Payload Cards (TOGGLE SELECTION) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Card: Z3FORCECLOSE / KICK SEMUA ANGGOTA */}
              <button
                type="button"
                onClick={() => setSelectedPayload((prev) => (prev === 'foreclose' ? null : 'foreclose'))}
                className={`ze-bug-gpu-card aspect-[1.1] rounded-[24px] p-3 sm:p-4 flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedPayload === 'foreclose'
                    ? 'border-2 border-white shadow-3d-bl-active bg-white/20 text-white'
                    : 'border border-white/15 shadow-3d-bl bg-black/60 text-white/70 hover:border-white/30'
                }`}
              >
                <span className="text-xs sm:text-sm font-slant tracking-wider text-white text-center leading-snug px-1">
                  {selectedTargetType === 'group' ? 'KICK SEMUA ANGGOTA' : 'Z3FORCECLOSE'}
                </span>
              </button>

              {/* Right Card: CRASH LAG / REPORT MASSAL GRUB */}
              <button
                type="button"
                onClick={() => setSelectedPayload((prev) => (prev === 'crash_lag' ? null : 'crash_lag'))}
                className={`ze-bug-gpu-card aspect-[1.1] rounded-[24px] p-3 sm:p-4 flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedPayload === 'crash_lag'
                    ? 'border-2 border-white shadow-3d-bl-active bg-white/20 text-white'
                    : 'border border-white/15 shadow-3d-bl bg-black/60 text-white/70 hover:border-white/30'
                }`}
              >
                <span className="text-xs sm:text-sm font-slant tracking-wider text-white text-center leading-snug px-1">
                  {selectedTargetType === 'group' ? 'REPORT MASSAL GRUB' : 'CRASH LAG'}
                </span>
              </button>
            </div>

            {/* Row 3: SENDER STATUS CARDS (TOGGLE SELECTION) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Card: SENDER GLOBAL */}
              <button
                type="button"
                onClick={() => {
                  setSelectedSenderSource((prev) => (prev === 'global' ? null : 'global'));
                  showToast('⚠️ Sender Global belum tersedia! Silakan tautkan Sender Pribadi.');
                }}
                className={`ze-bug-gpu-card py-3.5 px-3 rounded-[22px] flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 relative overflow-hidden group cursor-pointer ${
                  selectedSenderSource === 'global'
                    ? 'border-2 border-white shadow-3d-bl-active bg-white/20 text-white'
                    : 'border border-white/15 shadow-3d-bl bg-black/55 text-white/70 hover:border-white/30'
                }`}
              >
                <Globe size={18} className="text-white/50 mb-1" />
                <span className="text-[10px] font-slant text-amber-400/90 tracking-wider">
                  SENDER GLOBAL
                </span>
              </button>

              {/* Right Card: SENDER AKTIF */}
              <button
                type="button"
                onClick={() => {
                  setSelectedSenderSource((prev) => (prev === 'private' ? null : 'private'));
                  if (activeSenderCount === 0) {
                    setCurrentView('sender');
                  }
                }}
                className={`ze-bug-gpu-card py-3.5 px-3 rounded-[22px] flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedSenderSource === 'private'
                    ? 'border-2 border-white shadow-3d-bl-active bg-white/20 text-white'
                    : 'border border-white/15 shadow-3d-bl bg-black/60 text-white/70 hover:border-white/30'
                }`}
              >
                <div className="relative mb-1">
                  <Lock size={18} className={activeSenderCount > 0 ? 'text-white' : 'text-white/70'} />
                  <span
                    className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                      activeSenderCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                    }`}
                  />
                </div>
                <span
                  className={`text-[10px] font-slant tracking-wider ${
                    activeSenderCount > 0
                      ? 'text-emerald-400 animate-pulse'
                      : 'text-red-500'
                  }`}
                >
                  SENDER AKTIF: {activeSenderCount}
                </span>
              </button>
            </div>

            {/* SEND BUG Button (Disabled if target invalid OR sender not active) */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleStartSendBug}
                disabled={!canSendBug}
                className={`w-full py-4 rounded-full border-2 text-white font-slant text-sm tracking-widest flex items-center justify-center gap-2.5 shadow-3d-bl transition-transform duration-75 ${
                  canSendBug
                    ? 'bg-black/75 border-white hover:bg-white/15 active:scale-95 cursor-pointer'
                    : 'bg-black/50 border-white/20 text-white/30 cursor-not-allowed opacity-50'
                }`}
              >
                <span>SEND BUG</span>
                <Send size={16} className={canSendBug ? 'text-white' : 'text-white/30'} />
              </button>

              {/* Warning when Sender is not active */}
              {activeSenderCount === 0 && (
                <div className="flex items-center justify-between bg-red-950/40 border border-red-500/35 rounded-2xl px-3.5 py-2 shadow-3d-bl">
                  <span className="text-[10px] text-red-400 font-slant tracking-wide flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    SENDER TIDAK AKTIF (TIDAK BISA KIRIM)
                  </span>
                  <button
                    onClick={() => setCurrentView('sender')}
                    className="text-[10px] text-white underline font-slant cursor-pointer hover:text-emerald-400 shrink-0 ml-2"
                  >
                    TAUTKAN &gt;
                  </button>
                </div>
              )}
            </div>

            {/* ============================================================= */}
            {/* DEVICE INFO CONTAINER (Gimmick Fake Only)                    */}
            {/* ============================================================= */}
            <div className="ze-bug-gpu-card rounded-[26px] border border-white/25 bg-black/65 p-3.5 shadow-3d-bl space-y-2.5">
              {/* Header Title */}
              <div className="text-center">
                <span className="text-xs font-slant text-white tracking-widest drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                  DEVICE INFO
                </span>
              </div>

              {/* Two Sub-Boxes Side by Side */}
              <div className="grid grid-cols-2 gap-2.5">
                
                {/* 1. KOTAK KIRI: DEVICE INFO */}
                <div className="rounded-[20px] border border-white/20 bg-black/60 p-3 flex flex-col justify-between min-h-[165px] shadow-3d-bl">
                  <div className="pb-1 border-b border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-slant text-white/50 tracking-wider">
                      DEVICE INFO
                    </span>
                    {targetInput.trim() && deviceAnalysisStatus === 'done' && (
                      <button
                        type="button"
                        onClick={handleRandomizeDeviceAndLocation}
                        title="Acak Model"
                        className="text-white/40 hover:text-white transition cursor-pointer p-0.5"
                      >
                        <RefreshCw size={11} />
                      </button>
                    )}
                  </div>

                  {selectedTargetType === 'group' ? (
                    <div className="flex-1 flex items-center justify-center text-center p-1">
                      <span className="text-[10px] font-slant text-white/50 tracking-wide leading-relaxed">
                        Tidak tersedia untuk mode grub
                      </span>
                    </div>
                  ) : !targetInput.trim() ? (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-lg font-slant text-white/40 tracking-widest">-</span>
                    </div>
                  ) : deviceAnalysisStatus === 'analyzing' ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center py-2">
                      <RefreshCw size={14} className="text-white/60 animate-spin" />
                      <span className="text-[10px] font-slant text-white/70 tracking-wider animate-pulse">
                        Menganalisis...
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1 text-left text-[10px] font-slant leading-tight py-1">
                      <p className="text-white/60">
                        DEVICE: <span className="text-white">{simulatedDevice?.model || 'Samsung Galaxy S25'}</span>
                      </p>
                      <p className="text-white/60">
                        OS: <span className="text-emerald-400">{simulatedDevice?.os || 'Android 14'}</span>
                      </p>
                      <p className="text-white/50 text-[8.5px] truncate">
                        SPEC: <span className="text-white/90">{simulatedDevice?.fullName}</span>
                      </p>
                    </div>
                  )}

                  {/* Di bawah nama device: 2 tombol RESET dan CONTROL berdampingan */}
                  {selectedTargetType !== 'group' && (
                    <div className="pt-2 mt-auto">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={!isTargetDeviceReady}
                          onClick={() => {
                            if (isTargetDeviceReady) setShowTargetResetConfirm(true);
                          }}
                          className={`py-1.5 px-1.5 rounded-lg text-[9px] font-slant flex items-center justify-center gap-1 transition ${
                            isTargetDeviceReady
                              ? 'border border-red-500/80 text-red-400 bg-red-500/10 hover:bg-red-500/20 active:scale-95 cursor-pointer shadow-3d-bl'
                              : 'bg-black/40 border border-white/10 text-white/30 cursor-not-allowed opacity-40 shadow-none pointer-events-none'
                          }`}
                        >
                          <RotateCcw size={10} className="shrink-0" />
                          <span>RESET</span>
                        </button>

                        <button
                          type="button"
                          disabled={!isTargetDeviceReady}
                          onClick={() => {
                            if (isTargetDeviceReady) setCurrentView('control');
                          }}
                          className={`py-1.5 px-1.5 rounded-lg text-[9px] font-slant flex items-center justify-center gap-1 transition ${
                            isTargetDeviceReady
                              ? 'border border-blue-500/80 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 active:scale-95 cursor-pointer shadow-3d-bl'
                              : 'bg-black/40 border border-white/10 text-white/30 cursor-not-allowed opacity-40 shadow-none pointer-events-none'
                          }`}
                        >
                          <Settings size={10} className="shrink-0" />
                          <span>CONTROL</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. KOTAK KANAN: LOCATION (Sistem Lokasi Indonesia) */}
                <div className="rounded-[20px] border border-white/20 bg-black/60 p-3 flex flex-col justify-between min-h-[165px] shadow-3d-bl">
                  <div className="pb-1 border-b border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-slant text-white/50 tracking-wider">
                      LOCATION
                    </span>
                    {targetInput.trim() && deviceAnalysisStatus === 'done' && (
                      <span className="text-[9px] text-emerald-400 font-slant">
                        {simulatedLocation?.latencyMs || 14}ms
                      </span>
                    )}
                  </div>

                  {selectedTargetType === 'group' ? (
                    <div className="flex-1 flex items-center justify-center text-center p-1">
                      <span className="text-[10px] font-slant text-white/50 tracking-wide leading-relaxed">
                        Tidak tersedia untuk mode grub
                      </span>
                    </div>
                  ) : !targetInput.trim() ? (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-lg font-slant text-white/40 tracking-widest">-</span>
                    </div>
                  ) : deviceAnalysisStatus === 'analyzing' ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center py-2">
                      <RefreshCw size={14} className="text-white/60 animate-spin" />
                      <span className="text-[10px] font-slant text-white/70 tracking-wider animate-pulse">
                        Menganalisis...
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1 text-left text-[9.5px] font-slant leading-tight py-1">
                      <p className="text-white/60 truncate">
                        PROVINSI: <span className="text-white">{simulatedLocation?.provinsi || 'DKI Jakarta'}</span>
                      </p>
                      <p className="text-white/60 truncate">
                        KOTA: <span className="text-white">{simulatedLocation?.kotaKabupaten || 'Jakarta Selatan'}</span>
                      </p>
                      <p className="text-white/60 truncate">
                        KECAMATAN: <span className="text-white">{simulatedLocation?.kecamatan || 'Kebayoran Baru'}</span>
                      </p>
                      <p className="text-white/60 truncate">
                        KELURAHAN: <span className="text-white">{simulatedLocation?.kelurahan || 'Senayan'}</span>
                      </p>
                      <p className="text-white/60 truncate">
                        NODE: <span className="text-white">{simulatedLocation?.nodeName || 'JKT-CORE-01'}</span>
                      </p>
                      <p className="text-white/50 text-[8.5px] truncate">
                        WILAYAH: <span className="text-white/80">{simulatedLocation?.wilayahOperasional || 'Jabodetabek'}</span>
                      </p>
                    </div>
                  )}

                  {/* Kotak kanan tidak ada tombol */}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. HALAMAN MENU SENDER SEBELUMNYA (TEMA HITAM TRANSLUSEN)          */}
      {/* =================================================================== */}
      {currentView === 'sender' && (
        <div className="relative w-full h-full flex flex-col bg-transparent overflow-y-auto no-scrollbar">
          
          {/* Header */}
          <div className="sticky top-0 z-30 bg-black/75 px-4 py-3 flex items-center justify-between border-b border-white/15">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('console')}
                className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-slant text-sm text-white tracking-wider leading-tight">BUG SENDER</h3>
                <p className={`text-[10px] font-slant ${activeSenderCount > 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                  {activeSenderCount} SENDER AKTIF
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                fetchRealSenders(false);
                showToast('Memperbarui daftar sender...');
              }}
              className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer shadow-3d-bl active:scale-95 transition-transform duration-75"
            >
              <RefreshCw size={14} className={isLoadingSenders ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Senders Content */}
          <div className="p-4 space-y-4 max-w-md mx-auto w-full pb-8">
            
            {/* Info Box */}
            <div className="ze-bug-gpu-card bg-black/65 border border-white/25 rounded-[24px] p-4 shadow-3d-bl">
              <div className="flex items-center gap-3">
                <Smartphone size={22} className="text-white shrink-0" />
                <div>
                  <h4 className="text-xs font-slant text-white tracking-wider">
                    LOGIN WHATSAPP LINKED DEVICE
                  </h4>
                  <p className="text-[10px] text-white/60 mt-0.5">
                    Tautkan perangkat dengan kode 8 digit resmi WhatsApp.
                  </p>
                </div>
              </div>
            </div>

            {/* Senders List (Empty State if 0) */}
            {senders.length === 0 ? (
              <div className="ze-bug-gpu-card my-6 flex flex-col items-center text-center p-6 bg-black/65 border border-white/25 rounded-[28px] shadow-3d-bl">
                <div className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center bg-white/5 mb-3">
                  <Smartphone size={24} className="text-white/40" />
                </div>
                <h3 className="font-slant text-sm text-white tracking-wider">BELUM ADA SENDER</h3>
                <p className="text-[11px] text-white/60 max-w-xs mt-1 font-sans">
                  Tambahkan WhatsApp sender pertama untuk mulai transmisi payload.
                </p>

                <button
                  onClick={() => {
                    setPairingStep('input');
                    setInputPhone('');
                    setPairingError(null);
                    setActivePairingSenderId(null);
                    setShowAddSenderModal(true);
                  }}
                  className="mt-5 bg-white text-black font-slant text-xs px-6 py-2.5 rounded-full hover:bg-white/90 active:scale-95 transition-transform duration-75 cursor-pointer shadow-3d-bl"
                >
                  + TAMBAH SENDER
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {senders.map((s) => {
                  const isConnected = s.status === 'connected';
                  return (
                    <div
                      key={s.id}
                      className="ze-bug-gpu-card bg-black/65 border border-white/25 rounded-[24px] p-4 flex items-center justify-between shadow-3d-bl"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full border flex items-center justify-center ${isConnected ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
                          <Radio size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-slant text-white tracking-wider">{s.phone}</p>
                          <p className={`text-[10px] font-slant flex items-center gap-1.5 mt-0.5 ${isConnected ? 'text-emerald-400' : 'text-amber-300'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                            {isConnected
                              ? `TERHUBUNG • KODE: ${s.pairingCode || 'AKTIF'}`
                              : s.status === 'pairing'
                              ? `MENUNGGU PAIRING • ${s.pairingCode || '-'}`
                              : s.status.toUpperCase()}
                          </p>
                          <p className="text-[9px] text-white/50">{s.deviceName || 'WhatsApp Official'}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteSender(s.id)}
                        className="text-xs text-red-400 hover:text-red-300 p-2 font-slant cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}

                <button
                  onClick={() => {
                    setPairingStep('input');
                    setInputPhone('');
                    setPairingError(null);
                    setActivePairingSenderId(null);
                    setShowAddSenderModal(true);
                  }}
                  className="w-full py-3.5 rounded-full bg-black/65 border-2 border-white text-white font-slant text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-transform duration-75 cursor-pointer shadow-3d-bl mt-2"
                >
                  <Plus size={16} /> TAMBAH SENDER BARU
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: TAUTKAN PERANGKAT WHATSAPP (8 DIGIT KODE XXXX-XXXX)           */}
      {/* =================================================================== */}
      {showAddSenderModal && (
        <div className="fixed inset-0 z-[1000001] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-[360px] bg-[#0c0c0c] border-2 border-white rounded-[32px] p-6 shadow-3d-bl relative">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-white" />
                <h4 className="font-slant text-xs text-white tracking-wider">TAUTKAN WHATSAPP</h4>
              </div>
              <button
                onClick={() => setShowAddSenderModal(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* STEP 1: Phone Number Input */}
            {pairingStep === 'input' && (
              <div className="space-y-4">
                <p className="text-[11px] text-white/60 leading-relaxed font-sans">
                  Masukkan nomor telepon akun WhatsApp Anda untuk menerima 8 digit kode penautan resmi:
                </p>

                <div className="border border-white/30 rounded-2xl px-4 py-3 bg-black flex items-center gap-2 shadow-3d-bl">
                  <span className="text-xs font-slant text-white/50">+</span>
                  <input
                    type="text"
                    placeholder="628123456789"
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    autoFocus
                    className="w-full bg-transparent text-sm text-white font-slant tracking-wider outline-none placeholder:text-white/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSenderModal(false)}
                    className="py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-slant text-xs cursor-pointer active:scale-95 transition"
                  >
                    BATAL
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestPairingCode}
                    disabled={!inputPhone.trim() || isRequestingPairing}
                    className="py-3 rounded-full bg-white text-black font-slant text-xs hover:bg-white/90 active:scale-95 transition cursor-pointer shadow-3d-bl disabled:opacity-40"
                  >
                    {isRequestingPairing ? 'MEMINTA...' : 'DAPAT KODE'}
                  </button>
                </div>
                {pairingError && (
                  <p className="text-[10px] text-red-400 text-center font-sans">{pairingError}</p>
                )}
              </div>
            )}

            {/* STEP 2: 8-DIGIT PAIRING CODE DISPLAY */}
            {pairingStep === 'code' && (
              <div className="space-y-4 text-center">
                <p className="text-[11px] text-white/70 font-sans">
                  Masukkan kode berikut pada WhatsApp Anda:
                </p>

                {/* Big 8-Digit Code Display */}
                <div className="bg-black border-2 border-white rounded-2xl py-4 px-3 shadow-3d-bl flex flex-col items-center justify-center relative">
                  <span className="text-2xl sm:text-3xl font-slant text-white tracking-[0.25em] font-black">
                    {generatedPairingCode}
                  </span>

                  <button
                    onClick={handleCopyCode}
                    className="mt-2.5 px-3.5 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[10px] font-slant flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                  >
                    {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedCode ? 'TERSALIN' : 'SALIN KODE'}</span>
                  </button>
                </div>

                {/* Live status */}
                <div className={`px-3 py-1.5 rounded-xl border text-[10px] font-slant tracking-wide ${
                  pairingStatus === 'connected'
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-400/30 text-amber-300'
                }`}>
                  {pairingStatus === 'connected'
                    ? 'TERHUBUNG KE WHATSAPP!'
                    : 'MENUNGGU KONFIRMASI DARI WHATSAPP HP ANDA...'}
                </div>

                {pairingError && (
                  <p className="text-[10px] text-red-400 font-sans">{pairingError}</p>
                )}

                {/* Steps tutorial */}
                <div className="text-left bg-white/5 border border-white/10 rounded-2xl p-3 text-[10px] text-white/70 space-y-1 font-sans">
                  <p className="font-bold text-white font-slant">CARA TAUTKAN:</p>
                  <p>1. Buka WhatsApp di HP Anda</p>
                  <p>2. Tekan menu titik tiga (⋮) &gt; Perangkat Tertaut</p>
                  <p>3. Pilih Tautkan Perangkat &gt; Tautkan dengan nomor telepon saja</p>
                  <p>4. Masukkan kode 8 digit di atas</p>
                </div>

                <p className="text-[9px] text-white/40">Kedaluwarsa dalam {countdown} detik</p>

                {/* Explicit confirmation button — only enabled once truly connected */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPairingStep('input');
                      setPairingError(null);
                    }}
                    className="py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-slant text-xs cursor-pointer active:scale-95 transition"
                  >
                    GANTI NO
                  </button>
                  <button
                    type="button"
                    disabled={pairingStatus !== 'connected'}
                    onClick={handleConfirmLinked}
                    className={`py-2.5 rounded-full font-slant text-xs transition font-bold ${
                      pairingStatus === 'connected'
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-black active:scale-95 cursor-pointer shadow-3d-bl'
                        : 'bg-white/10 text-white/35 cursor-not-allowed'
                    }`}
                  >
                    KONFIRMASI
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: SUCCESS */}
            {pairingStep === 'success' && (
              <div className="py-4 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 mx-auto flex items-center justify-center text-emerald-400 shadow-3d-bl">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <h4 className="font-slant text-sm text-white tracking-wider">BERHASIL DITAUTKAN!</h4>
                  <p className="text-[11px] text-white/60 font-sans mt-1">
                    WhatsApp Sender Anda kini telah aktif dan terhubung ke sistem.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddSenderModal(false)}
                  className="w-full py-3 rounded-full bg-white text-black font-slant text-xs hover:bg-white/90 active:scale-95 transition cursor-pointer shadow-3d-bl"
                >
                  SELESAI
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. HALAMAN CONTROL SIMULATOR MENU (BERANDA HITAM PUTIH STYLE)        */}
      {/* =================================================================== */}
      {currentView === 'control' && (
        <div className="relative w-full h-full flex flex-col bg-transparent overflow-y-auto no-scrollbar">
          
          {/* Sticky Header: Hitam Transparan + Border Putih Tipis */}
          <div className="sticky top-0 z-30 bg-black/85 px-4 py-3 flex items-center justify-between border-b border-white/15">
            <button
              onClick={() => setCurrentView('console')}
              className="px-3 py-1.5 rounded-xl bg-black/75 hover:bg-white/10 border border-white/20 text-white text-[11px] font-slant flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform duration-75"
            >
              <ArrowLeft size={14} /> KEMBALI
            </button>

            <span className="text-xs font-slant text-white tracking-widest">
              CONTROL PANEL
            </span>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-black/75 hover:bg-white/10 border border-white/20 text-white flex items-center justify-center cursor-pointer active:scale-95 transition-transform duration-75"
            >
              <X size={15} />
            </button>
          </div>

          {/* Control Body: Hitam Putih konsisten seperti Beranda */}
          <div className="p-4 space-y-3 max-w-md mx-auto w-full pb-14">
            
            {/* Target Device Summary Card */}
            <div className="ze-bug-gpu-card rounded-2xl border border-white/20 bg-black/75 p-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl border border-white/20 bg-black flex items-center justify-center shrink-0">
                  <Smartphone size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-slant text-white tracking-wider truncate">
                    {simulatedDevice?.model || 'Samsung Galaxy S25'}
                  </h3>
                  <p className="text-[10px] text-white/60 font-slant truncate">
                    {simulatedDevice?.os || 'Android 14'} • {simulatedLocation?.kotaKabupaten || 'Jakarta Selatan'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={!isTargetDeviceReady}
                onClick={() => {
                  if (isTargetDeviceReady) setShowTargetResetConfirm(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-slant flex items-center gap-1 transition-transform duration-75 shrink-0 ${
                  isTargetDeviceReady
                    ? 'border border-red-500/80 bg-red-500/15 hover:bg-red-500/25 text-red-400 active:scale-95 cursor-pointer'
                    : 'bg-black/60 border border-red-500/25 text-red-400/40 cursor-not-allowed pointer-events-none'
                }`}
              >
                <RotateCcw size={11} /> RESET
              </button>
            </div>

            {/* Row 1: SCREEN POWER & LAYAR TARGET */}
            <div className="grid grid-cols-2 gap-3">
              {/* Screen On/Off */}
              <button
                type="button"
                onClick={() => {
                  if (selectedControlCard === 'power') {
                    setSelectedControlCard(null);
                    setScreenPower(false);
                    showToast('Layar dipadamkan');
                  } else {
                    setSelectedControlCard('power');
                    setScreenPower(true);
                    showToast('Layar diaktifkan');
                  }
                }}
                className={`ze-bug-gpu-card py-3.5 px-3 rounded-2xl flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedControlCard === 'power'
                    ? 'border border-white bg-white/15 text-white'
                    : 'border border-white/20 bg-black/75 text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <Power size={20} className={screenPower ? 'text-white mb-1' : 'text-white/50 mb-1'} />
                <span className="text-xs font-slant tracking-wider text-white">
                  SCREEN POWER
                </span>
                <span className={`text-[9px] font-slant mt-0.5 ${screenPower ? 'text-white' : 'text-white/55'}`}>
                  {screenPower ? 'AKTIF (ON)' : 'PADAM (OFF)'}
                </span>
              </button>

              {/* Layar Target (Full Screen) */}
              <button
                type="button"
                onClick={() => {
                  if (selectedControlCard === 'target_screen') {
                    setSelectedControlCard(null);
                  } else {
                    setSelectedControlCard('target_screen');
                    setIsFullScreen(true);
                  }
                }}
                className={`ze-bug-gpu-card py-3.5 px-3 rounded-2xl flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedControlCard === 'target_screen'
                    ? 'border border-white bg-white/15 text-white'
                    : 'border border-white/20 bg-black/75 text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <Maximize2 size={20} className="text-white mb-1" />
                <span className="text-xs font-slant tracking-wider text-white">
                  LAYAR TARGET
                </span>
                <span className="text-[9px] font-slant text-white/60 mt-0.5">
                  TAMPILAN PENUH
                </span>
              </button>
            </div>

            {/* Row 2: FLASHLIGHT & LOCK SCREEN */}
            <div className="grid grid-cols-2 gap-3">
              {/* Flashlight */}
              <button
                type="button"
                onClick={() => {
                  if (selectedControlCard === 'flashlight') {
                    setSelectedControlCard(null);
                    setIsFlashlightOn(false);
                    showToast('Senter dimatikan');
                  } else {
                    setSelectedControlCard('flashlight');
                    setIsFlashlightOn(true);
                    showToast('Senter diaktifkan');
                  }
                }}
                className={`ze-bug-gpu-card py-3.5 px-3 rounded-2xl flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedControlCard === 'flashlight'
                    ? 'border border-white bg-white/15 text-white'
                    : 'border border-white/20 bg-black/75 text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <Zap size={20} className={isFlashlightOn ? 'text-white mb-1' : 'text-white/60 mb-1'} />
                <span className="text-xs font-slant tracking-wider text-white">
                  FLASHLIGHT
                </span>
                <span className={`text-[9px] font-slant mt-0.5 ${isFlashlightOn ? 'text-white' : 'text-white/60'}`}>
                  {isFlashlightOn ? 'MENYALA' : 'MATI'}
                </span>
              </button>

              {/* Lock Screen */}
              <button
                type="button"
                onClick={() => {
                  if (selectedControlCard === 'lockscreen') {
                    setSelectedControlCard(null);
                  } else {
                    setSelectedControlCard('lockscreen');
                    setIsLockScreenOpen(true);
                  }
                }}
                className={`ze-bug-gpu-card py-3.5 px-3 rounded-2xl flex flex-col items-center justify-center text-center transition-transform duration-75 active:scale-95 cursor-pointer ${
                  selectedControlCard === 'lockscreen'
                    ? 'border border-white bg-white/15 text-white'
                    : 'border border-white/20 bg-black/75 text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <Lock size={20} className="text-white mb-1" />
                <span className="text-xs font-slant tracking-wider text-white">
                  LOCK SCREEN
                </span>
                <span className="text-[9px] font-slant text-white/60 mt-0.5">
                  KUNCI LAYAR
                </span>
              </button>
            </div>

            {/* Row 3: DEVICE INFORMATION (14 FIELD PANEL - HITAM PUTIH BERSIH) */}
            <div className="ze-bug-gpu-card rounded-2xl border border-white/20 bg-black/75 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/15">
                <div className="flex items-center gap-2">
                  <Smartphone size={15} className="text-white" />
                  <span className="text-xs font-slant text-white tracking-wider">
                    DEVICE INFORMATION
                  </span>
                </div>
                <span className="text-[9px] font-slant px-2 py-0.5 rounded-lg border border-white/25 bg-black text-white">
                  {targetDeviceStatusLabel}
                </span>
              </div>

              <div className="space-y-2 text-[10px] font-slant">
                {/* 1-4: Hardware & Target Info */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-2 border-b border-white/10">
                  <div>
                    <span className="text-white/55 block text-[8.5px]">DEVICE NAME:</span>
                    <span className="text-white font-medium truncate block">{simulatedDevice?.fullName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">MODEL:</span>
                    <span className="text-white font-medium truncate block">{simulatedDevice?.model || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">ANDROID VERSION:</span>
                    <span className="text-white font-medium truncate block">{simulatedDevice?.os || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">NOMOR TARGET:</span>
                    <span className="text-white font-medium truncate block">{targetInput || '-'}</span>
                  </div>
                </div>

                {/* 5-12: Structured Indonesian Regional Hierarchy + Status Perangkat */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-2 border-b border-white/10">
                  <div>
                    <span className="text-white/55 block text-[8.5px]">PROVINSI:</span>
                    <span className="text-white truncate block">{simulatedLocation?.provinsi || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">KOTA / KABUPATEN:</span>
                    <span className="text-white truncate block">{simulatedLocation?.kotaKabupaten || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">KECAMATAN:</span>
                    <span className="text-white truncate block">{simulatedLocation?.kecamatan || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">KELURAHAN / DESA:</span>
                    <span className="text-white truncate block">{simulatedLocation?.kelurahan || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">KAMPUNG / LINGKUNGAN:</span>
                    <span className="text-white truncate block">{simulatedLocation?.kampungLingkungan || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">RT / RW:</span>
                    <span className="text-white truncate block">
                      {simulatedLocation ? `RT ${simulatedLocation.rt} / RW ${simulatedLocation.rw}` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">KODE POS:</span>
                    <span className="text-white truncate block">{simulatedLocation?.kodePos || '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">STATUS PERANGKAT:</span>
                    <span className="text-white truncate block">{targetDeviceStatusLabel}</span>
                  </div>
                </div>

                {/* 13-14: Network, Connection & Timestamp */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-0.5">
                  <div>
                    <span className="text-white/55 block text-[8.5px]">STATUS KONEKSI:</span>
                    <span className="text-white truncate block">
                      ONLINE ({simulatedLocation?.latencyMs || 14}ms)
                    </span>
                  </div>
                  <div>
                    <span className="text-white/55 block text-[8.5px]">PEMBARUAN TERAKHIR:</span>
                    <span className="text-white truncate block">{lastUpdatedTime || 'Baru saja'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 4: CONTROL STATE */}
            <div className="ze-bug-gpu-card rounded-2xl border border-white/20 bg-black/75 p-4 space-y-2">
              <div className="flex items-center gap-2 pb-1.5 border-b border-white/15">
                <ShieldCheck size={15} className="text-white" />
                <span className="text-xs font-slant text-white tracking-wider">
                  CONTROL STATE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] font-slant pt-1">
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-white/60">LAYAR:</span>
                  <span className={screenPower ? 'text-white' : 'text-white/55'}>
                    {screenPower ? 'AKTIF (ON)' : 'PADAM'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-white/60">SENTER:</span>
                  <span className={isFlashlightOn ? 'text-white' : 'text-white/60'}>
                    {isFlashlightOn ? 'MENYALA' : 'MATI'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-white/60">BATERAI:</span>
                  <span className="text-white">89%</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-white/60">GATEWAY NODE:</span>
                  <span className="text-white truncate max-w-[100px]">
                    {simulatedLocation?.nodeName || 'JKT-01'}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 5: QUICK ACTIONS (RESET tetap MERAH, lainnya hitam putih) */}
            <div className="ze-bug-gpu-card rounded-2xl border border-white/20 bg-black/75 p-4 space-y-2.5">
              <span className="text-[10px] font-slant text-white/60 tracking-wider block">
                QUICK ACTIONS
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={!isTargetDeviceReady}
                  onClick={() => {
                    if (isTargetDeviceReady) setShowTargetResetConfirm(true);
                  }}
                  className={`py-2.5 rounded-xl text-[10px] font-slant flex items-center justify-center gap-1.5 transition-transform duration-75 ${
                    isTargetDeviceReady
                      ? 'border border-red-500/80 text-red-400 bg-red-500/15 hover:bg-red-500/25 active:scale-95 cursor-pointer'
                      : 'bg-black/60 border border-red-500/25 text-red-400/40 cursor-not-allowed pointer-events-none'
                  }`}
                >
                  <RotateCcw size={12} /> RESET TARGET
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('console')}
                  className="py-2.5 rounded-xl border border-white/25 text-white bg-black hover:bg-white/10 text-[10px] font-slant flex items-center justify-center gap-1.5 transition-transform duration-75 active:scale-95 cursor-pointer"
                >
                  <ArrowLeft size={12} /> KEMBALI CONSOLE
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* OVERLAY: SCREEN OFF POWER STATE                                     */}
      {/* =================================================================== */}
      {!screenPower && (
        <div className="fixed inset-0 z-[1000010] bg-black flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 rounded-full border border-white/20 bg-white/5 flex items-center justify-center mb-4">
            <Power size={28} className="text-white/40 animate-pulse" />
          </div>
          <h4 className="font-slant text-sm text-white/70 tracking-wider">LAYAR NONAKTIF</h4>
          <p className="text-[11px] text-white/40 mt-1">Layar saat ini dalam kondisi padam.</p>
          <button
            onClick={() => {
              setScreenPower(true);
              showToast('Layar berhasil dihidupkan');
            }}
            className="mt-6 px-6 py-2.5 rounded-full border border-white/40 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-slant text-xs tracking-wider cursor-pointer shadow-3d-bl transition"
          >
            HIDUPKAN LAYAR
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* OVERLAY: FULLSCREEN MODE                                            */}
      {/* =================================================================== */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[1000009] bg-black flex flex-col justify-between p-6 select-none animate-in fade-in">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setIsFullScreen(false);
                setSelectedControlCard(null);
              }}
              className="w-10 h-10 rounded-full border border-white/40 bg-black/80 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center shadow-3d-bl cursor-pointer z-50 transition"
              title="Kembali dari Layar Penuh"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="text-[10px] font-slant text-white/30 tracking-widest">
              LAYAR TARGET
            </span>
            <div className="w-10" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full border border-white/15 bg-white/5 flex items-center justify-center mb-3">
              <Maximize2 size={32} className="text-white/40 animate-pulse" />
            </div>
            <p className="text-xs font-slant text-white/50 tracking-wider">LAYAR TARGET AKTIF</p>
            <p className="text-[10px] text-white/30 mt-1">Tekan tombol panah di kiri atas untuk kembali.</p>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* OVERLAY: FLASHLIGHT BEAM                                            */}
      {/* =================================================================== */}
      {isFlashlightOn && (
        <div className="fixed inset-0 pointer-events-none z-[1000004] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/35 via-white/10 to-transparent animate-pulse" />
      )}

      {/* =================================================================== */}
      {/* OVERLAY: LOCK SCREEN VIEW (Isolated 1s clock component)             */}
      {/* =================================================================== */}
      {isLockScreenOpen && (
        <LockScreenOverlay
          onUnlock={() => {
            setIsLockScreenOpen(false);
            setSelectedControlCard(null);
            showToast('Layar berhasil dibuka');
          }}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL: KONFIRMASI RESET TARGET (GLASSMORPHISM STYLE)                */}
      {/* =================================================================== */}
      {showTargetResetConfirm && (
        <div className="fixed inset-0 z-[1000020] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#0c0c0c]/90 border-2 border-white rounded-[32px] p-6 shadow-3d-bl text-center relative backdrop-blur-xl">
            <div className="w-14 h-14 rounded-full bg-red-500/15 border-2 border-red-400 mx-auto flex items-center justify-center text-red-400 mb-3 shadow-3d-bl">
              <RotateCcw size={26} className="animate-spin-once" />
            </div>

            <h3 className="font-slant text-base text-white tracking-wider">
              KONFIRMASI RESET TARGET
            </h3>

            <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
              Anda akan mengirimkan sinyal soft reboot ke perangkat target berikut:
            </p>

            {/* Target Summary Card inside Modal */}
            <div className="my-3.5 p-3 rounded-2xl bg-black/60 border border-white/20 text-left space-y-1 text-[10px] font-slant shadow-3d-bl">
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="text-white/50">DEVICE NAME:</span>
                <span className="text-white font-medium truncate max-w-[170px]">
                  {simulatedDevice?.fullName || '-'}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="text-white/50">MODEL:</span>
                <span className="text-white font-medium truncate max-w-[170px]">
                  {simulatedDevice?.model || '-'}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="text-white/55">VERSI OS:</span>
                <span className="text-white font-medium">
                  {simulatedDevice?.os || '-'}
                </span>
              </div>
              <div className="flex justify-between pt-0.5">
                <span className="text-white/50">NOMOR TARGET:</span>
                <span className="text-white font-medium">
                  {targetInput || '-'}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-white/50">
              Pengaturan UI dan nomor target Anda akan tetap tersimpan.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-4">
              <button
                type="button"
                onClick={() => setShowTargetResetConfirm(false)}
                className="py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-slant text-xs cursor-pointer active:scale-95 transition"
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={handleStartTargetReset}
                className="py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-slant text-xs active:scale-95 transition cursor-pointer shadow-3d-bl font-bold"
              >
                RESET TARGET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: PROSES RESET TARGET (ANIMASI PROGRES STEP-BY-STEP)           */}
      {/* =================================================================== */}
      {isResettingTarget && (
        <div className="fixed inset-0 z-[1000021] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#0c0c0c] border-2 border-white rounded-[32px] p-6 shadow-3d-bl text-center">
            
            <div className="w-14 h-14 rounded-full bg-red-500/10 border-2 border-red-500 mx-auto flex items-center justify-center text-red-400 mb-4 shadow-3d-bl">
              <RotateCcw size={26} className={!targetResetDone ? 'animate-spin' : ''} />
            </div>

            <h3 className="font-slant text-base text-white tracking-wider">
              {!targetResetDone ? 'MEMPROSES RESET TARGET...' : 'RESET BERHASIL!'}
            </h3>

            <div className="my-2 px-2">
              <span className="text-[11px] font-slant text-white/80 block truncate">
                {simulatedDevice?.fullName}
              </span>
              <span className="text-[10px] font-slant text-white/80 block">
                TARGET: {targetInput}
              </span>
            </div>
            
            <p className="text-[11px] text-white/60 mt-1 min-h-[32px] px-2 font-sans">
              {targetResetStep}
            </p>

            {/* Progress bar */}
            <div className="w-full h-3 bg-black rounded-full overflow-hidden mt-4 border border-white/30 shadow-3d-bl p-[2px]">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-300"
                style={{ width: `${targetResetProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-white/50 font-slant mt-1 text-right">{targetResetProgress}%</p>

            {targetResetDone && (
              <button
                onClick={() => setIsResettingTarget(false)}
                className="w-full mt-5 py-3 rounded-full bg-white text-black font-slant text-xs hover:bg-white/90 active:scale-95 transition cursor-pointer shadow-3d-bl"
              >
                SELESAI &amp; TUTUP
              </button>
            )}

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: KONFIRMASI RESET (GLASSMORPHISM STYLE)                       */}
      {/* =================================================================== */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-[1000020] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#0c0c0c]/90 border-2 border-white rounded-[32px] p-6 shadow-3d-bl text-center relative backdrop-blur-xl">
            <div className="w-14 h-14 rounded-full bg-red-500/15 border-2 border-red-400 mx-auto flex items-center justify-center text-red-400 mb-4 shadow-3d-bl">
              <RotateCcw size={26} className="animate-spin-once" />
            </div>

            <h3 className="font-slant text-base text-white tracking-wider">
              KONFIRMASI RESET
            </h3>

            <p className="text-[11px] text-white/70 mt-2 leading-relaxed">
              Apakah Anda yakin ingin mengatur ulang semua parameter kontrol, tampilan visual, dan data target ke nilai default?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-5">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-slant text-xs cursor-pointer active:scale-95 transition"
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={handleExecuteGlobalReset}
                className="py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-slant text-xs active:scale-95 transition cursor-pointer shadow-3d-bl font-bold"
              >
                YA, RESET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: TRANSMISSION STATUS ANIMATION                                */}
      {/* =================================================================== */}
      {isSendingBug && (
        <div className="fixed inset-0 z-[1000002] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#0c0c0c] border-2 border-white rounded-[32px] p-6 shadow-3d-bl text-center">
            
            {/* Header Icon */}
            <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white mx-auto flex items-center justify-center text-white mb-4 shadow-3d-bl">
              <Send size={26} className={!sendDone ? 'animate-bounce' : ''} />
            </div>

            <h3 className="font-slant text-base text-white tracking-wider">
              {!sendDone ? 'MENGIRIM PAYLOAD...' : 'TRANSMISI SELESAI!'}
            </h3>

            <div className="my-2 px-2">
              <span className="text-[11px] font-slant text-white/70 block">
                TARGET: {targetInput}
              </span>
              <span className="text-[10px] font-slant text-white/50 block">
                TIPE: {selectedTargetType === 'group' ? 'BAN GRUB' : 'BUG NOMOR'} • {(selectedPayload || 'PAYLOAD').toUpperCase()}
              </span>
            </div>
            
            <p className="text-[11px] text-white/60 mt-1 min-h-[32px] px-2 font-sans">
              {sendStepText}
            </p>

            {/* Progress bar with 3D bottom-left shadow */}
            <div className="w-full h-3 bg-black rounded-full overflow-hidden mt-4 border border-white/30 shadow-3d-bl p-[2px]">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${sendProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-white/50 font-slant mt-1 text-right">{sendProgress}%</p>

            {sendDone && (
              <button
                onClick={() => setIsSendingBug(false)}
                className="w-full mt-5 py-3 rounded-full bg-white text-black font-slant text-xs hover:bg-white/90 active:scale-95 transition cursor-pointer shadow-3d-bl"
              >
                SELESAI &amp; TUTUP
              </button>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
