package io.ze.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Persistent System-Wide Foreground Service untuk VN AI Live Coach:
 * - Menangkap layar Mobile Legends secara live via MediaProjection (setiap 2000ms)
 * - Mengirim frame + riwayat percakapan ke /api/vn-ai/coach
 * - Berbicara otomatis dengan suara cowok Indonesia (TextToSpeech male voice pitch 0.76f)
 * - Menerima pertanyaan suara user via tombol Mic (SpeechRecognizer id-ID)
 * - Floating bubble "VN AI (LIVE)" + mini control card (Mic, Mute, Minimize, Stop)
 */
class VNAIOverlayService : Service() {

    companion object {
        const val PREFS_NAME = "vn_ai_overlay_prefs"
        const val KEY_API_BASE_URL = "vn_ai_api_base_url"
        const val KEY_MUTED = "vn_ai_muted"

        const val ACTION_START = "io.ze.app.VN_AI_START"
        const val ACTION_STOP = "io.ze.app.VN_AI_STOP"
        const val ACTION_SET_MUTE = "io.ze.app.VN_AI_SET_MUTE"
        const val ACTION_TOGGLE_MUTE = "io.ze.app.VN_AI_TOGGLE_MUTE"
        const val ACTION_VN_AI_SYNC = "io.ze.app.VN_AI_SYNC"

        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val EXTRA_API_BASE_URL = "api_base_url"
        const val EXTRA_MUTED = "muted"
        const val EXTRA_ACTIVE = "active"
        const val EXTRA_STATUS = "status"
        const val EXTRA_ERROR = "error"

        private const val CHANNEL_ID = "vn_ai_coach_channel"
        private const val NOTIF_ID = 4020
        private const val AUTO_TICK_MS = 2000L

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var isMutedState: Boolean = false
            private set
    }

    private data class ChatTurn(val role: String, val text: String)

    private lateinit var windowManager: WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val networkExecutor = Executors.newSingleThreadExecutor()

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    @Volatile
    private var isSpeakingTts = false

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListeningMic = false

    private var bubbleView: View? = null
    private var panelView: View? = null
    private var bubbleLp: WindowManager.LayoutParams? = null
    private var panelLp: WindowManager.LayoutParams? = null
    private var captionView: TextView? = null
    private var micBtnView: TextView? = null
    private var muteBtnView: TextView? = null

    private var isExpanded = true
    private var currentCaption = "VN AI aktif — liat layar ML lu..."
    private var apiBaseUrl = BuildConfig.ZEIO_APP_URL.trimEnd('/')
    private var lastStateSummary = ""
    private var lastSpokenAtMs = 0L
    @Volatile
    private var isRequestInFlight = false
    @Volatile
    private var latestFrameBase64: String = ""
    private val chatHistory = ArrayList<ChatTurn>()

    private val autoTickRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            if (!isMutedState && !isRequestInFlight && !isListeningMic && !isSpeakingTts) {
                captureAndAnalyze(mode = "auto", userMessage = null)
            }
            mainHandler.postDelayed(this, AUTO_TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createChannel()
        initMaleIndonesianTts()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdownCompletely(errorMsg = null)
                return START_NOT_STICKY
            }
            ACTION_SET_MUTE -> {
                isMutedState = intent.getBooleanExtra(EXTRA_MUTED, false)
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_MUTED, isMutedState).apply()
                if (isMutedState) stopTtsSpeaking()
                refreshMuteUi()
                broadcastSync(active = isRunning, status = if (isMutedState) "muted" else "live", error = null)
                return START_STICKY
            }
            ACTION_TOGGLE_MUTE -> {
                isMutedState = !isMutedState
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_MUTED, isMutedState).apply()
                if (isMutedState) stopTtsSpeaking()
                refreshMuteUi()
                broadcastSync(active = isRunning, status = if (isMutedState) "muted" else "live", error = null)
                return START_STICKY
            }
        }

        val incomingBase = intent?.getStringExtra(EXTRA_API_BASE_URL)?.trim()?.trimEnd('/') ?: ""
        if (incomingBase.isNotEmpty() && !incomingBase.contains("appassets.androidplatform.net", ignoreCase = true)) {
            apiBaseUrl = incomingBase
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_API_BASE_URL, apiBaseUrl).apply()
        } else {
            val savedBase = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_API_BASE_URL, "")?.trim()?.trimEnd('/') ?: ""
            if (savedBase.isNotEmpty() && !savedBase.contains("appassets.androidplatform.net", ignoreCase = true)) {
                apiBaseUrl = savedBase
            } else {
                apiBaseUrl = BuildConfig.ZEIO_APP_URL.trimEnd('/')
            }
        }

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        @Suppress("DEPRECATION")
        val resultData: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        }

        // CRITICAL: Must call startForeground() with MEDIA_PROJECTION type BEFORE calling getMediaProjection()
        startAsForeground()

        if (resultCode != Activity.RESULT_OK || resultData == null) {
            shutdownCompletely(errorMsg = "Izin tangkap layar diperlukan untuk menyalakan VN AI.")
            return START_NOT_STICKY
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            shutdownCompletely(errorMsg = "Izin Overlay (tampil di atas app lain) diperlukan untuk VN AI.")
            return START_NOT_STICKY
        }

        teardownProjectionOnly()
        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        val projection = try {
            mgr?.getMediaProjection(resultCode, resultData)
        } catch (_: Throwable) {
            null
        }

        if (projection == null) {
            shutdownCompletely(errorMsg = "Gagal memulai tangkap layar MediaProjection.")
            return START_NOT_STICKY
        }

        mediaProjection = projection
        projection.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                mainHandler.post {
                    if (isRunning) {
                        shutdownCompletely(errorMsg = null)
                    }
                }
            }
        }, mainHandler)

        if (!setupVirtualDisplay(projection)) {
            shutdownCompletely(errorMsg = "Gagal menyiapkan VirtualDisplay untuk VN AI.")
            return START_NOT_STICKY
        }

        isRunning = true
        isMutedState = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_MUTED, false)
        isExpanded = true
        currentCaption = "VN AI LIVE — siap pantau layar ML lu!"
        broadcastSync(active = true, status = "live", error = null)
        syncOverlays()

        mainHandler.removeCallbacks(autoTickRunnable)
        mainHandler.postDelayed(autoTickRunnable, 1200L)
        mainHandler.post {
            try {
                Toast.makeText(applicationContext, "VN AI Live Coach Aktif", Toast.LENGTH_SHORT).show()
            } catch (_: Throwable) {}
        }

        return START_STICKY
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(autoTickRunnable)
        isRunning = false
        teardownProjectionOnly()
        removeAllOverlays()
        try {
            speechRecognizer?.destroy()
        } catch (_: Throwable) {}
        speechRecognizer = null
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Throwable) {}
        tts = null
        networkExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun shutdownCompletely(errorMsg: String?) {
        mainHandler.removeCallbacks(autoTickRunnable)
        isRunning = false
        isListeningMic = false
        stopTtsSpeaking()
        teardownProjectionOnly()
        removeAllOverlays()
        broadcastSync(active = false, status = if (errorMsg != null) "error" else "stopped", error = errorMsg)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun teardownProjectionOnly() {
        try { virtualDisplay?.release() } catch (_: Throwable) {}
        virtualDisplay = null
        try { imageReader?.close() } catch (_: Throwable) {}
        imageReader = null
        try { mediaProjection?.stop() } catch (_: Throwable) {}
        mediaProjection = null
    }

    private fun setupVirtualDisplay(projection: MediaProjection): Boolean {
        return try {
            val dm = resources.displayMetrics
            val scale = (640f / dm.widthPixels.coerceAtLeast(1)).coerceAtMost(1f)
            val width = ((dm.widthPixels * scale).toInt() / 2 * 2).coerceAtLeast(320)
            val height = ((dm.heightPixels * scale).toInt() / 2 * 2).coerceAtLeast(320)
            val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
            imageReader = reader
            virtualDisplay = projection.createVirtualDisplay(
                "VN_AI_Screen_Capture",
                width,
                height,
                dm.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.surface,
                null,
                mainHandler
            )
            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun captureCurrentScreenJpegBase64(): String? {
        val reader = imageReader ?: return latestFrameBase64.takeIf { it.isNotEmpty() }
        val img = try {
            reader.acquireLatestImage()
        } catch (_: Throwable) {
            null
        } ?: return latestFrameBase64.takeIf { it.isNotEmpty() }

        return try {
            val plane = img.planes.firstOrNull() ?: return null
            val buffer = plane.buffer
            buffer.rewind()
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val rowPadding = (rowStride - pixelStride * img.width).coerceAtLeast(0)
            val paddedWidth = img.width + rowPadding / pixelStride
            val rawBmp = Bitmap.createBitmap(paddedWidth, img.height, Bitmap.Config.ARGB_8888)
            rawBmp.copyPixelsFromBuffer(buffer)
            val cropped = if (paddedWidth != img.width) {
                val c = Bitmap.createBitmap(rawBmp, 0, 0, img.width, img.height)
                rawBmp.recycle()
                c
            } else {
                rawBmp
            }
            val baos = ByteArrayOutputStream()
            cropped.compress(Bitmap.CompressFormat.JPEG, 60, baos)
            cropped.recycle()
            val encoded = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
            latestFrameBase64 = encoded
            encoded
        } catch (_: Throwable) {
            latestFrameBase64.takeIf { it.isNotEmpty() }
        } finally {
            try { img.close() } catch (_: Throwable) {}
        }
    }

    private fun captureAndAnalyze(mode: String, userMessage: String?) {
        if (isRequestInFlight) return
        val frameB64 = captureCurrentScreenJpegBase64()
        if (frameB64.isNullOrBlank() && userMessage.isNullOrBlank()) return

        if (mode == "auto" && System.currentTimeMillis() - lastSpokenAtMs < 3500L) {
            return
        }

        isRequestInFlight = true
        val snapshotHistory = synchronized(chatHistory) { chatHistory.toList() }
        val summarySnapshot = lastStateSummary

        networkExecutor.execute {
            var conn: HttpURLConnection? = null
            try {
                val payload = JSONObject().apply {
                    put("mode", mode)
                    put("imageBase64", frameB64 ?: "")
                    put("mimeType", "image/jpeg")
                    put("lastState", summarySnapshot)
                    if (!userMessage.isNullOrBlank()) {
                        put("question", userMessage)
                    }
                    val histArr = JSONArray()
                    for (turn in snapshotHistory.takeLast(6)) {
                        histArr.put(JSONObject().apply {
                            put("role", turn.role)
                            put("text", turn.text)
                        })
                    }
                    put("history", histArr)
                }

                val url = URL("${apiBaseUrl}/api/vn-ai/coach")
                conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 9000
                    readTimeout = 16000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                }
                conn.outputStream.use { os ->
                    os.write(payload.toString().toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val rawBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                if (code !in 200..299 || rawBody.isBlank()) {
                    if (mode == "voice") {
                        mainHandler.post { updateCaption("Koneksi VN AI bermasalah ($code)") }
                    }
                    return@execute
                }

                val json = JSONObject(rawBody)
                if (!json.optBoolean("success", false)) return@execute
                val shouldSpeak = json.optBoolean("shouldSpeak", false)
                val reply = json.optString("reply", "").trim()
                val newSummary = json.optString("stateSummary", "").trim()

                if (newSummary.isNotEmpty()) {
                    lastStateSummary = newSummary
                }

                if ((shouldSpeak || mode == "voice") && reply.isNotEmpty()) {
                    synchronized(chatHistory) {
                        if (!userMessage.isNullOrBlank()) {
                            chatHistory.add(ChatTurn("user", userMessage))
                        }
                        chatHistory.add(ChatTurn("assistant", reply))
                        while (chatHistory.size > 10) {
                            chatHistory.removeAt(0)
                        }
                    }
                    lastSpokenAtMs = System.currentTimeMillis()
                    mainHandler.post {
                        updateCaption(reply)
                        if (mode == "voice" || !isMutedState) {
                            speakMaleCoachVoice(reply)
                        }
                    }
                }
            } catch (_: Throwable) {
                if (mode == "voice") {
                    mainHandler.post { updateCaption("Gagal terhubung ke server VN AI.") }
                }
            } finally {
                try { conn?.disconnect() } catch (_: Throwable) {}
                isRequestInFlight = false
            }
        }
    }

    private fun initMaleIndonesianTts() {
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                ttsReady = true
                configureMaleIndonesianVoice()
            }
        }
    }

    private fun configureMaleIndonesianVoice() {
        val engine = tts ?: return
        try {
            val idLocale = Locale("id", "ID")
            engine.language = idLocale

            val audioAttrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            engine.setAudioAttributes(audioAttrs)

            // Pilih suara cowok Indonesia jika tersedia di TTS device
            val voices = try { engine.voices } catch (_: Throwable) { null }
            if (voices != null && voices.isNotEmpty()) {
                val idVoices = voices.filter { v ->
                    val locStr = v.locale?.toString()?.lowercase(Locale.ROOT) ?: ""
                    locStr.startsWith("id") || locStr.contains("_id")
                }
                val preferredMale = idVoices.firstOrNull { v ->
                    val n = v.name.lowercase(Locale.ROOT)
                    n.contains("male") || n.contains("-idd-") || n.contains("-ide-") || n.contains("#male")
                } ?: idVoices.lastOrNull { v ->
                    val n = v.name.lowercase(Locale.ROOT)
                    !n.contains("female") && !n.contains("#female")
                } ?: idVoices.firstOrNull()

                if (preferredMale != null) {
                    engine.voice = preferredMale
                }
            }

            // Pitch rendah 0.76f untuk karakter suara cowok tegas, tempo cepat natural 1.16f
            engine.setPitch(0.76f)
            engine.setSpeechRate(1.16f)

            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    isSpeakingTts = true
                }
                override fun onDone(utteranceId: String?) {
                    isSpeakingTts = false
                }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    isSpeakingTts = false
                }
            })
        } catch (_: Throwable) {}
    }

    private fun speakMaleCoachVoice(text: String) {
        val engine = tts ?: return
        if (!ttsReady || text.isBlank()) return
        try {
            configureMaleIndonesianVoice()
            val params = Bundle().apply {
                putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            }
            isSpeakingTts = true
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "vn_ai_${System.currentTimeMillis()}")
        } catch (_: Throwable) {
            isSpeakingTts = false
        }
    }

    private fun stopTtsSpeaking() {
        isSpeakingTts = false
        try { tts?.stop() } catch (_: Throwable) {}
    }

    private fun startMicListening() {
        val hasMic = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasMic) {
            updateCaption("Izin Mikrofon belum aktif — izinkan Mic di aplikasi VNJAVA.")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            updateCaption("Layanan Speech Recognition tidak tersedia di perangkat ini.")
            return
        }

        if (isListeningMic) {
            try { speechRecognizer?.stopListening() } catch (_: Throwable) {}
            isListeningMic = false
            refreshMicUi()
            return
        }

        stopTtsSpeaking()
        try {
            speechRecognizer?.destroy()
        } catch (_: Throwable) {}

        val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer = recognizer
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                isListeningMic = true
                refreshMicUi()
                updateCaption("Dengerin lu ngomong... sebutin pertanyaan lu")
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {
                isListeningMic = false
                refreshMicUi()
            }
            override fun onError(error: Int) {
                isListeningMic = false
                refreshMicUi()
                if (error != SpeechRecognizer.ERROR_CLIENT) {
                    updateCaption("Suara gak kedengeran jelas, pencet Mic lagi.")
                }
            }
            override fun onResults(results: Bundle?) {
                isListeningMic = false
                refreshMicUi()
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val spoken = matches?.firstOrNull()?.trim() ?: ""
                if (spoken.isNotEmpty()) {
                    updateCaption("Lu: \"$spoken\" ...")
                    captureAndAnalyze(mode = "voice", userMessage = spoken)
                } else {
                    updateCaption("Suara kosong, coba ulang pencet Mic.")
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
                if (!partial.isNullOrBlank()) {
                    updateCaption("Lu: \"$partial\"")
                }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val recIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "id-ID")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        try {
            recognizer.startListening(recIntent)
        } catch (_: Throwable) {
            isListeningMic = false
            refreshMicUi()
            updateCaption("Gagal memulai Mic SpeechRecognizer.")
        }
    }

    private fun updateCaption(text: String) {
        currentCaption = text
        captionView?.text = text
    }

    private fun refreshMicUi() {
        val btn = micBtnView ?: return
        btn.text = if (isListeningMic) "● Dengerin" else "Mic"
        btn.background = GradientDrawable().apply {
            cornerRadius = dp(8).toFloat()
            if (isListeningMic) {
                setColor(Color.argb(215, 220, 38, 38))
                setStroke(dp(1), Color.argb(255, 248, 113, 113))
            } else {
                setColor(Color.argb(36, 255, 255, 255))
                setStroke(dp(1), Color.argb(55, 255, 255, 255))
            }
        }
    }

    private fun refreshMuteUi() {
        val btn = muteBtnView ?: return
        btn.text = if (isMutedState) "Unmute" else "Mute"
        btn.setTextColor(if (isMutedState) Color.rgb(248, 113, 113) else Color.WHITE)
    }

    private fun broadcastSync(active: Boolean, status: String, error: String?) {
        val intent = Intent(ACTION_VN_AI_SYNC).apply {
            setPackage(packageName)
            putExtra(EXTRA_ACTIVE, active)
            putExtra(EXTRA_MUTED, isMutedState)
            putExtra(EXTRA_STATUS, status)
            if (error != null) putExtra(EXTRA_ERROR, error)
        }
        sendBroadcast(intent)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VN AI Live Coach",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Coach VN AI pantau layar ML & suara cowok langsung"
                setShowBadge(false)
            }
            mgr.createNotificationChannel(channel)
        }
    }

    private fun startAsForeground() {
        val openPi = PendingIntent.getActivity(
            this,
            31,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val mutePi = PendingIntent.getService(
            this,
            32,
            Intent(this, VNAIOverlayService::class.java).apply { action = ACTION_TOGGLE_MUTE },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopPi = PendingIntent.getService(
            this,
            33,
            Intent(this, VNAIOverlayService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("VN AI • LIVE Coach")
            .setContentText("Lagi pantau layar Mobile Legends lu")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(openPi)
            .addAction(android.R.drawable.ic_lock_silent_mode, "Mute / Unmute", mutePi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Matikan", stopPi)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val hasMic = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            val fgsTypes = if (hasMic) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            }
            startForeground(NOTIF_ID, notif, fgsTypes)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun overlayWindowType(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun removeAllOverlays() {
        bubbleView?.let { try { windowManager.removeView(it) } catch (_: Throwable) {} }
        bubbleView = null
        panelView?.let { try { windowManager.removeView(it) } catch (_: Throwable) {} }
        panelView = null
        captionView = null
        micBtnView = null
        muteBtnView = null
    }

    private fun syncOverlays() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return
        if (!isRunning) {
            removeAllOverlays()
            return
        }
        if (isExpanded) {
            bubbleView?.let { try { windowManager.removeView(it) } catch (_: Throwable) {} }
            bubbleView = null
            showPanel()
        } else {
            panelView?.let { try { windowManager.removeView(it) } catch (_: Throwable) {} }
            panelView = null
            captionView = null
            micBtnView = null
            muteBtnView = null
            showBubble()
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun showBubble() {
        bubbleView?.let { try { windowManager.removeView(it) } catch (_: Throwable) {} }
        val wrapperPx = dp(64)
        val circlePx = dp(52)

        val container = FrameLayout(this)
        val circle = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(230, 10, 10, 12))
                setStroke(dp(1), Color.rgb(239, 68, 68))
            }
        }
        circle.addView(TextView(this).apply {
            text = "VN AI"
            setTextColor(Color.WHITE)
            textSize = 10.5f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })
        circle.addView(TextView(this).apply {
            text = if (isMutedState) "MUTE" else "LIVE"
            setTextColor(if (isMutedState) Color.rgb(200, 200, 200) else Color.rgb(248, 113, 113))
            textSize = 8f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })
        container.addView(circle, FrameLayout.LayoutParams(circlePx, circlePx).apply {
            gravity = Gravity.BOTTOM or Gravity.START
        })

        val closeDot = TextView(this).apply {
            text = "×"
            setTextColor(Color.WHITE)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(245, 185, 28, 28))
                setStroke(dp(1), Color.argb(120, 255, 255, 255))
            }
            setOnClickListener {
                shutdownCompletely(errorMsg = null)
            }
        }
        container.addView(closeDot, FrameLayout.LayoutParams(dp(20), dp(20)).apply {
            gravity = Gravity.TOP or Gravity.END
        })

        val dm = resources.displayMetrics
        val lp = bubbleLp ?: WindowManager.LayoutParams(
            wrapperPx,
            wrapperPx,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(12)
            y = (dm.heightPixels / 5).coerceAtLeast(dp(48))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f
        var moved = false
        circle.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = lp.x
                    startY = lp.y
                    touchX = event.rawX
                    touchY = event.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchX).toInt()
                    val dy = (event.rawY - touchY).toInt()
                    if (abs(dx) > touchSlop || abs(dy) > touchSlop) moved = true
                    lp.x = (startX + dx).coerceIn(0, (dm.widthPixels - wrapperPx).coerceAtLeast(0))
                    lp.y = (startY + dy).coerceIn(0, (dm.heightPixels - wrapperPx).coerceAtLeast(0))
                    try { windowManager.updateViewLayout(container, lp) } catch (_: Throwable) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        isExpanded = true
                        syncOverlays()
                    }
                    true
                }
                else -> false
            }
        }

        bubbleView = container
        bubbleLp = lp
        try {
            windowManager.addView(container, lp)
        } catch (_: Throwable) {
            bubbleView = null
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun showPanel() {
        panelView?.let { try { windowManager.removeView(it) } catch (_: Throwable) {} }
        val dm = resources.displayMetrics
        val widthPx = dp(254)
        val lp = panelLp ?: WindowManager.LayoutParams(
            widthPx,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(12)
            y = dp(48)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(11), dp(9), dp(11), dp(10))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(14).toFloat()
                setColor(Color.argb(228, 10, 10, 12))
                setStroke(dp(1), Color.argb(135, 239, 68, 68))
            }
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(6))
        }
        var dragX = 0
        var dragY = 0
        var touchX = 0f
        var touchY = 0f
        header.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    dragX = lp.x
                    dragY = lp.y
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    lp.x = (dragX + (event.rawX - touchX).toInt()).coerceIn(0, (dm.widthPixels - lp.width).coerceAtLeast(0))
                    lp.y = (dragY + (event.rawY - touchY).toInt()).coerceIn(0, (dm.heightPixels - dp(100)).coerceAtLeast(0))
                    try { windowManager.updateViewLayout(root, lp) } catch (_: Throwable) {}
                    true
                }
                else -> false
            }
        }

        val titleWrap = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleWrap.addView(TextView(this).apply {
            text = "VN AI"
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
        })
        titleWrap.addView(TextView(this).apply {
            text = "LIVE"
            setTextColor(Color.WHITE)
            textSize = 8.5f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(5), dp(1), dp(5), dp(1))
            background = GradientDrawable().apply {
                cornerRadius = dp(4).toFloat()
                setColor(Color.rgb(220, 38, 38))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(6) }
        })
        header.addView(titleWrap)

        val btnMin = makeBtn("○") {
            isExpanded = false
            syncOverlays()
        }
        val btnClose = makeBtn("×") {
            shutdownCompletely(errorMsg = null)
        }
        header.addView(btnMin, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { rightMargin = dp(4) })
        header.addView(btnClose)
        root.addView(header)

        val cap = TextView(this).apply {
            text = currentCaption
            setTextColor(Color.argb(235, 255, 255, 255))
            textSize = 11f
            setPadding(dp(8), dp(6), dp(8), dp(6))
            maxLines = 3
            background = GradientDrawable().apply {
                cornerRadius = dp(9).toFloat()
                setColor(Color.argb(22, 255, 255, 255))
                setStroke(dp(1), Color.argb(30, 255, 255, 255))
            }
        }
        captionView = cap
        root.addView(cap, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(7) })

        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val micBtn = makeBtn("Mic") {
            startMicListening()
        }
        micBtnView = micBtn
        refreshMicUi()

        val muteBtn = makeBtn(if (isMutedState) "Unmute" else "Mute") {
            isMutedState = !isMutedState
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_MUTED, isMutedState).apply()
            if (isMutedState) stopTtsSpeaking()
            refreshMuteUi()
            broadcastSync(active = true, status = if (isMutedState) "muted" else "live", error = null)
        }
        muteBtnView = muteBtn
        refreshMuteUi()

        val btnLp1 = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            rightMargin = dp(6)
        }
        val btnLp2 = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        controls.addView(micBtn, btnLp1)
        controls.addView(muteBtn, btnLp2)
        root.addView(controls)

        panelView = root
        panelLp = lp
        try {
            windowManager.addView(root, lp)
        } catch (_: Throwable) {
            panelView = null
        }
    }

    private fun makeBtn(label: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 10.5f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(9), dp(5), dp(9), dp(5))
            background = GradientDrawable().apply {
                cornerRadius = dp(8).toFloat()
                setColor(Color.argb(34, 255, 255, 255))
                setStroke(dp(1), Color.argb(50, 255, 255, 255))
            }
            setOnClickListener { onClick() }
        }
    }
}
