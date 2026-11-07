package app.geometrypanel.mobile;

import org.json.JSONObject;

final class MeterOptions {
    private MeterOptions() { }
    static JSONObject sanitize(JSONObject input) {
        String mode = NativeJson.string(input, "mode", 16);
        if (!mode.equals("wallpaper") && !mode.equals("cast")) throw new IllegalArgumentException("unsupported_mode");
        JSONObject result = NativeJson.obj("mode", mode);
        try {
            Object wifi = input.opt("wifiAddress");
            if (wifi != null && wifi != JSONObject.NULL) result.put("wifiAddress", NativeJson.string(input, "wifiAddress", 4096));
            if (mode.equals("wallpaper")) {
                String number = NativeJson.string(input, "wallpaperNum", 4096), display = NativeJson.string(input, "displayWallpaperSet", 4096);
                if (number.trim().isEmpty() || display.trim().isEmpty() || number.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 4096
                        || display.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 4096) throw new IllegalArgumentException("wallpaper_template_missing");
                Object w = input.opt("width"), h = input.opt("height");
                if (!(w instanceof Number) || !(h instanceof Number)) throw new IllegalArgumentException("wallpaper_template_missing");
                double width = ((Number) w).doubleValue(), height = ((Number) h).doubleValue();
                if (!Double.isFinite(width) || !Double.isFinite(height) || width != (int) width || height != (int) height
                        || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16777216) throw new IllegalArgumentException("wallpaper_resolution_invalid");
                result.put("wallpaperNum", number); result.put("displayWallpaperSet", display); result.put("width", (int) width); result.put("height", (int) height);
                if (input.has("url")) {
                    try { String url = NativeJson.string(input,"url",4096); NativeDownloads.wallpaper(url); result.put("url",url);
                        result.put("fileName",NativeDownloads.filename(input.optString("fileName","wallpaper.zip"),".zip"));
                        if (input.has("md5")) { String md5 = input.getString("md5"); if (!md5.matches("[a-fA-F0-9]{32}")) throw new IllegalArgumentException("invalid_asset_metadata"); result.put("md5",md5); }
                        if (input.has("fileSize")) { Object size = input.get("fileSize"); if (!(size instanceof Number) || ((Number)size).doubleValue() != ((Number)size).longValue() || ((Number)size).longValue() < 1 || ((Number)size).longValue() > WallpaperArchive.MAX) throw new IllegalArgumentException("invalid_asset_metadata"); result.put("fileSize",size); }
                    } catch (Exception error) { throw new IllegalArgumentException("invalid_asset_metadata"); }
                }
            }
        } catch (org.json.JSONException error) { throw new IllegalArgumentException("meter_options_invalid"); }
        return result;
    }
}
