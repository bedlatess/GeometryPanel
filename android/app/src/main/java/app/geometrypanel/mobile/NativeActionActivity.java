package app.geometrypanel.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Every launcher invocation is authenticated again against the current encrypted account scope. */
public final class NativeActionActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor(); private volatile boolean cancelled;
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state); TextView status = new TextView(this); status.setPadding(32, 64, 32, 32); status.setTextSize(18); setContentView(status);
        try { NativeActions.verify(this, getIntent().getData()); status.setText("正在发送：" + NativeActions.label(getIntent().getData().getLastPathSegment())); }
        catch (Exception error) { status.setText("桌面入口绑定已失效，请在面板中重新配置当前车辆。"); return; }
        worker.execute(() -> {
            String result;
            try { NativeActions.execute(this, getIntent().getData(), () -> { if (cancelled) throw new IOException("cancelled"); }); result = "refresh".equals(getIntent().getData().getLastPathSegment()) ? "正在读取，请查看组件更新时间" : "已发送，请查看车辆状态"; }
            catch (Exception error) { result = "结果尚未确认，请查看车辆，勿重复操作"; }
            String message = result; runOnUiThread(() -> { if (!isFinishing()) status.setText(message); });
        });
    }
    @Override protected void onDestroy() { cancelled = true; worker.shutdownNow(); super.onDestroy(); }
}
