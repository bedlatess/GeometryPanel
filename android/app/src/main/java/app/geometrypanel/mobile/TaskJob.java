package app.geometrypanel.mobile;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.util.Calendar;
import org.json.JSONObject;

public final class TaskJob extends JobService {
    private static final int ID = 2102;
    static void schedule(Context context, JSONObject config, boolean tomorrow) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class); if (!config.optBoolean("enabled")) { scheduler.cancel(ID); return; }
        String time = config.optString("time", "09:00"); Calendar next = Calendar.getInstance(); next.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time.substring(0, 2))); next.set(Calendar.MINUTE, Integer.parseInt(time.substring(3, 5))); next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        if (tomorrow || next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_MONTH, 1);
        long wait = Math.max(1000, next.getTimeInMillis() - System.currentTimeMillis());
        scheduler.schedule(new JobInfo.Builder(ID, new ComponentName(context, TaskJob.class)).setMinimumLatency(wait).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setBackoffCriteria(1200000, JobInfo.BACKOFF_POLICY_LINEAR).build());
    }
    static boolean scheduled(Context context) { return context.getSystemService(JobScheduler.class).getPendingJob(ID) != null; }
    private void complete(NativeTasks tasks, JobParameters params) {
        try {
            JSONObject state = tasks.status(); org.json.JSONArray accounts = state.getJSONArray("accounts"); boolean retry = false;
            for (int i = 0; i < accounts.length(); i++) { JSONObject row = accounts.getJSONObject(i); retry |= row.optString("status").matches("failed|cancelled");
                org.json.JSONArray steps = row.optJSONArray("steps"); if (steps != null) for (int n = 0; n < steps.length(); n++) retry |= "network".equals(steps.getJSONObject(n).optString("reason"));
            }
            android.content.SharedPreferences counters = getSharedPreferences("native-task-job", MODE_PRIVATE); String day = NativeTasks.day(System.currentTimeMillis());
            int attempts = day.equals(counters.getString("day", "")) ? counters.getInt("attempts", 0) : 0; attempts++;
            counters.edit().putString("day", day).putInt("attempts", attempts).apply();
            if (retry && attempts < 3 && tasks.config().optBoolean("enabled")) getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(ID, new ComponentName(this, TaskJob.class)).setMinimumLatency(1200000).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build());
            else schedule(this, tasks.config(), true);
        } catch (Exception ignored) { }
        jobFinished(params, false);
    }
    @Override public boolean onStartJob(JobParameters params) {
        try { NativeTasks tasks = NativeTasks.get(this); if (!tasks.config().optBoolean("enabled")) return false;
            return tasks.run(null, true, () -> complete(tasks, params));
        } catch (Exception error) { return false; }
    }
    @Override public boolean onStopJob(JobParameters params) { NativeTasks.get(this).cancel(); return true; }
}
