package com.momoweb.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.CircularProgressIndicator
import android.content.ContentValues
import android.content.res.Configuration
import android.graphics.Color
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintManager
import android.provider.MediaStore
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.io.File

class MainActivity : AppCompatActivity() {
    companion object {
        const val LOCAL_HOST = "momo.local"
        const val LOCAL_URL = "https://momo.local/index.html"
        private const val REQ_VPN = 1
        private const val REQ_SETTINGS = 2
        private const val REQ_FILE = 3
    }

    private lateinit var prefs: Prefs
    private val localDb by lazy { LocalDb(this) }
    private lateinit var web: WebView
    private lateinit var statusPane: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var progress: CircularProgressIndicator
    private lateinit var retryBtn: MaterialButton
    private var loadedUrl: String? = null
    private var pageFailed = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var printView: WebView? = null
    private lateinit var root: FrameLayout
    private var insetTop = 0
    private var insetBottom = 0
    private val dp by lazy { resources.displayMetrics.density }
    private fun px(v: Int) = (v * dp).toInt()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        // 沉浸式全屏：内容画到状态栏和导航栏下面，网页自己按安全区留白
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 29) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }

        web = WebView(this).apply {
            isVerticalScrollBarEnabled = false   // 去掉右侧滚动条
            isHorizontalScrollBarEnabled = false
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true   // 网页设置存在 localStorage
            settings.databaseEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.userAgentString = settings.userAgentString + " MomoAndroid/1"
            addJavascriptInterface(Bridge(), "MomoAndroid")
            webViewClient = object : WebViewClient() {
                // 外部链接（检查更新、GitHub 等）交给系统默认浏览器，不在 App 里打开
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val u = request.url
                    if (u.scheme != "http" && u.scheme != "https") return false
                    val own = setOf("momo.local", runCatching { Uri.parse(prefs.pcUrl).host }.getOrNull())
                    if (u.host in own) return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)) }
                    return true
                }
                // 手机独立模式：https://momo.local/ 由 App 内置的网页文件提供
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val u = request.url
                    if (u.host != LOCAL_HOST) return null
                    var p = (u.path ?: "/").trimStart('/')
                    if (p.isEmpty()) p = "index.html"
                    val stream = runCatching { assets.open("web/$p") }.getOrNull()
                        ?: runCatching { assets.open("web/index.html") }.getOrNull() ?: return null
                    val mime = when (p.substringAfterLast('.', "").lowercase()) {
                        "html" -> "text/html"; "js" -> "text/javascript"; "css" -> "text/css"; "json" -> "application/json"
                        "svg" -> "image/svg+xml"; "png" -> "image/png"; "ico" -> "image/x-icon"; "woff2" -> "font/woff2"
                        else -> "application/octet-stream"
                    }
                    val enc = if (mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml")) "utf-8" else null
                    return WebResourceResponse(mime, enc, stream).apply { responseHeaders = mapOf("Cache-Control" to "no-cache") }
                }
                override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { pageFailed = false }
                override fun onPageFinished(view: WebView, url: String?) {
                    pushInsets()
                    if (!pageFailed) statusPane.visibility = View.GONE
                }
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (!request.isForMainFrame || prefs.localMode) return
                    pageFailed = true
                    showOverlay("打不开电脑上的页面（${error.description}）。\n请确认电脑上的 黑黑看单词 正在运行，并且地址 ${prefs.pcUrl} 正确。", busy = false)
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = cb
                    return try { startActivityForResult(params.createIntent(), REQ_FILE); true } catch (e: Exception) { fileCallback = null; false }
                }
            }
        }

        statusText = TextView(this).apply {
            gravity = Gravity.CENTER
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyLarge)
        }
        progress = CircularProgressIndicator(this).apply { isIndeterminate = true }
        retryBtn = MaterialButton(this).apply {
            text = "重试"; setIconResource(R.drawable.ic_refresh); setOnClickListener { reconnect() }
        }
        val settingsBtn = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "连接设置"; setIconResource(R.drawable.ic_settings); setOnClickListener { openSettings() }
        }
        val diagBtn = MaterialButton(this, null, androidx.appcompat.R.attr.borderlessButtonStyle).apply {
            text = "诊断信息"; setOnClickListener { startActivity(Intent(this@MainActivity, DiagActivity::class.java)) }
        }
        statusPane = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(px(32), px(32), px(32), px(32))
            isClickable = true
            addView(ImageView(context).apply { setImageResource(R.mipmap.ic_launcher) }, LinearLayout.LayoutParams(px(72), px(72)).apply { bottomMargin = px(20) })
            addView(progress)
            addView(statusText, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = px(16) })
            addView(LinearLayout(context).apply {
                gravity = Gravity.CENTER
                addView(retryBtn)
                addView(settingsBtn, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = px(12) })
            }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = px(20) })
            addView(diagBtn, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = px(8); gravity = Gravity.CENTER_HORIZONTAL })
        }
        root = FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(statusPane, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            insetTop = bars.top
            insetBottom = bars.bottom
            // 键盘弹出时把网页往上收，避免输入框被挡
            val lp = web.layoutParams as FrameLayout.LayoutParams
            if (lp.bottomMargin != ime.bottom) { lp.bottomMargin = ime.bottom; web.layoutParams = lp }
            statusPane.setPadding(px(32), bars.top + px(32), px(32), bars.bottom + px(32))
            pushInsets()
            insets
        }
        applyChrome(Theming.isDark(this), Theming.surface(this))

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 9)
        }

        if (prefs.localMode) startLocal()
        else if (!prefs.configured) openSettings() else ensureVpn()
    }

    /** 手机独立模式：直接打开内置网页；填了 EasyTier 就在后台连上，方便和电脑同步 */
    private fun startLocal() {
        statusPane.visibility = View.GONE
        if (loadedUrl != LOCAL_URL) {
            loadedUrl = LOCAL_URL
            web.loadUrl(LOCAL_URL)
        }
        if (prefs.pcSync && prefs.easyTierConfigured && !EtVpnService.running) ensureVpn()
    }

    private fun notifyNet() {
        web.evaluateJavascript("window.MomoLocal&&window.MomoLocal.netChanged()", null)
    }

    override fun onResume() {
        super.onResume()
        EtVpnService.listener = { render() }
        render()
    }

    override fun onPause() {
        EtVpnService.listener = null
        super.onPause()
    }

    private fun render() {
        if (prefs.localMode) { notifyNet(); return }
        if (!prefs.configured) { showOverlay("请先填写连接设置", busy = false); return }
        if (EtVpnService.connected) {
            val url = prefs.pcUrl
            if (loadedUrl != url) {
                loadedUrl = url
                showOverlay("${EtVpnService.status}\n正在打开 $url …", busy = true)
                web.loadUrl(url)
            }
        } else {
            loadedUrl = null
            val failed = !EtVpnService.running && EtVpnService.status != "未连接"
            showOverlay(EtVpnService.status, busy = !failed)
        }
    }

    /** 把状态栏/导航栏高度告诉网页（CSS 变量 --sat / --sab，单位 CSS px） */
    private fun pushInsets() {
        if (!::web.isInitialized) return
        val t = insetTop / dp
        val b = if ((web.layoutParams as FrameLayout.LayoutParams).bottomMargin > 0) 0f else insetBottom / dp
        web.evaluateJavascript("(function(){var s=document.documentElement.style;s.setProperty('--sat','${t}px');s.setProperty('--sab','${b}px');})()", null)
    }

    /** 状态栏图标深浅、原生背景跟随网页主题 */
    private fun applyChrome(dark: Boolean, surface: Int?) {
        val bg = surface ?: if (dark) Color.parseColor("#0F1511") else Color.parseColor("#F5FBF5")
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(bg))
        root.setBackgroundColor(bg)
        web.setBackgroundColor(bg)
        statusPane.setBackgroundColor(bg)
        statusText.setTextColor(if (dark) Color.parseColor("#DEE4DE") else Color.parseColor("#171D1A"))
        WindowInsetsControllerCompat(window, root).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val sysDark = Theming.systemDark(this)
        web.evaluateJavascript("window.momoTheme&&window.momoTheme.systemChanged($sysDark)", null)
        if (Theming.mode(this) == "system") applyChrome(sysDark, null)
    }

    private fun showOverlay(msg: String, busy: Boolean) {
        statusPane.visibility = View.VISIBLE
        statusText.text = msg
        progress.visibility = if (busy) View.VISIBLE else View.INVISIBLE
        retryBtn.visibility = if (busy) View.GONE else View.VISIBLE
    }

    private fun ensureVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) startActivityForResult(intent, REQ_VPN) else startVpn()
    }

    private fun startVpn() {
        if (EtVpnService.connected) { render(); return }
        if (!prefs.localMode) showOverlay("正在连接虚拟网…", busy = true)
        val i = Intent(this, EtVpnService::class.java).setAction(EtVpnService.ACTION_START)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
    }

    private fun stopVpn() {
        startService(Intent(this, EtVpnService::class.java).setAction(EtVpnService.ACTION_STOP))
    }

    private fun reconnect() {
        if (EtVpnService.connected) {
            loadedUrl = null
            render()
        } else {
            ensureVpn()
        }
    }

    /** 连接设置改了：断开重连。reloadPage=false 时（网页里保存、仍是独立模式）不重新加载页面 */
    private fun applyConnectionChange(reloadPage: Boolean) {
        if (prefs.localMode) {
            if (EtVpnService.running) stopVpn()
            if (reloadPage) loadedUrl = null
            web.postDelayed({ startLocal(); notifyNet() }, 1200)
        } else {
            loadedUrl = null
            if (EtVpnService.running) {
                stopVpn()
                web.postDelayed({ ensureVpn() }, 1200)
            } else ensureVpn()
        }
    }

    private fun openSettings() = startActivityForResult(Intent(this, SettingsActivity::class.java), REQ_SETTINGS)

    @Deprecated("Activity API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_VPN -> if (resultCode == RESULT_OK) startVpn()
                else if (prefs.localMode) Toast.makeText(this, "没允许 VPN：手机照常能用，只是连不上电脑同步", Toast.LENGTH_LONG).show()
                else showOverlay("需要允许 VPN 才能连上 EasyTier 虚拟网", busy = false)
            REQ_SETTINGS -> if (resultCode == RESULT_OK) applyConnectionChange(reloadPage = true)
                else if (!prefs.configured) showOverlay("请先填写连接设置", busy = false)
            REQ_FILE -> {
                fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
                fileCallback = null
            }
        }
    }

    @Deprecated("Activity API")
    override fun onBackPressed() {
        if ((prefs.localMode || statusPane.visibility != View.VISIBLE) && web.canGoBack()) web.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    /** 网页里的导出（Word / Markdown / 配置 JSON / PDF）走这里 */
    inner class Bridge {
        @JavascriptInterface
        fun saveFile(name: String, mime: String, content: String): String {
            return try {
                val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
                val where: String
                if (Build.VERSION.SDK_INT >= 29) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.MIME_TYPE, mime.substringBefore(';'))
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("无法创建文件")
                    contentResolver.openOutputStream(uri)!!.use { it.write(content.toByteArray(Charsets.UTF_8)) }
                    where = "手机「下载」文件夹"
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                    File(dir, safe).writeText(content, Charsets.UTF_8)
                    where = dir.absolutePath
                }
                runOnUiThread { Toast.makeText(this@MainActivity, "已保存到$where：$safe", Toast.LENGTH_LONG).show() }
                "ok"
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "保存失败：${e.message}", Toast.LENGTH_LONG).show() }
                "error"
            }
        }

        @JavascriptInterface
        fun printHtml(html: String) {
            runOnUiThread {
                val w = WebView(this@MainActivity)
                printView = w
                w.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        val pm = getSystemService(PrintManager::class.java)
                        pm.print("黑黑看单词", view.createPrintDocumentAdapter("黑黑看单词"), null)
                    }
                }
                w.loadDataWithBaseURL(if (prefs.localMode) "$LOCAL_URL" else prefs.pcUrl + "/", html, "text/html", "utf-8", null)
            }
        }

        @JavascriptInterface
        fun setTheme(mode: String, seed: String, color: String, surface: String, dark: Boolean) {
            Theming.save(this@MainActivity, mode, seed, color, surface, dark)
            val bg = runCatching { Color.parseColor(surface) }.getOrNull()
            runOnUiThread { applyChrome(dark, bg) }
        }

        @JavascriptInterface
        fun systemDark(): Boolean = Theming.systemDark(this@MainActivity)

        @JavascriptInterface
        fun wallpaperColor(): String = Theming.wallpaperColor(this@MainActivity)

        @JavascriptInterface
        fun openSettings() = runOnUiThread { this@MainActivity.openSettings() }

        @JavascriptInterface
        fun openDiag() = runOnUiThread { startActivity(Intent(this@MainActivity, DiagActivity::class.java)) }

        @JavascriptInterface
        fun reload() = runOnUiThread { if (prefs.localMode || EtVpnService.connected) web.reload() else ensureVpn() }

        // ---- 手机独立模式
        @JavascriptInterface
        fun sql(mode: String, sql: String, params: String): String = localDb.call(mode, sql, params)

        @JavascriptInterface
        fun httpStart(id: Int, req: String) {
            HttpBridge.start(req) { res ->
                runOnUiThread { web.evaluateJavascript("window.__momoHttpDone&&window.__momoHttpDone($id, ${org.json.JSONObject.quote(res)})", null) }
            }
        }

        @JavascriptInterface
        fun pcUrl(): String = prefs.pcUrl

        @JavascriptInterface
        fun isLocal(): Boolean = prefs.localMode

        @JavascriptInterface
        fun pcSync(): Boolean = prefs.pcSync

        /** 网页「设置 → 电脑同步 → 连接设置」读取当前连接（不返回网络密码，只告诉有没有） */
        @JavascriptInterface
        fun getConnection(): String = org.json.JSONObject()
            .put("localMode", prefs.localMode)
            .put("networkName", prefs.networkName)
            .put("hasSecret", prefs.networkSecret.isNotEmpty())
            .put("peers", prefs.peers)
            .put("virtualIp", prefs.virtualIp)
            .put("pcUrl", prefs.pcUrl)
            .toString()

        /** 网页保存连接设置：校验规则和原生连接页一致；返回 {ok, errors:{字段:提示}} */
        @JavascriptInterface
        fun saveConnection(json: String): String {
            val o = try { org.json.JSONObject(json) } catch (e: Exception) { return "{\"ok\":false,\"errors\":{}}" }
            val isLocal = o.optBoolean("localMode", true)
            val n = o.optString("networkName", "").trim()
            val p = o.optString("peers", "")
            val v = o.optString("virtualIp", "").trim()
            val u = o.optString("pcUrl", "").trim()
            val errors = org.json.JSONObject()
            val peerItems = p.split('\n', ',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() }
            val needNet = !isLocal || n.isNotBlank() || peerItems.isNotEmpty() || u.isNotBlank()
            if (needNet && n.isBlank()) errors.put("networkName", "请填写网络名称")
            if (needNet && peerItems.isEmpty()) errors.put("peers", "请至少填一个节点地址")
            else if (peerItems.any { !it.contains("://") }) errors.put("peers", "要带协议，例如 udp://1.2.3.4:11010")
            if (v.isNotBlank() && Prefs.parseCidr(v) == null) errors.put("virtualIp", "格式不对，例如 10.10.10.2/24")
            if (needNet && u.isBlank()) errors.put("pcUrl", "请填写电脑页面地址")
            if (errors.length() > 0) return org.json.JSONObject().put("ok", false).put("errors", errors).toString()
            val wasLocal = prefs.localMode
            prefs.localMode = isLocal
            prefs.networkName = n
            if (!o.optBoolean("keepSecret", false)) prefs.networkSecret = o.optString("networkSecret", "")
            prefs.peers = p
            prefs.virtualIp = v
            prefs.pcUrl = u
            runOnUiThread { applyConnectionChange(reloadPage = wasLocal != isLocal) }
            return org.json.JSONObject().put("ok", true).put("hasSecret", prefs.networkSecret.isNotEmpty()).toString()
        }

        /** 网页里切换「同步到电脑」：独立模式下顺带开/关后台的 EasyTier */
        @JavascriptInterface
        fun setPcSync(on: Boolean) {
            prefs.pcSync = on
            runOnUiThread {
                if (!prefs.localMode) return@runOnUiThread
                if (on) {
                    if (prefs.easyTierConfigured && !EtVpnService.running) ensureVpn()
                } else if (EtVpnService.running) stopVpn()
            }
        }

        @JavascriptInterface
        fun exit() = runOnUiThread { stopVpn(); finishAndRemoveTask() }

        @JavascriptInterface
        fun info(): String = "momo-android ${BuildConfigCompat.versionName(this@MainActivity)} · ${EtVpnService.localIp}"
    }
}

object BuildConfigCompat {
    fun versionName(a: Activity): String =
        runCatching { a.packageManager.getPackageInfo(a.packageName, 0).versionName ?: "" }.getOrDefault("")
}
