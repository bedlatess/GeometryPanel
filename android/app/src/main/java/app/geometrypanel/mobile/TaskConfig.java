package app.geometrypanel.mobile;

import org.json.JSONObject;

final class TaskConfig {
    static final String[] ACTIONS = {"signin", "streakPrize", "like", "share", "post", "cleanup"};
    static JSONObject clean(JSONObject input) throws Exception {
        String time = input.optString("time", "09:00"); if (!time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) throw new IllegalArgumentException("invalid_task_time");
        Object interval = input.opt("requestIntervalMs"); if (interval == null) interval = 2000;
        if (!(interval instanceof Number) || ((Number) interval).doubleValue() != ((Number) interval).intValue() || ((Number) interval).intValue() < 0 || ((Number) interval).intValue() > 60000) throw new IllegalArgumentException("invalid_interval");
        JSONObject actions = new JSONObject(), supplied = input.optJSONObject("actions");
        for (String name : ACTIONS) { if (supplied != null && supplied.has(name) && !(supplied.opt(name) instanceof Boolean)) throw new IllegalArgumentException("invalid_task_action"); actions.put(name, supplied != null && supplied.optBoolean(name, false)); }
        String content = input.optString("postContent", ""); if (content.length() > 500 || content.matches("(?s).*[\\p{Cntrl}&&[^\\n\\t]].*")) throw new IllegalArgumentException("invalid_post");
        if (actions.getBoolean("post") && content.trim().isEmpty()) throw new IllegalArgumentException("post_content_required");
        if (!actions.getBoolean("post")) actions.put("cleanup", false);
        if (input.has("legacyLikeConfirmed") && !(input.opt("legacyLikeConfirmed") instanceof Boolean)) throw new IllegalArgumentException("invalid_like_confirmation");
        return NativeJson.obj("enabled", input.optBoolean("enabled", false), "time", time, "requestIntervalMs", ((Number) interval).intValue(), "actions", actions, "postContent", content, "legacyLikeConfirmed", input.optBoolean("legacyLikeConfirmed", false));
    }
}
