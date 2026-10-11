# Proguard rules for LightReader
# Keep JavaScript interface methods if added
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
