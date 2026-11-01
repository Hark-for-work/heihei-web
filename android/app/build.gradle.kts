plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.momoweb.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.momoweb.app"
        minSdk = 24
        targetSdk = 34
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    // 正式签名从环境变量读（CI 里由仓库 Secrets 提供），密钥不放进仓库：
    //   MOMO_KEYSTORE=keystore 路径（PKCS12）  MOMO_KEYSTORE_PASSWORD  MOMO_KEY_ALIAS（默认 momo）  MOMO_KEY_PASSWORD（默认同 keystore 密码）
    // 没配置时用 debug 签名，方便自己编译（不能覆盖安装官方 Release 的 APK）
    val ks = System.getenv("MOMO_KEYSTORE")?.takeIf { it.isNotBlank() && file(it).exists() }
    signingConfigs {
        if (ks != null) create("momo") {
            storeFile = file(ks)
            storePassword = System.getenv("MOMO_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("MOMO_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "momo"
            keyPassword = System.getenv("MOMO_KEY_PASSWORD")?.takeIf { it.isNotBlank() } ?: System.getenv("MOMO_KEYSTORE_PASSWORD")
            storeType = "pkcs12"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (ks != null) signingConfigs.getByName("momo") else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
