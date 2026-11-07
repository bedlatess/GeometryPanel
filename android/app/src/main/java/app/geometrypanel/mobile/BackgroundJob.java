package app.geometrypanel.mobile;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

public final class BackgroundJob extends JobService {
    private static final int ID = 2101;
    static void schedule(Context context, boolean enabled) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (!enabled) { scheduler.cancel(ID); return; }
        scheduler.schedule(new JobInfo.Builder(ID, new ComponentName(context, BackgroundJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(900000).setPersisted(true).build());
    }
    static boolean scheduled(Context context) { return context.getSystemService(JobScheduler.class).getPendingJob(ID) != null; }
    @Override public boolean onStartJob(JobParameters params) {
        BackgroundMonitor monitor = BackgroundMonitor.get(this); if (!monitor.enabled()) return false;
        return monitor.run(null, () -> jobFinished(params, false));
    }
    @Override public boolean onStopJob(JobParameters params) { BackgroundMonitor.get(this).cancelRun(); return true; }
    public static final class Boot extends BroadcastReceiver {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
                schedule(context, BackgroundMonitor.get(context).enabled());
                try { TaskJob.schedule(context, NativeTasks.get(context).config(), false); } catch (Exception ignored) { }
            }
        }
    }
}
