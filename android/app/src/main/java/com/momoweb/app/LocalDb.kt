package com.momoweb.app

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import org.json.JSONArray
import org.json.JSONObject

/**
 * 手机独立模式的数据库：给网页里的 lib/db.js 用（接口仿 node:sqlite 的 run/get/all/exec）。
 * 参数按类型绑定（整数、小数、文本、null），返回 JSON 字符串。
 */
class LocalDb(context: Context) {
    private val db: SQLiteDatabase = SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath("momo.db").apply { parentFile?.mkdirs() }, null)

    val path: String = context.getDatabasePath("momo.db").absolutePath

    @Synchronized
    fun call(mode: String, sql: String, paramsJson: String): String {
        return try {
            val params = JSONArray(if (paramsJson.isBlank()) "[]" else paramsJson)
            when (mode) {
                "exec" -> exec(sql)
                "run" -> run(sql, params)
                "get" -> query(sql, params, single = true)
                else -> query(sql, params, single = false)
            }
        } catch (e: Exception) {
            JSONObject().put("error", e.message ?: e.toString()).toString()
        }
    }

    private fun exec(sql: String): String {
        when (sql.trim().uppercase()) {
            "BEGIN", "BEGIN TRANSACTION" -> db.beginTransaction()
            "COMMIT", "END" -> { if (db.inTransaction()) { db.setTransactionSuccessful(); db.endTransaction() } }
            "ROLLBACK" -> { if (db.inTransaction()) db.endTransaction() }
            else -> {
                if (sql.trim().uppercase().startsWith("PRAGMA")) db.rawQuery(sql, null).use { it.moveToFirst() } else db.execSQL(sql)
            }
        }
        return "{}"
    }

    private fun bind(p: SQLiteProgram, params: JSONArray) {
        for (i in 0 until params.length()) {
            val idx = i + 1
            val v = params.opt(i)
            when {
                v == null || v == JSONObject.NULL -> p.bindNull(idx)
                v is Boolean -> p.bindLong(idx, if (v) 1 else 0)
                v is Int -> p.bindLong(idx, v.toLong())
                v is Long -> p.bindLong(idx, v)
                v is Double -> if (v == Math.floor(v) && !v.isInfinite() && Math.abs(v) < 9.0E15) p.bindLong(idx, v.toLong()) else p.bindDouble(idx, v)
                v is Number -> p.bindDouble(idx, v.toDouble())
                else -> p.bindString(idx, v.toString())
            }
        }
    }

    private fun run(sql: String, params: JSONArray): String {
        val st = db.compileStatement(sql)
        try {
            bind(st, params)
            val head = sql.trimStart().take(10).uppercase()
            val out = JSONObject()
            if (head.startsWith("INSERT") || head.startsWith("REPLACE")) {
                val id = st.executeInsert()
                out.put("lastInsertRowid", id).put("changes", if (id >= 0) 1 else 0)
            } else {
                out.put("changes", st.executeUpdateDelete()).put("lastInsertRowid", 0)
            }
            return out.toString()
        } finally {
            st.close()
        }
    }

    private fun query(sql: String, params: JSONArray, single: Boolean): String {
        val factory = SQLiteDatabase.CursorFactory { _, driver, editTable, query ->
            bind(query, params)
            SQLiteCursor(driver, editTable, query)
        }
        db.rawQueryWithFactory(factory, sql, null, null).use { c ->
            val rows = JSONArray()
            while (c.moveToNext()) {
                val o = JSONObject()
                for (i in 0 until c.columnCount) {
                    val name = c.getColumnName(i)
                    when (c.getType(i)) {
                        Cursor.FIELD_TYPE_NULL -> o.put(name, JSONObject.NULL)
                        Cursor.FIELD_TYPE_INTEGER -> o.put(name, c.getLong(i))
                        Cursor.FIELD_TYPE_FLOAT -> o.put(name, c.getDouble(i))
                        Cursor.FIELD_TYPE_BLOB -> o.put(name, JSONObject.NULL)
                        else -> o.put(name, c.getString(i))
                    }
                }
                rows.put(o)
                if (single) break
            }
            return if (single) JSONObject().put("row", if (rows.length() > 0) rows.get(0) else JSONObject.NULL).toString()
            else JSONObject().put("rows", rows).toString()
        }
    }
}
