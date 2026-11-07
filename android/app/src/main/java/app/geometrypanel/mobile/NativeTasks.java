package app.geometrypanel.mobile;

import android.content.Context;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Recovered optional daily tasks. Every write is guarded, journaled before sending and never blindly retried. */
final class NativeTasks {
    private static NativeTasks instance; private final Context context; private final NativeVault vault;
    private final AtomicBoolean busy = new AtomicBoolean(); private volatile long generation;
    private final java.util.concurrent.ExecutorService worker = Executors.newSingleThreadExecutor();
    private JSONObject config, results = new JSONObject(), gates = new JSONObject(); private long lastRun;
    private NativeTasks(Context context) {
        this.context = context.getApplicationContext(); vault = new NativeVault(this.context);
        try { String raw = vault.read("background-tasks"); JSONObject saved = raw == null ? new JSONObject() : new JSONObject(raw); config = TaskConfig.clean(saved.optJSONObject("config") == null ? new JSONObject() : saved.getJSONObject("config"));
            if (saved.optJSONObject("results") != null) results = saved.getJSONObject("results"); if (saved.optJSONObject("gates") != null) gates = saved.getJSONObject("gates"); lastRun = saved.optLong("lastRun");
        } catch (Exception ignored) { try { config = TaskConfig.clean(new JSONObject()); } catch (Exception impossible) { throw new IllegalStateException(); } }
    }
    static synchronized NativeTasks get(Context context) { if (instance == null) instance = new NativeTasks(context); return instance; }
    synchronized JSONObject configure(JSONObject input) throws Exception { generation++; config = TaskConfig.clean(input); persist(); TaskJob.schedule(context, config, false); return status(); }
    synchronized JSONObject status() throws Exception {
        JSONArray accounts = BackgroundMonitor.get(context).accounts(), summaries = new JSONArray();
        for (int i = 0; i < accounts.length(); i++) { JSONObject account = accounts.getJSONObject(i), result = results.optJSONObject(account.getString("id"));
            summaries.put(NativeJson.obj("id", account.getString("id"), "label", account.optString("label", "账号"), "epoch", account.getLong("epoch"), "lastRun", result == null ? 0 : result.optLong("lastRun"),
                    "status", result == null ? "idle" : result.optString("status", "idle"), "steps", result == null ? new JSONArray() : result.optJSONArray("steps")));
        }
        JSONObject safe = new JSONObject(config.toString());
        return NativeJson.obj("enabled", config.optBoolean("enabled"), "running", busy.get(), "backgroundMode", "opportunistic", "jobScheduled", TaskJob.scheduled(context), "lastRun", lastRun, "config", safe, "accounts", summaries);
    }
    synchronized JSONObject config() throws Exception { return new JSONObject(config.toString()); }
    void cancel() { generation++; }
    boolean run(String target, boolean confirmed, Runnable finished) throws Exception {
        if (!confirmed) throw new IllegalArgumentException("confirmation_required");
        final JSONObject settings = config(); final JSONArray accounts = BackgroundMonitor.get(context).accounts(); final long epoch = generation, accountGeneration = BackgroundMonitor.get(context).generation();
        if (!busy.compareAndSet(false, true)) return false;
        worker.execute(() -> {
            try { for (int i = 0; i < accounts.length(); i++) { JSONObject account = accounts.optJSONObject(i); if (!account.optBoolean("enabled") || target != null && !target.equals(account.optString("id"))) continue;
                if (epoch != generation || accountGeneration != BackgroundMonitor.get(context).generation()) return;
                execute(account, settings, epoch, accountGeneration);
            } } finally { synchronized (this) { lastRun = System.currentTimeMillis(); try { persist(); } catch (Exception ignored) { } } busy.set(false); if (finished != null) finished.run(); }
        }); return true;
    }
    private void execute(JSONObject account, JSONObject settings, long epoch, long accountEpoch) {
        String id = account.optString("id"), token = account.optString("token"), uid = account.optString("uid"), day = day(System.currentTimeMillis());
        JSONArray steps = new JSONArray(); JSONObject result = NativeJson.obj("lastRun", System.currentTimeMillis(), "status", "running", "steps", steps);
        synchronized (this) { try { results.put(id, result); persist(); } catch (Exception ignored) { return; } }
        NativeCloud.Guard guard = () -> { if (epoch != generation || accountEpoch != BackgroundMonitor.get(context).generation() || !day.equals(day(System.currentTimeMillis())) || Thread.currentThread().isInterrupted()) throw new IOException("cancelled"); };
        NativeCloud cloud = new NativeCloud(); JSONObject actions = settings.optJSONObject("actions"); int delay = settings.optInt("requestIntervalMs", 2000);
        try {
            JSONObject signin = object(cloud.request("/v1.0/mine/cfmotoservermine/signin/count", "GET", Collections.emptyMap(), null, token, guard));
            JSONObject tasks = object(cloud.request("/v1.0/mine/cfmotoservermine/integral/getByUserId", "GET", Map.of("userId", uid), null, token, guard));
            if (actions.optBoolean("signin")) {
                int signed = integer(signin.opt("signStatus"));
                if (signed == 1) step(steps, "signin", "skipped", "already_done");
                else if (signed != 0) step(steps, "signin", "skipped", "state_unknown");
                else if (!claim(id, day, "signin")) step(steps, "signin", "skipped", "daily_gate");
                else { waitFor(delay, guard); try { cloud.h5("/cfmotoservermine/H5/signin", "POST", Collections.emptyMap(), new JSONObject(), token, guard);
                        signin = object(cloud.request("/v1.0/mine/cfmotoservermine/signin/count", "GET", Collections.emptyMap(), null, token, guard));
                        step(steps, "signin", integer(signin.opt("signStatus")) == 1 ? "confirmed" : "uncertain", integer(signin.opt("signStatus")) == 1 ? "accepted_not_verified" : "state_unknown");
                    } catch (Exception error) { step(steps, "signin", "uncertain", reason(error)); }
                }
            }
            if (actions.optBoolean("streakPrize")) {
                int count = integer(signin.opt("count"));
                if (integer(signin.opt("signStatus")) != 1 || count <= 0 || count % 30 != 0) step(steps, "streakPrize", "skipped", "not_eligible");
                else { JSONObject prize = object(cloud.h5("/cfmotoservermine/H5/signin/info", "GET", Map.of("month", day.substring(0, 7), "server_name", "SMART"), null, token, guard));
                    if (!day.equals(prize.optString("signPrizeDate"))) step(steps, "streakPrize", "skipped", "state_unknown");
                    else if (!claim(id, day, "streakPrize")) step(steps, "streakPrize", "skipped", "daily_gate");
                    else { waitFor(delay, guard); try { cloud.h5("/cfmotoservermine/H5/signin/supplementPrize", "GET", Map.of("supplementDate", day), null, token, guard); step(steps, "streakPrize", "uncertain", "accepted_not_verified"); } catch (Exception error) { step(steps, "streakPrize", "uncertain", reason(error)); } }
                }
            }
            for (String action : new String[] {"like", "share"}) if (actions.optBoolean(action)) {
                int state = taskState(tasks, action.equals("like") ? "1026" : "1024");
                if (state == 0) { step(steps, action, "skipped", "already_done"); continue; }
                if (state != 1) { step(steps, action, "skipped", "state_unknown"); continue; }
                // kindFlag=0 may toggle an existing like. The recovered likeType values have no proven add-only meaning.
                if (action.equals("like") && !settings.optBoolean("legacyLikeConfirmed", false)) { step(steps, action, "skipped", "state_unknown"); continue; }
                Object feed = cloud.request("/v1.0/social/cfmotoserversocial/community/qbTzInfoNewV2", "GET", Map.of("postModule", "1", "slidingType", "0", "page", "1", "pageSize", "20"), null, token, guard);
                JSONObject target = target(feed, uid); if (target == null) { step(steps, action, "skipped", "no_target"); continue; }
                if (!claim(id, day, action)) { step(steps, action, "skipped", "daily_gate"); continue; }
                waitFor(delay, guard); try {
                    if (action.equals("like")) cloud.request("/v1.0/social/cfmotoserversocial/socialCommu/likeFavoriteInfo", "POST", Collections.emptyMap(), NativeJson.obj("postId", target.getString("tuuid"), "kindFlag", "0"), token, guard);
                    else { cloud.request("/v1.0/social/cfmotoserversocial/article/share/" + target.getString("tuuid"), "PUT", Collections.emptyMap(), null, token, guard); guard.check(); cloud.request("/v1.0/mine/cfmotoservermine/integral/adjustByShare", "GET", Collections.emptyMap(), null, token, guard); }
                    tasks = object(cloud.request("/v1.0/mine/cfmotoservermine/integral/getByUserId", "GET", Map.of("userId", uid), null, token, guard));
                    boolean done = taskState(tasks, action.equals("like") ? "1026" : "1024") == 0; step(steps, action, done ? "confirmed" : "uncertain", done ? "accepted_not_verified" : "state_unknown");
                } catch (Exception error) { step(steps, action, "uncertain", reason(error)); }
            }
            if (actions.optBoolean("post")) {
                int state = taskState(tasks, "1023");
                if (state == 0) step(steps, "post", "skipped", "already_done");
                else if (state != 1) step(steps, "post", "skipped", "state_unknown");
                else {
                    Object before = cloud.request("/v1.0/social/cfmotoserversocial/community/mineArticleInfo", "GET", Map.of("userId", uid), null, token, guard);
                    if (!(before instanceof JSONArray)) step(steps, "post", "skipped", "evidence_unsafe");
                    else if (!claim(id, day, "post")) step(steps, "post", "skipped", "daily_gate");
                    else { HashSet<String> baseline = ids((JSONArray) before); String content = settings.optString("postContent"); waitFor(delay, guard); long started = System.currentTimeMillis();
                        try { cloud.request("/v1.0/social/cfmotoserversocial/commonArticle", "POST", Collections.emptyMap(), NativeJson.obj("postSubInfo", NativeJson.obj("topicList", new JSONArray()), "topicid", "", "postcontent", content), token, guard);
                            long ended = System.currentTimeMillis(); step(steps, "post", "uncertain", "accepted_not_verified");
                            if (actions.optBoolean("cleanup")) { JSONObject match = null;
                                for (int attempt = 0; attempt < 5; attempt++) { guard.check(); Object after = cloud.request("/v1.0/social/cfmotoserversocial/community/mineArticleInfo", "GET", Map.of("userId", uid), null, token, guard); match = uniquePost(after, baseline, uid, content, started, ended); if (match != null) break; waitFor(1000, guard); }
                                if (match == null) step(steps, "cleanup", "skipped", "evidence_unsafe");
                                else { guard.check(); cloud.request("/v1.0/social/cfmotoserversocial/commonArticle/deleteArticle", "DELETE", Map.of("articleId", match.getString("tuuid"), "postType", "1"), null, token, guard); step(steps, "cleanup", "uncertain", "accepted_not_verified"); }
                            }
                        } catch (Exception error) { step(steps, "post", "uncertain", reason(error)); }
                    }
                }
            }
            guard.check(); result.put("status", hasUncertain(steps) ? "partial" : "completed");
        } catch (Exception error) { try { result.put("status", "cancelled".equals(error.getMessage()) ? "cancelled" : "failed"); } catch (Exception ignored) { } }
        finally { synchronized (this) { try { result.put("lastRun", System.currentTimeMillis()); persist(); } catch (Exception ignored) { } } }
    }
    static int integer(Object raw) { if (!(raw instanceof Number) && !(raw instanceof String)) return -1; try { String text = String.valueOf(raw); if (!text.matches("\\d{1,8}")) return -1; return Integer.parseInt(text); } catch (RuntimeException ignored) { return -1; } }
    static int taskState(JSONObject tasks, String code) { JSONArray rows = tasks.optJSONArray("ps0003_01_002_VOList"); if (rows == null) return -1;
        for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); if (row != null && code.equals(String.valueOf(row.opt("code")))) { int flag = integer(row.opt("completeFlag")); return flag == 0 ? 0 : flag == 1 ? 1 : -1; } } return -1; }
    static JSONObject target(Object raw, String uid) { if (!(raw instanceof JSONArray)) return null; JSONObject chosen = null; long latest = -1;
        JSONArray rows = (JSONArray) raw; for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); if (row == null || !row.optString("tuuid").matches("[A-Za-z0-9_-]{1,64}") || row.optString("userid").isEmpty() || uid.equals(row.optString("userid"))) continue;
            long time = date(row.optString("createDate")); if (time > latest) { latest = time; chosen = row; } } return chosen; }
    static JSONObject uniquePost(Object raw, HashSet<String> baseline, String uid, String text, long started, long ended) { if (!(raw instanceof JSONArray)) return null; JSONArray rows = (JSONArray) raw; JSONObject found = null;
        for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); if (row == null) continue; String id = row.optString("tuuid"); long at = date(row.optString("createDate"));
            if (id.matches("[A-Za-z0-9_-]{1,64}") && !baseline.contains(id) && uid.equals(row.optString("userid")) && text.equals(row.optString("tcontent")) && at >= started - 2000 && at <= ended + 2000) { if (found != null) return null; found = row; } } return found; }
    private static HashSet<String> ids(JSONArray rows) throws IOException { HashSet<String> ids = new HashSet<>(); for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); if (row == null || !row.optString("tuuid").matches("[A-Za-z0-9_-]{1,64}")) throw new IOException("evidence_unsafe"); ids.add(row.optString("tuuid")); } return ids; }
    static long date(String text) { if (!text.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?")) return -1; try { SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.ROOT); format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai")); format.setLenient(false); Date parsed = format.parse(text.substring(0, 19)); return parsed == null ? -1 : parsed.getTime(); } catch (Exception ignored) { return -1; } }
    static String day(long time) { SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT); format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai")); return format.format(new Date(time)); }
    private static JSONObject object(Object value) throws IOException { if (!(value instanceof JSONObject)) throw new IOException("state_unknown"); return (JSONObject) value; }
    private static void waitFor(int delay, NativeCloud.Guard guard) throws Exception { long until = android.os.SystemClock.elapsedRealtime() + delay; while (android.os.SystemClock.elapsedRealtime() < until) { guard.check(); Thread.sleep(Math.min(250, Math.max(1, until - android.os.SystemClock.elapsedRealtime()))); } guard.check(); }
    private synchronized boolean claim(String account, String day, String action) throws Exception { String key = account + ":" + day + ":" + action; if (gates.has(key)) return false; gates.put(key, true); if (gates.length() > 2000) { JSONObject clean = new JSONObject(); java.util.Iterator<String> keys = gates.keys(); String current = day(System.currentTimeMillis()); while (keys.hasNext()) { String value = keys.next(); if (value.contains(":" + current + ":")) clean.put(value, true); } gates = clean; } persist(); return true; }
    private static void step(JSONArray steps, String action, String state, String reason) { steps.put(NativeJson.obj("action", action, "state", state, "reason", reason, "at", System.currentTimeMillis())); }
    private static boolean hasUncertain(JSONArray steps) { for (int i = 0; i < steps.length(); i++) if (steps.optJSONObject(i).optString("state").matches("uncertain|failed")) return true; return false; }
    private static String reason(Exception error) { String value = error.getMessage(); return "cancelled".equals(value) ? "cancelled" : "auth_expired".equals(value) ? "expired" : value != null && value.startsWith("cloud_") ? "rejected" : "network"; }
    private synchronized void persist() throws Exception { vault.save("background-tasks", NativeJson.obj("config", config, "results", results, "gates", gates, "lastRun", lastRun).toString()); }
}
