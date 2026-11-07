import groovy.json.JsonSlurper
import java.util.Properties

plugins { id("com.android.application") }

val packageData = JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>
val webVersion = packageData["version"].toString()
val numbers = webVersion.split('.').map { it.toInt() }
val webVersionCode = numbers[0] * 1_000_000 + numbers[1] * 1_000 + numbers[2]
val localSigning = Properties().apply {
    val file = rootProject.file(".signing/signing.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}
fun signingValue(name: String) = System.getenv(name) ?: localSigning.getProperty(name)
val keyFile = signingValue("GEOMETRY_KEYSTORE")

android {
    namespace = "app.geometrypanel.mobile"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.geometrypanel.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = System.getenv("GEOMETRY_VERSION_CODE")?.toInt() ?: webVersionCode
        versionName = webVersion
        buildConfigField("String", "PANEL_URL", "\"https://bedlatess.github.io/GeometryPanel/\"")
    }
    signingConfigs {
        if (keyFile != null) create("panel") {
            storeFile = rootProject.file(keyFile)
            storePassword = signingValue("GEOMETRY_STORE_PASSWORD")
            keyAlias = signingValue("GEOMETRY_KEY_ALIAS")
            keyPassword = signingValue("GEOMETRY_KEY_PASSWORD")
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            if (keyFile != null) signingConfig = signingConfigs.getByName("panel")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}

dependencies { testImplementation("junit:junit:4.13.2") }
