package com.momoweb.app

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.Executors

/** 网页里的网络请求（墨墨、模型、有道、电脑）由原生发出：不受跨域限制。结果回调给 JS。 */
object HttpBridge {
    private val pool = Executors.newCachedThreadPool()

    fun start(reqJson: String, done: (String) -> Unit) {
        pool.execute { done(perform(reqJson)) }
    }

    private fun perform(reqJson: String): String {
        var conn: HttpURLConnection? = null
        return try {
            val q = JSONObject(reqJson)
            val timeout = q.optInt("timeoutMs", 30000).coerceIn(1000, 900000)
            conn = (URL(q.getString("url")).openConnection() as HttpURLConnection).apply {
                requestMethod = q.optString("method", "GET").uppercase()
                connectTimeout = minOf(timeout, 15000)
                readTimeout = timeout
                instanceFollowRedirects = true
                useCaches = false
                val h = q.optJSONObject("headers")
                h?.keys()?.forEach { k -> setRequestProperty(k, h.optString(k)) }
            }
            val body = if (q.isNull("body")) null else q.optString("body")
            if (body != null && conn.requestMethod != "GET") {
                conn.doOutput = true
                val bytes = body.toByteArray(Charsets.UTF_8)
                conn.setFixedLengthStreamingMode(bytes.size)
                conn.outputStream.use { it.write(bytes) }
            }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val text = stream?.use { s ->
                val out = ByteArrayOutputStream()
                s.copyTo(out)
                out.toString("UTF-8")
            } ?: ""
            JSONObject().put("status", status).put("text", text).toString()
        } catch (e: SocketTimeoutException) {
            JSONObject().put("error", "请求超时").put("code", "TIMEOUT").toString()
        } catch (e: Exception) {
            JSONObject().put("error", e.message ?: e.javaClass.simpleName).put("code", e.javaClass.simpleName).toString()
        } finally {
            conn?.disconnect()
        }
    }
}
