package com.momoweb.app

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import com.google.android.material.color.DynamicColors
import com.google.android.material.color.DynamicColorsOptions

/** 外观跟着网页走：网页通过 MomoAndroid.setTheme 告诉 App 深浅色模式和主题色，App 存下来用于原生页面。 */
object Theming {
    const val DEFAULT_SEED = "#006C4C"
    private fun sp(c: Context) = c.getSharedPreferences("momo.theme", Context.MODE_PRIVATE)

    fun save(c: Context, mode: String, seed: String, color: String, surface: String, dark: Boolean) {
        sp(c).edit().putString("mode", mode).putString("seed", seed).putString("color", color)
            .putString("surface", surface).putBoolean("dark", dark).apply()
    }

    fun mode(c: Context) = sp(c).getString("mode", "system") ?: "system"
    fun seed(c: Context) = sp(c).getString("seed", DEFAULT_SEED) ?: DEFAULT_SEED
    fun color(c: Context) = sp(c).getString("color", DEFAULT_SEED) ?: DEFAULT_SEED

    /** 上次网页的背景色（启动时先铺上，避免白屏闪一下） */
    fun surface(c: Context): Int? = runCatching { Color.parseColor(sp(c).getString("surface", null)) }.getOrNull()

    fun systemDark(c: Context): Boolean =
        (c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    fun isDark(c: Context): Boolean = when (mode(c)) {
        "dark" -> true
        "light" -> false
        else -> systemDark(c)
    }

    /** 安卓 12+ 的壁纸取色（系统 accent），更早的系统返回空 */
    fun wallpaperColor(c: Context): String {
        if (Build.VERSION.SDK_INT < 31) return ""
        return runCatching { String.format("#%06X", 0xFFFFFF and c.getColor(android.R.color.system_accent1_500)) }.getOrDefault("")
    }

    /** 设置页/诊断页：在 super.onCreate 之前调用 */
    fun applyNightMode(a: AppCompatActivity) {
        a.delegate.localNightMode = when (mode(a)) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
    }

    /** 原生页面用和网页同一个主题色（安卓 12+；更早的系统保持默认绿色） */
    fun applyColors(a: AppCompatActivity) {
        val s = seed(a)
        if (s == "wallpaper") { DynamicColors.applyToActivityIfAvailable(a); return }
        if (s.equals(DEFAULT_SEED, true)) return
        val c = runCatching { Color.parseColor(color(a)) }.getOrNull() ?: return
        DynamicColors.applyToActivityIfAvailable(a, DynamicColorsOptions.Builder().setContentBasedSource(c).build())
    }
}
