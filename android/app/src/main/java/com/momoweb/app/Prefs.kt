package com.momoweb.app

import android.content.Context

/** 连接设置：全部保存在手机本地（SharedPreferences），不写进仓库。 */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("momo", Context.MODE_PRIVATE)

    var networkName: String
        get() = sp.getString("networkName", "") ?: ""
        set(v) = sp.edit().putString("networkName", v.trim()).apply()
    var networkSecret: String
        get() = sp.getString("networkSecret", "") ?: ""
        set(v) = sp.edit().putString("networkSecret", v).apply()
    /** 每行或逗号分隔一个节点，如 udp://1.2.3.4:11010 */
    var peers: String
        get() = sp.getString("peers", "") ?: ""
        set(v) = sp.edit().putString("peers", v.trim()).apply()
    /** 本机虚拟 IP，如 10.10.10.2/24；留空则由 EasyTier 自动分配（DHCP） */
    var virtualIp: String
        get() = sp.getString("virtualIp", "") ?: ""
        set(v) = sp.edit().putString("virtualIp", v.trim()).apply()
    /** 电脑上 黑黑看单词 的地址 */
    var pcUrl: String
        get() = sp.getString("pcUrl", "") ?: ""
        set(v) = sp.edit().putString("pcUrl", normalizeUrl(v)).apply()

    /** 手机独立模式：网页和数据都在手机上，电脑在线时同步（默认开） */
    var localMode: Boolean
        get() = sp.getBoolean("localMode", true)
        set(v) = sp.edit().putBoolean("localMode", v).apply()

    /** 网页「设置 → 电脑同步」总开关：关掉后独立模式不连电脑，也不在后台启动 EasyTier（默认开） */
    var pcSync: Boolean
        get() = sp.getBoolean("pcSync", true)
        set(v) = sp.edit().putBoolean("pcSync", v).apply()

    /** 填了 EasyTier 网络（独立模式下只用来连电脑同步，可以不填） */
    val easyTierConfigured: Boolean get() = networkName.isNotBlank() && peerList().isNotEmpty()

    /** 能不能开始用：独立模式随时能用；只连电脑模式要填好网络和电脑地址 */
    val configured: Boolean get() = if (localMode) true else networkName.isNotBlank() && pcUrl.isNotBlank()

    fun peerList(): List<String> = peers.split('\n', ',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() }

    /** 解析 "10.10.10.2/24" → ("10.10.10.2", 24)；为空或格式不对返回 null */
    fun staticIp(): Pair<String, Int>? = parseCidr(virtualIp)

    fun toToml(): String {
        val sb = StringBuilder()
        sb.append("instance_name = ").append(q(INSTANCE)).append('\n')
        sb.append("hostname = ").append(q("momo-android")).append('\n')
        val ip = staticIp()
        if (ip != null) {
            sb.append("dhcp = false\n")
            sb.append("ipv4 = ").append(q("${ip.first}/${ip.second}")).append('\n')
        } else {
            sb.append("dhcp = true\n")
        }
        sb.append("\n[network_identity]\n")
        sb.append("network_name = ").append(q(networkName)).append('\n')
        if (networkSecret.isNotEmpty()) sb.append("network_secret = ").append(q(networkSecret)).append('\n')
        for (p in peerList()) {
            sb.append("\n[[peer]]\n")
            sb.append("uri = ").append(q(p)).append('\n')
        }
        return sb.toString()
    }

    companion object {
        const val INSTANCE = "momo"

        fun q(s: String): String = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""

        fun normalizeUrl(v: String): String {
            val t = v.trim().trimEnd('/')
            if (t.isEmpty()) return ""
            return if (t.startsWith("http://") || t.startsWith("https://")) t else "http://$t"
        }

        fun parseCidr(v: String): Pair<String, Int>? {
            val t = v.trim()
            if (t.isEmpty()) return null
            val parts = t.split('/')
            val ip = parts[0].trim()
            val nums = ip.split('.')
            if (nums.size != 4 || nums.any { n -> n.toIntOrNull()?.let { it !in 0..255 } ?: true }) return null
            val prefix = if (parts.size > 1) parts[1].trim().toIntOrNull() ?: return null else 24
            if (prefix !in 1..32) return null
            return ip to prefix
        }

        /** 10.10.10.2 / 24 → 10.10.10.0 */
        fun networkOf(ip: String, prefix: Int): String {
            val n = ip.split('.').map { it.toLong() }.fold(0L) { acc, x -> (acc shl 8) or x }
            val mask = if (prefix == 0) 0L else (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
            val net = n and mask
            return listOf(24, 16, 8, 0).joinToString(".") { ((net shr it) and 0xFF).toString() }
        }

        fun u32ToIp(v: Long): String = listOf(24, 16, 8, 0).joinToString(".") { ((v shr it) and 0xFF).toString() }
    }
}
