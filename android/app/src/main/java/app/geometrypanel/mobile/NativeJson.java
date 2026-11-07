package app.geometrypanel.mobile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class NativeJson {
    private NativeJson() { }
    static JSONObject obj(Object... values) {
        JSONObject result = new JSONObject();
        try { for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]); }
        catch (JSONException error) { throw new IllegalArgumentException("invalid_result"); }
        return result;
    }
    static String string(JSONObject object, String key, int max) {
        Object value = object.opt(key);
        if (!(value instanceof String) || ((String) value).length() > max || ((String) value).matches("(?s).*\\p{Cntrl}.*")) throw new IllegalArgumentException("invalid_" + key);
        return (String) value;
    }
    static JSONArray list(String... values) { return new JSONArray(java.util.Arrays.asList(values)); }
    interface Result { void finish(JSONObject result, String error); }
}
