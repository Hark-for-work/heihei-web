package com.momoweb.app

import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Typeface
import android.os.Bundle
import android.os.Process
import android.view.Menu
import android.view.MenuItem
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import kotlin.concurrent.thread

/** 诊断信息：当前状态、配置（密码打码）、EasyTier 运行信息和本应用日志，可一键复制发给开发者。 */
class DiagActivity : AppCompatActivity() {
    private lateinit var text: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        Theming.applyNightMode(this)
        super.onCreate(savedInstanceState)
        Theming.applyColors(this)
        supportActionBar?.title = "诊断信息"
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        text = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 11f
            setTextIsSelectable(true)
            val p = (12 * resources.displayMetrics.density).toInt()
            setPadding(p, p, p, p)
        }
        setContentView(ScrollView(this).apply { addView(HorizontalScrollView(context).apply { addView(text) }) })
        refresh()
    }

    private fun refresh() {
        text.text = "正在收集…"
        thread {
            val sb = StringBuilder()
            sb.append("版本：").append(BuildConfigCompat.versionName(this)).append('\n')
            sb.append("状态：").append(EtVpnService.status).append('\n')
            sb.append("running=").append(EtVpnService.running).append(" connected=").append(EtVpnService.connected)
                .append(" ip=").append(EtVpnService.localIp).append('\n')
            if (EtVpnService.lastError.isNotBlank()) sb.append("EasyTier 错误：").append(EtVpnService.lastError).append('\n')
            sb.append("\n== 配置 ==\n")
            sb.append(Prefs(this).toToml().replace(Regex("network_secret = .*"), "network_secret = \"***\""))
            sb.append("电脑页面地址 = ").append(Prefs(this).pcUrl).append('\n')
            sb.append("\n== EasyTier 运行信息 ==\n")
            val info = EtVpnService.lastInfo
            sb.append(if (info.isBlank()) "（暂无）" else runCatching { JSONObject(info).toString(1) }.getOrDefault(info).take(30000))
            sb.append("\n\n== 日志 ==\n")
            sb.append(runCatching {
                val p = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-v", "time", "--pid=${Process.myPid()}", "-t", "300"))
                p.inputStream.bufferedReader().readText()
            }.getOrElse { "读取日志失败：${it.message}" })
            runOnUiThread { text.text = sb.toString() }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, "复制").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        menu.add(0, 2, 1, "刷新").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            1 -> {
                getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("momo-diag", text.text))
                Toast.makeText(this, "已复制，可以粘贴发给我", Toast.LENGTH_SHORT).show()
            }
            2 -> refresh()
            android.R.id.home -> finish()
            else -> return super.onOptionsItemSelected(item)
        }
        return true
    }
}
