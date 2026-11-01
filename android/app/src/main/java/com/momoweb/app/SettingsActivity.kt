package com.momoweb.app

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

/** 首次打开或从菜单进入：填 EasyTier 网络和电脑地址（Material Design 3 表单）。 */
class SettingsActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        Theming.applyNightMode(this)
        super.onCreate(savedInstanceState)
        Theming.applyColors(this)
        prefs = Prefs(this)
        setContentView(R.layout.activity_settings)
        supportActionBar?.title = getString(R.string.settings_title)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val name = findViewById<TextInputEditText>(R.id.name)
        val secret = findViewById<TextInputEditText>(R.id.secret)
        val peers = findViewById<TextInputEditText>(R.id.peers)
        val vip = findViewById<TextInputEditText>(R.id.vip)
        val pc = findViewById<TextInputEditText>(R.id.pc)
        val nameL = findViewById<TextInputLayout>(R.id.nameLayout)
        val peersL = findViewById<TextInputLayout>(R.id.peersLayout)
        val vipL = findViewById<TextInputLayout>(R.id.vipLayout)
        val pcL = findViewById<TextInputLayout>(R.id.pcLayout)

        val local = findViewById<MaterialSwitch>(R.id.localMode)
        local.isChecked = prefs.localMode
        name.setText(prefs.networkName)
        secret.setText(prefs.networkSecret)
        peers.setText(prefs.peers)
        vip.setText(prefs.virtualIp)
        pc.setText(prefs.pcUrl.removePrefix("http://"))

        findViewById<MaterialButton>(R.id.save).setOnClickListener {
            listOf(nameL, peersL, vipL, pcL).forEach { it.error = null }
            val n = name.text?.toString().orEmpty()
            val p = peers.text?.toString().orEmpty()
            val v = vip.text?.toString().orEmpty()
            val u = pc.text?.toString().orEmpty()
            var ok = true
            val isLocal = local.isChecked
            val peerItems = p.split('\n', ',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() }
            // 独立模式下 EasyTier 可以全空；填了一部分就要填完整
            val needNet = !isLocal || n.isNotBlank() || peerItems.isNotEmpty() || u.isNotBlank()
            if (needNet && n.isBlank()) { nameL.error = "请填写网络名称"; ok = false }
            if (needNet && peerItems.isEmpty()) { peersL.error = "请至少填一个节点地址"; ok = false }
            else if (peerItems.any { !it.contains("://") }) { peersL.error = "要带协议，例如 udp://1.2.3.4:11010"; ok = false }
            if (v.isNotBlank() && Prefs.parseCidr(v) == null) { vipL.error = "格式不对，例如 10.10.10.2/24"; ok = false }
            if (needNet && u.isBlank()) { pcL.error = "请填写电脑页面地址"; ok = false }
            if (!ok) return@setOnClickListener
            prefs.localMode = isLocal
            prefs.networkName = n
            prefs.networkSecret = secret.text?.toString().orEmpty()
            prefs.peers = p
            prefs.virtualIp = v
            prefs.pcUrl = u
            setResult(RESULT_OK)
            finish()
        }
    }

    override fun onSupportNavigateUp(): Boolean { finish(); return true }
}
