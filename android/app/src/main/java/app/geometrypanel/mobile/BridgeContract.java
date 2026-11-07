package app.geometrypanel.mobile;

final class BridgeContract {
    static final String REQUEST_ID = "[A-Za-z0-9_:-]{1,100}";
    private BridgeContract() { }
    static boolean validId(String value) { return value != null && value.matches(REQUEST_ID); }
}
