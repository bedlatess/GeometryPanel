package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class NativeTasksTest {
    @Test public void taskDefaultsNeverPublishAndPostRequiresIndependentContent() throws Exception {
        JSONObject defaults = TaskConfig.clean(new JSONObject()); assertFalse(defaults.getBoolean("enabled"));
        for (String name : TaskConfig.ACTIONS) assertFalse(defaults.getJSONObject("actions").getBoolean(name));
        assertThrows(Exception.class, () -> TaskConfig.clean(NativeJson.obj("actions", NativeJson.obj("post", true))));
        assertThrows(Exception.class, () -> TaskConfig.clean(NativeJson.obj("time", "25:00")));
        assertThrows(Exception.class, () -> TaskConfig.clean(NativeJson.obj("requestIntervalMs", 0.5)));
        assertFalse(TaskConfig.clean(NativeJson.obj("actions", NativeJson.obj("cleanup", true))).getJSONObject("actions").getBoolean("cleanup"));
    }
    @Test public void zeroCompleteFlagMeansDoneAndUnknownFlagsNeverAuthorizeWrites() {
        JSONObject tasks = NativeJson.obj("ps0003_01_002_VOList", new JSONArray().put(NativeJson.obj("code", 1026, "completeFlag", "0")).put(NativeJson.obj("code", 1024, "completeFlag", 1)));
        assertEquals(0, NativeTasks.taskState(tasks, "1026")); assertEquals(1, NativeTasks.taskState(tasks, "1024")); assertEquals(-1, NativeTasks.taskState(tasks, "1023"));
        assertEquals(-1, NativeTasks.integer(true)); assertEquals(-1, NativeTasks.integer("1.5"));
    }
    @Test public void cleanupRequiresUniqueAuthorContentTimeAndNonbaselineIdentity() {
        long at = NativeTasks.date("2026-11-07 12:00:00"); assertTrue(at > 0);
        JSONObject valid = NativeJson.obj("tuuid", "new-post", "userid", "synthetic", "tcontent", "test content", "createDate", "2026-11-07 12:00:00.123456");
        JSONArray rows = new JSONArray().put(valid); HashSet<String> baseline = new HashSet<>();
        assertNotNull(NativeTasks.uniquePost(rows, baseline, "synthetic", "test content", at, at + 500));
        assertNull(NativeTasks.uniquePost(rows, baseline, "other-user", "test content", at, at + 500));
        assertNull(NativeTasks.uniquePost(rows, baseline, "synthetic", "different", at, at + 500));
        baseline.add("new-post"); assertNull(NativeTasks.uniquePost(rows, baseline, "synthetic", "test content", at, at + 500));
        baseline.clear(); rows.put(valid); assertNull(NativeTasks.uniquePost(rows, baseline, "synthetic", "test content", at, at + 500));
        assertEquals(-1, NativeTasks.date("2026-02-30 12:00:00"));
    }
}
