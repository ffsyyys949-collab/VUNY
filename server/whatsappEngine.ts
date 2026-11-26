import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WA_SESSIONS_ROOT = path.resolve(__dirname, '..', '.wa_sessions');
const WA_META_FILE = path.join(WA_SESSIONS_ROOT, 'senders.json');

if (!fs.existsSync(WA_SESSIONS_ROOT)) {
  fs.mkdirSync(WA_SESSIONS_ROOT, { recursive: true });
}

export type WaConnectionStatus = 'pairing' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WaSenderRecord {
  id: string;
  phone: string;
  formattedPhone: string;
  status: WaConnectionStatus;
  pairingCode?: string;
  deviceName?: string;
  connectedAt?: number;
  createdAt: number;
  lastError?: string;
}

interface ActiveSessionEntry {
  record: WaSenderRecord;
  sock: WASocket | null;
  intentionalClose: boolean;
  reconnectAttempts: number;
}

const sessions = new Map<string, ActiveSessionEntry>();
const silentLogger = pino({ level: 'silent' });

export function normalizeWaDigits(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8') && digits.length >= 9 && digits.length <= 13) {
    digits = '62' + digits;
  }
  return digits;
}

export function formatPhoneDisplay(digits: string): string {
  const clean = normalizeWaDigits(digits);
  if (clean.startsWith('62') && clean.length >= 10) {
    const rest = clean.slice(2);
    return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(/-$/, '');
  }
  return `+${clean}`;
}

function formatPairingCodeDisplay(code: string): string {
  const clean = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }
  return String(code || '').toUpperCase();
}

function persistMetadataIndex() {
  try {
    const list: WaSenderRecord[] = [];
    for (const entry of sessions.values()) {
      list.push(entry.record);
    }
    fs.writeFileSync(WA_META_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

async function createAndConnectSocket(
  senderId: string,
  phoneDigits: string,
  requestCodeNow: boolean
): Promise<{ pairingCode?: string; error?: string }> {
  const sessionDir = path.join(WA_SESSIONS_ROOT, senderId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const entry = sessions.get(senderId);
  if (!entry) return { error: 'Sender tidak ditemukan.' };

  if (entry.sock) {
    try {
      entry.intentionalClose = true;
      entry.sock.end(undefined);
    } catch {}
    entry.sock = null;
  }
  entry.intentionalClose = false;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  let version: [number, number, number] | undefined;
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
  } catch {}

  const sock = makeWASocket({
    version,
    logger: silentLogger,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 30_000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  entry.sock = sock;

  sock.ev.on('creds.update', () => {
    saveCreds().catch(() => {});
  });

  let pairingCodePromise: Promise<string | undefined> | null = null;
  let resolvePairingCode: ((val: string | undefined) => void) | null = null;
  let rejectPairingCode: ((err: Error) => void) | null = null;

  if (requestCodeNow && !state.creds.registered) {
    pairingCodePromise = new Promise<string | undefined>((resolve, reject) => {
      resolvePairingCode = resolve;
      rejectPairingCode = reject;
    });

    // Wait briefly until WS socket opens/connects cleanly before requesting pairing code
    setTimeout(async () => {
      try {
        if (!entry.sock || entry.intentionalClose) {
          rejectPairingCode?.(new Error('Koneksi terputus sebelum pairing code dibuat.'));
          return;
        }
        const rawCode = await sock.requestPairingCode(phoneDigits);
        const formatted = formatPairingCodeDisplay(rawCode);
        entry.record.pairingCode = formatted;
        entry.record.status = 'pairing';
        entry.record.lastError = undefined;
        persistMetadataIndex();
        resolvePairingCode?.(formatted);
      } catch (err: any) {
        const msg = err?.message || 'Gagal meminta kode pairing dari WhatsApp.';
        entry.record.status = 'error';
        entry.record.lastError = msg;
        persistMetadataIndex();
        rejectPairingCode?.(new Error(msg));
      }
    }, 1800);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      entry.reconnectAttempts = 0;
      entry.record.status = 'connected';
      entry.record.connectedAt = entry.record.connectedAt || Date.now();
      entry.record.lastError = undefined;
      entry.record.deviceName = sock.user?.name
        ? `WhatsApp (${sock.user.name})`
        : 'WhatsApp Linked Device';
      persistMetadataIndex();
      return;
    }

    if (connection === 'close') {
      if (entry.intentionalClose) return;

      const statusCode = Number((lastDisconnect?.error as any)?.output?.statusCode || 0);
      const isLoggedOut =
        statusCode === DisconnectReason.loggedOut || statusCode === 401;

      if (isLoggedOut) {
        entry.record.status = 'disconnected';
        entry.record.lastError = 'Sesi WhatsApp terputus / logout.';
        entry.sock = null;
        persistMetadataIndex();
        return;
      }

      const shouldReconnect =
        statusCode === DisconnectReason.restartRequired ||
        (state.creds.registered && entry.reconnectAttempts < 4) ||
        (!state.creds.registered &&
          entry.record.status === 'pairing' &&
          entry.reconnectAttempts < 2);

      if (shouldReconnect) {
        entry.reconnectAttempts += 1;
        entry.record.status = state.creds.registered ? 'connecting' : 'pairing';
        persistMetadataIndex();
        setTimeout(() => {
          if (sessions.has(senderId) && !entry.intentionalClose) {
            createAndConnectSocket(senderId, phoneDigits, false).catch(() => {});
          }
        }, 1500);
      } else {
        entry.record.status = 'disconnected';
        entry.record.lastError =
          (lastDisconnect?.error as any)?.message || 'Koneksi WhatsApp tertutup.';
        entry.sock = null;
        persistMetadataIndex();
      }
    }
  });

  if (pairingCodePromise) {
    try {
      const code = await Promise.race([
        pairingCodePromise,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Timeout menunggu kode pairing WhatsApp.')), 20_000)
        ),
      ]);
      return { pairingCode: code };
    } catch (err: any) {
      return { error: err?.message || 'Gagal mendapatkan kode pairing WhatsApp.' };
    }
  }

  return {};
}

export async function initWhatsAppEngine() {
  try {
    if (!fs.existsSync(WA_META_FILE)) return;
    const raw = fs.readFileSync(WA_META_FILE, 'utf-8');
    const saved: WaSenderRecord[] = JSON.parse(raw);
    if (!Array.isArray(saved)) return;

    for (const item of saved) {
      if (!item?.id || !item?.phone) continue;
      const sessionDir = path.join(WA_SESSIONS_ROOT, item.id);
      const credsPath = path.join(sessionDir, 'creds.json');
      const hasRegisteredCreds = fs.existsSync(credsPath);
      const record: WaSenderRecord = {
        ...item,
        status: hasRegisteredCreds ? 'connecting' : 'disconnected',
      };
      sessions.set(item.id, {
        record,
        sock: null,
        intentionalClose: false,
        reconnectAttempts: 0,
      });
      if (hasRegisteredCreds) {
        createAndConnectSocket(item.id, item.phone, false).catch(() => {});
      }
    }
  } catch {}
}

export async function startWhatsAppPairing(rawPhone: string): Promise<{
  success: boolean;
  sender?: WaSenderRecord;
  pairingCode?: string;
  message?: string;
}> {
  const digits = normalizeWaDigits(rawPhone);
  if (!digits || digits.length < 10 || digits.length > 15) {
    return {
      success: false,
      message: 'Nomor WhatsApp harus 10-15 digit angka yang valid.',
    };
  }

  // Reuse / reset any unfinished pairing entry for the same digits
  for (const [existingId, entry] of sessions.entries()) {
    if (entry.record.phone === digits && entry.record.status === 'connected') {
      return {
        success: true,
        sender: entry.record,
        pairingCode: entry.record.pairingCode,
        message: 'Nomor WhatsApp sudah terhubung.',
      };
    }
    if (entry.record.phone === digits && entry.record.status !== 'connected') {
      await deleteWhatsAppSender(existingId);
    }
  }

  const senderId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record: WaSenderRecord = {
    id: senderId,
    phone: digits,
    formattedPhone: formatPhoneDisplay(digits),
    status: 'pairing',
    createdAt: Date.now(),
    deviceName: 'WhatsApp Linked Device',
  };

  sessions.set(senderId, {
    record,
    sock: null,
    intentionalClose: false,
    reconnectAttempts: 0,
  });
  persistMetadataIndex();

  const res = await createAndConnectSocket(senderId, digits, true);
  if (res.error || !res.pairingCode) {
    await deleteWhatsAppSender(senderId);
    return {
      success: false,
      message: res.error || 'Gagal meminta kode pairing WhatsApp resmi.',
    };
  }

  return {
    success: true,
    sender: sessions.get(senderId)?.record || record,
    pairingCode: res.pairingCode,
  };
}

export function getWhatsAppSenders(): WaSenderRecord[] {
  const out: WaSenderRecord[] = [];
  for (const entry of sessions.values()) {
    out.push({ ...entry.record });
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getWhatsAppSenderStatus(id: string): WaSenderRecord | null {
  const entry = sessions.get(String(id || '').trim());
  return entry ? { ...entry.record } : null;
}

export async function deleteWhatsAppSender(id: string): Promise<boolean> {
  const cleanId = String(id || '').trim();
  const entry = sessions.get(cleanId);
  if (entry) {
    entry.intentionalClose = true;
    if (entry.sock) {
      try {
        await entry.sock.logout().catch(() => {});
      } catch {}
      try {
        entry.sock.end(undefined);
      } catch {}
      entry.sock = null;
    }
    sessions.delete(cleanId);
    persistMetadataIndex();
  }

  const sessionDir = path.join(WA_SESSIONS_ROOT, cleanId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch {}

  return Boolean(entry);
}

export async function sendWhatsAppPayload(params: {
  senderId?: string;
  target: string;
  targetType: 'nomor' | 'group';
  payloadType?: string;
}): Promise<{ success: boolean; message: string; messageId?: string }> {
  const target = String(params.target || '').trim();
  if (!target) {
    return { success: false, message: 'Target wajib diisi.' };
  }

  let activeEntry: ActiveSessionEntry | undefined;
  if (params.senderId && sessions.has(params.senderId)) {
    activeEntry = sessions.get(params.senderId);
  }
  if (!activeEntry || activeEntry.record.status !== 'connected' || !activeEntry.sock) {
    for (const entry of sessions.values()) {
      if (entry.record.status === 'connected' && entry.sock) {
        activeEntry = entry;
        break;
      }
    }
  }

  if (!activeEntry || activeEntry.record.status !== 'connected' || !activeEntry.sock) {
    return {
      success: false,
      message: 'Belum ada WhatsApp Sender aktif yang benar-benar terhubung.',
    };
  }

  const sock = activeEntry.sock;

  try {
    if (params.targetType === 'group') {
      const codeMatch = target.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
      if (!codeMatch) {
        return { success: false, message: 'Tautan grup WhatsApp tidak valid.' };
      }
      const inviteCode = codeMatch[1];
      const info = await sock.groupGetInviteInfo(inviteCode).catch(() => null);
      if (!info?.id) {
        return { success: false, message: 'Grup WhatsApp tidak ditemukan atau tautan kedaluwarsa.' };
      }
      return {
        success: true,
        message: `Koneksi grup "${info.subject || inviteCode}" terverifikasi melalui WhatsApp Sender.`,
      };
    }

    const digits = normalizeWaDigits(target);
    if (!digits || digits.length < 10 || digits.length > 15) {
      return { success: false, message: 'Nomor target harus 10-15 digit angka.' };
    }

    const jid = `${digits}@s.whatsapp.net`;
    const [exists] = await sock.onWhatsApp(jid).catch(() => [{ exists: true, jid }]);
    const resolvedJid = exists?.jid || jid;
    const tag = String(params.payloadType || 'SIGNAL').toUpperCase();
    const sent = await sock.sendMessage(resolvedJid, {
      text: `[VNJAVA] Gateway check (${tag}) terkirim melalui sesi WhatsApp aktif.`,
    });

    return {
      success: true,
      message: `Pesan gateway terkirim ke ${formatPhoneDisplay(digits)}.`,
      messageId: sent?.key?.id || undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Gagal mengirim melalui WhatsApp Sender.',
    };
  }
}
