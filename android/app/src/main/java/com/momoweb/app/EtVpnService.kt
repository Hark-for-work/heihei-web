package com.momoweb.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import com.easytier.jni.EasyTierJNI
import org.json.JSONArray
import org.json.JSONObject

/** 内置 EasyTier：启动网络实例 → 拿到虚拟 IP → 建 TUN 交给 EasyTier。只路由虚拟网段，不影响手机其它流量。 */
class EtVpnService : VpnService() {

    companion object {
        const val ACTION_START = "com.momoweb.app.START"
        const val ACTION_STOP = "com.momoweb.app.STOP"
        private const val TAG = "MomoVpn"
        private const val CHANNEL = "vpn"
        private const val NOTIFY_ID = 1

        @Volatile var status: String = "未连接"
            private set
        @Volatile var connected: Boolean = false
            private set
        @Volatile var running: Boolean = false
            private set
        @Volatile var localIp: String = ""
            private set
        /** 最近一次 collectNetworkInfos 的原始 JSON，给诊断页看 */
        @Volatile var lastInfo: String = ""
        @Volatile var lastError: String = ""

        /** MainActivity 监听状态变化（主线程回调） */
        var listener: (() -> Unit)? = null
        private val main = Handler(Looper.getMainLooper())

        fun post(s: String, ok: Boolean = false) {
            status = s
            connected = ok
            Log.i(TAG, s)
            main.post { listener?.invoke() }
        }
    }

    private var tun: ParcelFileDescriptor? = null
    private var worker: Thread? = null
    @Volatile private var stopping = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown("已断开")
            stopSelf()
            return START_NOT_STICKY
        }
        goForeground("正在连接虚拟网…")
        if (worker?.isAlive == true) return START_STICKY
        stopping = false
        running = true
        worker = Thread({
            try {
                connect()
            } catch (t: Throwable) {
                Log.e(TAG, "connect failed", t)
                shutdown("连接失败：${describe(t)}")
                stopSelf()
            }
        }, "easytier").also { it.start() }
        return START_STICKY
    }

    /** 把异常链拼成一句能看懂的话（原生库加载失败时外层异常只有类名） */
    private fun describe(t: Throwable): String {
        val parts = mutableListOf<String>()
        var c: Throwable? = t
        while (c != null && parts.size < 4) {
            parts += "${c.javaClass.simpleName}: ${c.message ?: ""}".trim()
            c = c.cause
        }
        return parts.joinToString(" ← ")
    }

    private fun connect() {
        // 先加载 EasyTier 核心库，再加载 JNI 库
        System.loadLibrary("easytier_ffi")
        val prefs = Prefs(this)
        val cfg = prefs.toToml()
        lastInfo = ""; lastError = ""
        Log.i(TAG, "config:\n" + cfg.replace(Regex("network_secret = .*"), "network_secret = ***"))
        post("正在启动 EasyTier…")
        if (EasyTierJNI.parseConfig(cfg) != 0) throw IllegalStateException("配置有误：${EasyTierJNI.getLastError() ?: ""}")
        runCatching { EasyTierJNI.stopAllInstances() }
        if (EasyTierJNI.runNetworkInstance(cfg) != 0) throw IllegalStateException(EasyTierJNI.getLastError() ?: "EasyTier 启动失败")

        var ip = prefs.staticIp()
        if (ip == null) {
            post("正在获取虚拟 IP…")
            val start = System.currentTimeMillis()
            val deadline = start + 60_000
            while (ip == null && !stopping && System.currentTimeMillis() < deadline) {
                Thread.sleep(1000)
                val r = readInfo()
                ip = r.first
                val secs = (System.currentTimeMillis() - start) / 1000
                val err = r.second
                post("正在获取虚拟 IP…（已等 ${secs} 秒，连上 ${peerCount()} 个节点）" + if (err.isNullOrBlank()) "" else "\nEasyTier：$err")
            }
            if (ip == null) {
                if (stopping) return
                throw IllegalStateException("60 秒内没有拿到虚拟 IP：检查网络名称、密码和节点地址，或在设置里手动填本机虚拟 IP")
            }
        }
        if (stopping) return

        val (addr, prefix) = ip
        val builder = Builder()
            .setSession("黑黑看单词 · EasyTier")
            .setMtu(1300)
            .addAddress(addr, prefix)
            .addRoute(Prefs.networkOf(addr, prefix), prefix)
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        builder.setConfigureIntent(pi)
        val fd = builder.establish() ?: throw IllegalStateException("系统没有授予 VPN 权限")
        tun = fd
        if (EasyTierJNI.setTunFd(Prefs.INSTANCE, fd.fd) != 0) throw IllegalStateException(EasyTierJNI.getLastError() ?: "设置 TUN 失败")

        localIp = "$addr/$prefix"
        post("已连接 · 本机 $addr", true)
        goForeground("已连接 · 本机 $addr")

        // 运行期间留意 EasyTier 报错
        while (!stopping) {
            Thread.sleep(5000)
            val err = runCatching { readInfo().second }.getOrNull()
            if (!err.isNullOrBlank()) post("EasyTier：$err", true)
        }
    }

    /** 从 collectNetworkInfos 的 JSON 里找虚拟 IP 和错误信息 */
    private fun readInfo(): Pair<Pair<String, Int>?, String?> {
        val raw = runCatching { EasyTierJNI.collectNetworkInfos(10) }.getOrNull() ?: return null to null
        var ip: Pair<String, Int>? = null
        var err: String? = null
        fun walk(v: Any?) {
            when (v) {
                is JSONObject -> {
                    val vip = v.optJSONObject("virtual_ipv4")
                    if (ip == null && vip != null) {
                        val a = vip.optJSONObject("address")
                        val n = a?.optLong("addr", 0) ?: 0
                        val len = vip.optInt("network_length", 24)
                        if (n != 0L) ip = Prefs.u32ToIp(n) to len
                    }
                    val e = v.opt("error_msg")
                    if (e is String && e.isNotBlank()) err = e
                    v.keys().forEach { walk(v.opt(it)) }
                }
                is JSONArray -> for (i in 0 until v.length()) walk(v.opt(i))
                is String -> if (v.startsWith("{")) runCatching { walk(JSONObject(v)) }
            }
        }
        lastInfo = raw
        runCatching { walk(JSONObject(raw)) }
        if (!err.isNullOrBlank()) lastError = err!!
        return ip to err
    }

    /** 粗略统计已连上的节点数（第一个 peers 数组的长度） */
    private fun peerCount(): Int {
        var n = 0
        fun walk(v: Any?): Boolean {
            when (v) {
                is JSONObject -> {
                    val arr = v.optJSONArray("peers")
                    if (arr != null) { n = arr.length(); return true }
                    for (k in v.keys()) if (walk(v.opt(k))) return true
                }
                is JSONArray -> for (i in 0 until v.length()) if (walk(v.opt(i))) return true
            }
            return false
        }
        runCatching { walk(JSONObject(lastInfo)) }
        return n
    }

    private fun shutdown(msg: String) {
        stopping = true
        runCatching { EasyTierJNI.stopAllInstances() }
        runCatching { tun?.close() }
        tun = null
        localIp = ""
        running = false
        post(msg, false)
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    override fun onRevoke() {
        shutdown("VPN 已被系统或其它 VPN 应用关闭")
        stopSelf()
    }

    override fun onDestroy() {
        if (running) shutdown("已断开")
        super.onDestroy()
    }

    private fun goForeground(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "虚拟网连接", NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, EtVpnService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        val n = b.setContentTitle("黑黑看单词")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, "断开", stop).build())
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFY_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFY_ID, n)
    }
}
