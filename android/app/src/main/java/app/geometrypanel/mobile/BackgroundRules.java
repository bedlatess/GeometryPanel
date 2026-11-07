package app.geometrypanel.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

/** Pure sample and transition rules. Missing fields stay missing; first sample/gaps never invent a start time. */
final class BackgroundRules {
    private BackgroundRules() { }
    static JSONObject normalize(JSONObject home, JSONObject battery, long at) throws Exception {
        JSONObject out = NativeJson.obj("receivedAt", at);
        long homeAt = ReportTime.parse(home.opt("refreshTime")), batteryAt = ReportTime.parse(battery == null ? null : battery.opt("refreshTime"));
        out.put("reportedAt", homeAt > 0 ? homeAt : JSONObject.NULL); out.put("batteryReportedAt", batteryAt > 0 ? batteryAt : JSONObject.NULL);
        out.put("reportState", ReportTime.state(homeAt,at)); out.put("batteryReportState", ReportTime.state(batteryAt,at));
        number(out, "soc", battery, "bmssoc", 0, 100); if (!out.has("soc")) number(out, "soc", home, "bmssoc", 0, 100);
        number(out, "range", home, "hmiRidableMile", 0, 2000);
        number(out, "voltage", battery, "voltage", 0, 200); if (!out.has("voltage")) number(out, "voltage", battery, "bmsVoltage", 0, 200);
        number(out, "current", battery, "current", -1000, 1000); number(out, "power", battery, "power", -100000, 100000);
        String code = scalar(battery, "chargeState"); boolean batteryCharge = !code.isEmpty() || !scalar(battery,"chargeStateStr").isEmpty(); if (code.isEmpty()) code = scalar(home, "chargeState");
        String description = scalar(battery, "chargeStateStr");
        if (description.contains("充满")) out.put("charging", 2); else if (code.equals("1")) out.put("charging",1); else if (code.equals("0")) out.put("charging",0);
        out.put("chargeReportState", ReportTime.state(batteryCharge ? batteryAt : homeAt,at));
        String online = scalar(home, "onlineStatus").toLowerCase(java.util.Locale.ROOT);
        if (online.matches("online|1|true")) out.put("online", 1); else if (online.matches("offline|0|false")) out.put("online", 0);
        String lock = scalar(home, "headLockState"); if (lock.matches("0|1")) out.put("lock", Integer.parseInt(lock));
        out.put("partial", battery == null); return out;
    }
    private static String scalar(JSONObject input, String key) { Object value = input == null ? null : input.opt(key); return value instanceof Number || value instanceof String ? String.valueOf(value).trim() : ""; }
    static void number(JSONObject out, String key, JSONObject input, String source, double min, double max) throws Exception {
        String value = scalar(input, source); if (!value.matches("[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?")) return;
        double parsed = Double.parseDouble(value); if (Double.isFinite(parsed) && parsed >= min && parsed <= max) out.put(key, parsed);
    }
    static long interval(JSONObject sample, long now) {
        int charging = sample.optInt("charging", -1);
        if (charging == 1 || charging == 2) return 150000;
        return now - sample.optLong("receivedAt", 0) <= 300000 && sample.optInt("lock", -1) == 1 ? 300000 : 60000;
    }
    static JSONArray events(JSONObject prior, JSONObject next, JSONObject flags, int lowThreshold) throws Exception {
        JSONArray events = new JSONArray(); long at = next.optLong("receivedAt"), previousAt = prior.optLong("receivedAt", 0);
        if (at <= previousAt || at <= 0) return events;
        boolean continuity = previousAt > 0 && at - previousAt <= 300000;
        boolean chargeContinuity = continuity && "fresh".equals(prior.optString("chargeReportState")) && "fresh".equals(next.optString("chargeReportState"));
        int previous = prior.optInt("charging", -1), charging = next.optInt("charging", -1);
        if (!continuity && previousAt > 0) events.put(event("gap", at));
        if (chargeContinuity && previous >= 0 && charging >= 0 && previous != charging) {
            if (charging == 1) events.put(event("chargeStart", at));
            else if (charging == 2) events.put(event("chargeFull", at));
            else if (previous == 1) events.put(event("chargeStop", at));
        }
        if (!chargeContinuity) flags.remove("progressSoc");
        if (charging == 1 && "fresh".equals(next.optString("chargeReportState")) && next.has("soc")) {
            int last = flags.optInt("progressSoc", -1), soc = next.optInt("soc");
            if (last >= 0 && soc >= last + 5) events.put(event("chargeProgress", at));
            if (last < 0 || soc >= last + 5) flags.put("progressSoc", soc);
        } else if (charging >= 0) flags.remove("progressSoc");
        double soc = next.optDouble("soc", -1);
        if (charging == 1 || soc >= lowThreshold + 5) flags.put("lowSent", false);
        if (charging == 0 && "fresh".equals(next.optString("chargeReportState")) && soc >= 0 && soc <= lowThreshold && !flags.optBoolean("lowSent")) { events.put(event("lowBattery", at)); flags.put("lowSent", true); }
        if (continuity && "fresh".equals(prior.optString("reportState")) && "fresh".equals(next.optString("reportState")) && prior.optInt("online", -1) == 1 && next.optInt("online", -1) == 0) events.put(event("offline", at));
        boolean tire = next.optBoolean("tireWarning", false);
        if (next.has("tireWarning") && !tire) flags.put("tireSent", false);
        if (tire && !flags.optBoolean("tireSent")) { events.put(event("tire", at)); flags.put("tireSent", true); }
        String message = next.optString("messageId", "");
        if (!message.isEmpty() && !message.equals(flags.optString("messageId", ""))) {
            if (flags.has("messageId")) events.put(event("message", at)); flags.put("messageId", message);
        }
        return events;
    }
    private static JSONObject event(String type, long at) { return NativeJson.obj("type", type, "at", at); }
}
