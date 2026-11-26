package io.ze.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import org.json.JSONObject
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Persistent Foreground Service untuk Floating Widget TOOLS ML di atas game Mobile Legends:
 * - Bubble bulat kecil hitam transparan di pojok (draggable, resizable kecil/besar, hide, tutup X)
 * - 6 menu panel interaktif (ON/OFF + Info):
 *   1. VN AI (Live AI Coach yang lihat layar)
 *   2. Enemy Lag
 *   3. Match Making Bot
 *   4. Latency Rendah
 *   5. Anti Disconnect
 *   6. Speed Boost
 */
class MLFloatingWidgetService : Service() {

    companion object {
        const val PREFS_NAME = "ml_floating_widget_prefs"
        const val KEY_ENABLED = "ml_widget_enabled"
        const val KEY_HIDDEN = "ml_widget_hidden"
        const val KEY_SIZE = "ml_widget_size"
        const val KEY_ACTIVE_TOOLS = "ml_widget_active_tools"

        const val ACTION_START = "io.ze.app.ML_WIDGET_START"
        const val ACTION_STOP = "io.ze.app.ML_WIDGET_STOP"
        const val ACTION_HIDE = "io.ze.app.ML_WIDGET_HIDE"
        const val ACTION_SHOW = "io.ze.app.ML_WIDGET_SHOW"
        const val ACTION_UPDATE = "io.ze.app.ML_WIDGET_UPDATE"
        const val ACTION_ML_WIDGET_SYNC = "io.ze.app.ML_WIDGET_SYNC"
        const val ACTION_REQUEST_VN_AI_START = "io.ze.app.ML_WIDGET_REQUEST_VN_AI_START"

        private const val CHANNEL_ID = "ml_floating_widget_channel"
        private const val NOTIF_ID = 4010
    }

    private data class InfoMenuItem(
        val id: String,
        val indexLabel: String,
        val title: String,
        val subtitle: String,
        val badge: String? = null,
        val heading: String,
        val tips: List<String>,
        val note: String
    )

    private val infoMenus = listOf(
        InfoMenuItem(
            id = "vn_ai",
            indexLabel = "01",
            title = "VN AI",
            subtitle = "AI Coach yang liat layar lu",
            badge = "LIVE",
            heading = "VN AI Live Coach — Analisis Layar Real-time",
            tips = listOf(
                "Tap kartu VN AI untuk mengaktifkan overlay AI Coach (membutuhkan izin Overlay, Mic & Tangkap Layar).",
                "Saat aktif, VN AI memantau layar match secara berkala dan langsung memberi callout singkat suara cowok berbahasa Indonesia.",
                "Tekan tombol Mic pada pill VN AI kapan saja untuk bertanya strategi atau counter item secara langsung."
            ),
            note = "Coach AI real-time pasif — membaca tampilan layar dan menjawab lewat suara tanpa memodifikasi game."
        ),
        InfoMenuItem(
            id = "enemy_lag",
            indexLabel = "02",
            title = "Enemy Lag",
            subtitle = "Info lag jaringan",
            badge = null,
            heading = "Info Jaringan & Lag di Match",
            tips = listOf(
                "Lag jaringan terjadi akibat jitter tinggi, packet loss, atau routing ISP yang padat pada sisi jaringan pemain.",
                "Menjaga ping perangkat sendiri tetap rendah membuat respons skill tetap konsisten saat teamfight.",
                "Hindari aktivitas unduh/unggah di latar belakang agar bandwidth game tetap stabil."
            ),
            note = "Panel info saja — tidak mengganggu atau memengaruhi koneksi pemain lawan."
        ),
        InfoMenuItem(
            id = "matchmaking_bot",
            indexLabel = "03",
            title = "Match Making Bot",
            subtitle = "Cek com.mobilelegends.com",
            badge = null,
            heading = "Info Match Bot & Cek com.mobilelegends.com",
            tips = listOf(
                "Match melawan Bot / Computer tersedia resmi lewat mode VS A.I. atau Custom di Mobile Legends.",
                "Pengecekan otomatis domain com.mobilelegends.com di bawah ini hanya mengecek keterjangkauan jaringan secara pasif.",
                "Untuk latihan hero lawan komputer, gunakan mode VS A.I. atau Training Camp resmi MLBB."
            ),
            note = "Panel info & cek konektivitas saja — tidak melakukan auto-match atau manipulasi lobby."
        ),
        InfoMenuItem(
            id = "latency_rendah",
            indexLabel = "04",
            title = "Latency Rendah",
            subtitle = "Setting jaringan cepat",
            badge = null,
            heading = "Tips Setting Jaringan Cepat",
            tips = listOf(
                "Gunakan Wi-Fi 5 GHz atau sinyal 4G/5G stabil dengan bar sinyal penuh.",
                "Aktifkan Private DNS cepat (1.1.1.1 atau dns.google) di pengaturan jaringan HP.",
                "Nyalakan Network Boost / Speed Mode di pengaturan jaringan MLBB dan tutup aplikasi background."
            ),
            note = "Panel info saja — pengaturan dilakukan di sistem HP dan menu game."
        ),
        InfoMenuItem(
            id = "anti_disconnect",
            indexLabel = "05",
            title = "Anti Disconnect",
            subtitle = "Baterai, sinyal, jangan ganggu",
            badge = null,
            heading = "Checklist Anti Disconnect (DC)",
            tips = listOf(
                "Baterai: jaga daya di atas 20% dan matikan Penghemat Baterai agar modem serta CPU tidak dibatasi.",
                "Sinyal: kunci ke satu koneksi stabil (Wi-Fi saja atau Data saja) agar IP tidak berubah saat match.",
                "Mode Jangan Ganggu: aktifkan Do Not Disturb (DND) agar panggilan & popup tidak memutus layar game."
            ),
            note = "Panel info saja — pengaturan baterai, sinyal, dan DND diatur dari perangkat."
        ),
        InfoMenuItem(
            id = "speed_boost",
            indexLabel = "06",
            title = "Speed Boost",
            subtitle = "Mode performa, bersihin RAM",
            badge = null,
            heading = "Tips Setting HP & Bersihin RAM",
            tips = listOf(
                "Mode Performa: aktifkan Mode Performa / Game Mode / Game Turbo bawaan HP untuk prioritas CPU & GPU.",
                "Bersihin RAM: tutup aplikasi berat di Recent Apps sebelum buka MLBB supaya memori RAM lega.",
                "Sesuaikan grafis dan refresh rate dengan suhu HP agar terhindar dari thermal throttling."
            ),
            note = "Panel info saja — tidak menyuntikkan file atau mengubah kecepatan game."
        )
    )

    private lateinit var windowManager: WindowManager
    private var bubbleView: View? = null
    private var hiddenPillView: View? = null
    private var panelView: View? = null
    private var bubbleLp: WindowManager.LayoutParams? = null
    private var panelLp: WindowManager.LayoutParams? = null

    private var isExpanded = false
    private var selectedMenuId: String? = null
    private var domainCheckText = "Memeriksa com.mobilelegends.com..."
    private val mainHandler = Handler(Looper.getMainLooper())
    private val checkExecutor = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createChannel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()

        when (intent?.action) {
            ACTION_STOP -> {
                prefs().edit().putBoolean(KEY_ENABLED, false).putBoolean(KEY_HIDDEN, false).apply()
                removeAllViews()
                broadcastSync()
                stopSelfSafely()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                prefs().edit().putBoolean(KEY_ENABLED, true).putBoolean(KEY_HIDDEN, false).apply()
                broadcastSync()
                mainHandler.post {
                    try {
                        Toast.makeText(applicationContext, "Floating Widget ML aktif", Toast.LENGTH_SHORT).show()
                    } catch (_: Throwable) {}
                }
            }
            ACTION_HIDE -> {
                prefs().edit().putBoolean(KEY_HIDDEN, true).apply()
                isExpanded = false
                broadcastSync()
            }
            ACTION_SHOW -> {
                prefs().edit().putBoolean(KEY_ENABLED, true).putBoolean(KEY_HIDDEN, false).apply()
                broadcastSync()
            }
            ACTION_UPDATE -> {
                // Preferences sudah di-update sebelum memanggil service
            }
        }

        syncOverlays()
        return START_STICKY
    }

    override fun onDestroy() {
        removeAllViews()
        checkExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private fun isEnabled() = prefs().getBoolean(KEY_ENABLED, false)
    private fun isHidden() = prefs().getBoolean(KEY_HIDDEN, false)
    private fun getSizeMode(): String = prefs().getString(KEY_SIZE, "medium") ?: "medium"

    private fun getActiveToolsMap(): MutableMap<String, Boolean> {
        val out = linkedMapOf(
            "vn_ai" to false,
            "enemy_lag" to false,
            "matchmaking_bot" to false,
            "latency_rendah" to false,
            "anti_disconnect" to false,
            "speed_boost" to false
        )
        val raw = prefs().getString(KEY_ACTIVE_TOOLS, "") ?: ""
        if (raw.isNotBlank()) {
            try {
                val obj = JSONObject(raw)
                for (key in out.keys.toList()) {
                    if (obj.has(key)) {
                        out[key] = obj.optBoolean(key, false)
                    }
                }
            } catch (_: Throwable) {}
        }
        out["vn_ai"] = VNAIOverlayService.isRunning || (out["vn_ai"] == true)
        return out
    }

    private fun saveActiveToolsMap(map: Map<String, Boolean>) {
        val obj = JSONObject()
        for ((k, v) in map) obj.put(k, v)
        prefs().edit().putString(KEY_ACTIVE_TOOLS, obj.toString()).apply()
        broadcastSync()
    }

    private fun toggleToolFromOverlay(toolId: String) {
        val map = getActiveToolsMap()
        val nextVal = !(map[toolId] ?: false)
        map[toolId] = nextVal
        saveActiveToolsMap(map)

        if (toolId == "vn_ai") {
            if (nextVal) {
                if (!VNAIOverlayService.isRunning) {
                    sendBroadcast(Intent(ACTION_REQUEST_VN_AI_START).apply { setPackage(packageName) })
                    if (!MainActivity.isAppInForeground) {
                        val openIntent = Intent(this, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                            putExtra(MainActivity.EXTRA_REQUEST_VN_AI_START, true)
                        }
                        try { startActivity(openIntent) } catch (_: Throwable) {}
                    }
                }
            } else {
                val stopIntent = Intent(this, VNAIOverlayService::class.java).apply {
                    action = VNAIOverlayService.ACTION_STOP
                }
                try { startService(stopIntent) } catch (_: Throwable) {}
            }
        } else if (toolId == "matchmaking_bot" && nextVal) {
            runDomainCheckAsync()
        }

        syncOverlays()
    }

    private fun saveSizeMode(mode: String) {
        prefs().edit().putString(KEY_SIZE, mode).apply()
        broadcastSync()
    }

    private fun broadcastSync() {
        val toolsJson = JSONObject().apply {
            val map = getActiveToolsMap()
            for ((k, v) in map) put(k, v)
        }.toString()
        val syncIntent = Intent(ACTION_ML_WIDGET_SYNC).apply {
            setPackage(packageName)
            putExtra(KEY_ENABLED, isEnabled())
            putExtra(KEY_HIDDEN, isHidden())
            putExtra(KEY_SIZE, getSizeMode())
            putExtra(KEY_ACTIVE_TOOLS, toolsJson)
        }
        sendBroadcast(syncIntent)
    }

    private fun stopSelfSafely() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Floating Widget ML",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Panel info TOOLS ML mengambang di atas Mobile Legends"
                setShowBadge(false)
            }
            mgr.createNotificationChannel(channel)
        }
    }

    private fun startAsForeground() {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val pi = PendingIntent.getActivity(
            this,
            21,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val showPi = PendingIntent.getService(
            this,
            22,
            Intent(this, MLFloatingWidgetService::class.java).apply { action = ACTION_SHOW },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopPi = PendingIntent.getService(
            this,
            23,
            Intent(this, MLFloatingWidgetService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Floating Widget ML")
            .setContentText("Panel info 6 menu aktif di atas layar")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pi)
            .addAction(android.R.drawable.ic_menu_view, "Tampilkan", showPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Tutup", stopPi)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun canOverlay(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
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

    private fun removeAllViews() {
        removePanel()
        removeBubble()
        removeHiddenPill()
    }

    private fun removeBubble() {
        bubbleView?.let {
            try { windowManager.removeView(it) } catch (_: Throwable) {}
        }
        bubbleView = null
    }

    private fun removeHiddenPill() {
        hiddenPillView?.let {
            try { windowManager.removeView(it) } catch (_: Throwable) {}
        }
        hiddenPillView = null
    }

    private fun removePanel() {
        panelView?.let {
            try { windowManager.removeView(it) } catch (_: Throwable) {}
        }
        panelView = null
    }

    private fun syncOverlays() {
        if (!canOverlay()) return
        if (!isEnabled()) {
            removeAllViews()
            stopSelfSafely()
            return
        }

        if (isHidden()) {
            removePanel()
            removeBubble()
            ensureHiddenPill()
            return
        }

        removeHiddenPill()
        if (isExpanded) {
            removeBubble()
            showOrRefreshPanel()
        } else {
            removePanel()
            showOrRefreshBubble()
        }
    }

    private fun bubbleDiameterDp(): Int {
        return when (getSizeMode()) {
            "small" -> 42
            "large" -> 60
            else -> 50
        }
    }

    private fun panelWidthDp(): Int {
        return when (getSizeMode()) {
            "small" -> 236
            "large" -> 304
            else -> 268
        }
    }

    private fun showOrRefreshBubble() {
        removeBubble()
        val bubbleDp = bubbleDiameterDp()
        val wrapperSize = dp(bubbleDp + 10)
        val circleSize = dp(bubbleDp)

        val container = FrameLayout(this)

        val activeCount = getActiveToolsMap().values.count { it }
        val circle = TextView(this).apply {
            text = if (activeCount > 0) "ML\n${activeCount} ON" else "ML"
            setTextColor(Color.WHITE)
            textSize = when (getSizeMode()) {
                "small" -> if (activeCount > 0) 9f else 11f
                "large" -> if (activeCount > 0) 11f else 14f
                else -> if (activeCount > 0) 10f else 12f
            }
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(218, 10, 10, 12))
                setStroke(
                    dp(if (activeCount > 0) 2 else 1),
                    if (activeCount > 0) Color.rgb(239, 68, 68) else Color.argb(72, 255, 255, 255)
                )
            }
        }
        val circleLp = FrameLayout.LayoutParams(circleSize, circleSize).apply {
            gravity = Gravity.BOTTOM or Gravity.START
        }
        container.addView(circle, circleLp)

        // Tombol X kecil di pojok atas kanan bubble
        val closeDot = TextView(this).apply {
            text = "×"
            setTextColor(Color.WHITE)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(240, 10, 10, 12))
                setStroke(dp(1), Color.argb(95, 255, 255, 255))
            }
            setOnClickListener {
                prefs().edit().putBoolean(KEY_ENABLED, false).putBoolean(KEY_HIDDEN, false).apply()
                isExpanded = false
                removeAllViews()
                broadcastSync()
                stopSelfSafely()
            }
        }
        val closeLp = FrameLayout.LayoutParams(dp(19), dp(19)).apply {
            gravity = Gravity.TOP or Gravity.END
        }
        container.addView(closeDot, closeLp)

        val dm = resources.displayMetrics
        val lp = bubbleLp ?: WindowManager.LayoutParams(
            wrapperSize,
            wrapperSize,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (dm.widthPixels - wrapperSize - dp(12)).coerceAtLeast(dp(8))
            y = (dm.heightPixels / 4).coerceAtLeast(dp(48))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        lp.width = wrapperSize
        lp.height = wrapperSize

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
                    lp.x = (startX + dx).coerceIn(0, (dm.widthPixels - wrapperSize).coerceAtLeast(0))
                    lp.y = (startY + dy).coerceIn(0, (dm.heightPixels - wrapperSize).coerceAtLeast(0))
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

    private fun ensureHiddenPill() {
        if (hiddenPillView != null) return
        val dm = resources.displayMetrics
        val pill = TextView(this).apply {
            text = "ML"
            setTextColor(Color.argb(210, 255, 255, 255))
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(10), dp(8), dp(10))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(14).toFloat()
                setColor(Color.argb(185, 10, 10, 12))
                setStroke(dp(1), Color.argb(60, 255, 255, 255))
            }
        }

        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 0
            y = (dm.heightPixels / 3).coerceAtLeast(dp(64))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var startY = 0
        var touchY = 0f
        var moved = false
        pill.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startY = lp.y
                    touchY = event.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dy = (event.rawY - touchY).toInt()
                    if (abs(dy) > touchSlop) moved = true
                    lp.y = (startY + dy).coerceIn(dp(24), (dm.heightPixels - dp(80)).coerceAtLeast(dp(24)))
                    try { windowManager.updateViewLayout(pill, lp) } catch (_: Throwable) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        prefs().edit().putBoolean(KEY_HIDDEN, false).apply()
                        broadcastSync()
                        syncOverlays()
                    }
                    true
                }
                else -> false
            }
        }

        hiddenPillView = pill
        try {
            windowManager.addView(pill, lp)
        } catch (_: Throwable) {
            hiddenPillView = null
        }
    }

    private fun showOrRefreshPanel() {
        removePanel()
        val dm = resources.displayMetrics
        val widthPx = dp(panelWidthDp())
        val lp = panelLp ?: WindowManager.LayoutParams(
            widthPx,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = ((dm.widthPixels - widthPx) / 2).coerceAtLeast(dp(10))
            y = (dm.heightPixels / 5).coerceAtLeast(dp(40))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        lp.width = widthPx

        val view = buildPanelView(lp)
        panelView = view
        panelLp = lp
        try {
            windowManager.addView(view, lp)
        } catch (_: Throwable) {
            panelView = null
        }
    }

    private fun buildMonochromeButton(label: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(4), dp(8), dp(4))
            background = GradientDrawable().apply {
                cornerRadius = dp(7).toFloat()
                setColor(Color.argb(32, 255, 255, 255))
                setStroke(dp(1), Color.argb(45, 255, 255, 255))
            }
            setOnClickListener { onClick() }
        }
    }

    private fun runDomainCheckAsync() {
        domainCheckText = "Memeriksa com.mobilelegends.com..."
        checkExecutor.execute {
            val start = System.currentTimeMillis()
            val resultMsg = try {
                val url = URL("https://com.mobilelegends.com/")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "HEAD"
                    connectTimeout = 4000
                    readTimeout = 4000
                    instanceFollowRedirects = true
                }
                val code = conn.responseCode
                conn.disconnect()
                val ms = (System.currentTimeMillis() - start).coerceAtLeast(1)
                "com.mobilelegends.com merespons (HTTP $code · ${ms} ms)"
            } catch (_: Throwable) {
                "com.mobilelegends.com tidak merespons / jaringan dibatasi."
            }
            domainCheckText = resultMsg
            mainHandler.post {
                if (isExpanded && selectedMenuId == "matchmaking_bot" && !isHidden() && isEnabled()) {
                    showOrRefreshPanel()
                }
            }
        }
    }

    private fun buildPanelView(lp: WindowManager.LayoutParams): View {
        val dm = resources.displayMetrics
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(12))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(16).toFloat()
                setColor(Color.argb(226, 10, 10, 12))
                setStroke(dp(1), Color.argb(52, 255, 255, 255))
            }
        }

        // Header bar (draggable)
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(8))
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
                    lp.y = (dragY + (event.rawY - touchY).toInt()).coerceIn(0, (dm.heightPixels - dp(120)).coerceAtLeast(0))
                    try { windowManager.updateViewLayout(root, lp) } catch (_: Throwable) {}
                    true
                }
                else -> false
            }
        }

        val titleView = TextView(this).apply {
            text = "TOOLS ML"
            setTextColor(Color.WHITE)
            textSize = when (getSizeMode()) {
                "small" -> 11f
                "large" -> 13f
                else -> 12f
            }
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        header.addView(titleView)

        val btnSmall = buildMonochromeButton("-") {
            val next = when (getSizeMode()) {
                "large" -> "medium"
                else -> "small"
            }
            saveSizeMode(next)
            showOrRefreshPanel()
        }
        val btnLarge = buildMonochromeButton("+") {
            val next = when (getSizeMode()) {
                "small" -> "medium"
                else -> "large"
            }
            saveSizeMode(next)
            showOrRefreshPanel()
        }
        val btnHide = buildMonochromeButton("Hide") {
            prefs().edit().putBoolean(KEY_HIDDEN, true).apply()
            broadcastSync()
            syncOverlays()
        }
        val btnMin = buildMonochromeButton("○") {
            isExpanded = false
            syncOverlays()
        }
        val btnClose = buildMonochromeButton("X") {
            prefs().edit().putBoolean(KEY_ENABLED, false).putBoolean(KEY_HIDDEN, false).apply()
            isExpanded = false
            removeAllViews()
            broadcastSync()
            stopSelfSafely()
        }

        val gapLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { leftMargin = dp(4) }
        header.addView(btnSmall)
        header.addView(btnLarge, gapLp)
        header.addView(btnHide, gapLp)
        header.addView(btnMin, gapLp)
        header.addView(btnClose, gapLp)
        root.addView(header)

        // Divider
        val divider = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply {
                bottomMargin = dp(8)
            }
            setBackgroundColor(Color.argb(26, 255, 255, 255))
        }
        root.addView(divider)

        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val activeInfo = infoMenus.firstOrNull { it.id == selectedMenuId }
        if (activeInfo != null) {
            val topNav = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, dp(8))
            }
            val backBtn = buildMonochromeButton("< Menu") {
                selectedMenuId = null
                showOrRefreshPanel()
            }
            val badge = TextView(this).apply {
                text = "PANEL INFO"
                setTextColor(Color.argb(145, 255, 255, 255))
                textSize = 9.5f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.END
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            topNav.addView(backBtn)
            topNav.addView(badge)
            content.addView(topNav)

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(10), dp(10), dp(10), dp(10))
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(Color.argb(18, 255, 255, 255))
                    setStroke(dp(1), Color.argb(32, 255, 255, 255))
                }
            }
            card.addView(TextView(this).apply {
                text = activeInfo.title
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
            })
            card.addView(TextView(this).apply {
                text = activeInfo.heading
                setTextColor(Color.argb(165, 255, 255, 255))
                textSize = 10.5f
                setPadding(0, dp(2), 0, dp(6))
            })

            for (tip in activeInfo.tips) {
                card.addView(TextView(this).apply {
                    text = "• $tip"
                    setTextColor(Color.argb(215, 255, 255, 255))
                    textSize = 10.5f
                    setPadding(0, dp(3), 0, dp(3))
                })
            }

            if (activeInfo.id == "matchmaking_bot") {
                val checkHeader = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(0, dp(8), 0, dp(4))
                }
                checkHeader.addView(TextView(this).apply {
                    text = "Cek com.mobilelegends.com"
                    setTextColor(Color.argb(180, 255, 255, 255))
                    textSize = 10f
                    typeface = Typeface.DEFAULT_BOLD
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                checkHeader.addView(buildMonochromeButton("Cek") {
                    runDomainCheckAsync()
                    showOrRefreshPanel()
                })
                card.addView(checkHeader)
                card.addView(TextView(this).apply {
                    text = domainCheckText
                    setTextColor(Color.argb(180, 255, 255, 255))
                    textSize = 10f
                })
            }

            card.addView(TextView(this).apply {
                text = activeInfo.note
                setTextColor(Color.argb(135, 255, 255, 255))
                textSize = 9.5f
                setPadding(0, dp(8), 0, 0)
            })
            content.addView(card)
        } else {
            // 6 Interactive Menu Cards (2 columns x 3 rows) with ON/OFF + (i) Info button
            val toolsState = getActiveToolsMap()
            val activeCount = toolsState.values.count { it }
            content.addView(TextView(this).apply {
                text = if (activeCount > 0) "Aktif: $activeCount/6 fitur ON" else "Semua fitur OFF · Tap kartu ON/OFF"
                setTextColor(if (activeCount > 0) Color.rgb(248, 113, 113) else Color.argb(170, 255, 255, 255))
                textSize = 9.5f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(2), 0, dp(2), dp(6))
            })

            for (rowIndex in 0 until 3) {
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        if (rowIndex > 0) topMargin = dp(6)
                    }
                }
                for (colIndex in 0 until 2) {
                    val item = infoMenus[rowIndex * 2 + colIndex]
                    val isToolActive = toolsState[item.id] == true
                    val card = LinearLayout(this).apply {
                        orientation = LinearLayout.VERTICAL
                        setPadding(dp(9), dp(8), dp(9), dp(8))
                        background = GradientDrawable().apply {
                            cornerRadius = dp(11).toFloat()
                            setColor(if (isToolActive) Color.argb(36, 239, 68, 68) else Color.argb(18, 255, 255, 255))
                            setStroke(
                                dp(1),
                                if (isToolActive) Color.rgb(239, 68, 68) else Color.argb(30, 255, 255, 255)
                            )
                        }
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                            if (colIndex == 0) rightMargin = dp(6)
                        }
                        setOnClickListener {
                            toggleToolFromOverlay(item.id)
                        }
                    }

                    val topRow = LinearLayout(this).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                    }
                    topRow.addView(TextView(this).apply {
                        text = if (item.badge != null) "${item.indexLabel} ${item.badge}" else item.indexLabel
                        setTextColor(if (item.badge != null || isToolActive) Color.rgb(248, 113, 113) else Color.argb(120, 255, 255, 255))
                        textSize = 8.5f
                        typeface = Typeface.DEFAULT_BOLD
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    })
                    topRow.addView(TextView(this).apply {
                        text = "i"
                        setTextColor(Color.argb(200, 255, 255, 255))
                        textSize = 9f
                        typeface = Typeface.DEFAULT_BOLD
                        gravity = Gravity.CENTER
                        setPadding(dp(5), dp(1), dp(5), dp(1))
                        background = GradientDrawable().apply {
                            cornerRadius = dp(6).toFloat()
                            setColor(Color.argb(30, 255, 255, 255))
                        }
                        setOnClickListener {
                            selectedMenuId = item.id
                            if (item.id == "matchmaking_bot") {
                                runDomainCheckAsync()
                            }
                            showOrRefreshPanel()
                        }
                    })
                    card.addView(topRow)

                    card.addView(TextView(this).apply {
                        text = item.title
                        setTextColor(Color.WHITE)
                        textSize = when (getSizeMode()) {
                            "small" -> 10.5f
                            "large" -> 12.5f
                            else -> 11.5f
                        }
                        typeface = Typeface.DEFAULT_BOLD
                        setPadding(0, dp(3), 0, dp(2))
                    })
                    card.addView(TextView(this).apply {
                        text = item.subtitle
                        setTextColor(Color.argb(155, 255, 255, 255))
                        textSize = 9f
                        maxLines = 2
                    })
                    card.addView(TextView(this).apply {
                        text = if (isToolActive) "● ON" else "○ OFF"
                        setTextColor(if (isToolActive) Color.rgb(248, 113, 113) else Color.argb(120, 255, 255, 255))
                        textSize = 8.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setPadding(0, dp(4), 0, 0)
                    })
                    row.addView(card)
                }
                content.addView(row)
            }

            content.addView(TextView(this).apply {
                text = "Tap kartu ON/OFF · Tekan (i) untuk info · Drag header"
                setTextColor(Color.argb(125, 255, 255, 255))
                textSize = 9f
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, 0)
            })
        }

        scroll.addView(content)
        root.addView(scroll)
        return root
    }
}
