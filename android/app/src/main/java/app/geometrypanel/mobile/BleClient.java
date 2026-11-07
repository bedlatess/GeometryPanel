package app.geometrypanel.mobile;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

@SuppressLint("MissingPermission")
final class BleClient {
    static final UUID SERVICE = UUID.fromString("0000B354-D6D8-C7EC-BDF0-EAB1BFC6BCBC");
    static final UUID WRITE = UUID.fromString("0000B356-D6D8-C7EC-BDF0-EAB1BFC6BCBC");
    static final UUID NOTIFY = UUID.fromString("0000B357-D6D8-C7EC-BDF0-EAB1BFC6BCBC");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB");
    private final Context context;
    private final NativeVault vault;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writer, notifier;
    private VehicleMaterial material;
    private BleProtocol.Decoder decoder = new BleProtocol.Decoder();
    private final ArrayList<BleProtocol.Frame> deferred = new ArrayList<>();
    private NativeJson.Result connectReply, requestReply, bondReply;
    private int expected, mtu = 23, offset, epoch;
    private byte[] outgoing;
    private boolean ready, authenticated, telemetry, dashboard, bindAcknowledged, registered;
    private Integer rssi;
    private String state = "idle", reason = "";
    private JSONObject telemetrySample = new JSONObject();
    private long telemetryAt;
    private BroadcastReceiver bondReceiver;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private NativeJson.Result scanReply;

    BleClient(Context context, NativeVault vault) { this.context = context.getApplicationContext(); this.vault = vault; }
    void bind(VehicleMaterial next) { disconnect("vehicle_changed"); material = next; }
    boolean fresh() { return material != null && material.fresh(System.currentTimeMillis()); }
    boolean supported() { return adapter() != null; }
    boolean connected() { return ready && gatt != null; }
    boolean authenticated() { return connected() && authenticated; }
    private BluetoothAdapter adapter() { BluetoothManager manager = context.getSystemService(BluetoothManager.class); return manager == null ? null : manager.getAdapter(); }

    JSONObject status() {
        return NativeJson.obj("state", state, "reason", reason, "connected", connected(), "authenticated", authenticated(),
                "busy", connectReply != null || requestReply != null || bondReply != null, "authorizationFresh", fresh(),
                "bindAcknowledged", bindAcknowledged, "vehicleRegistered", registered, "automaticUnlockVerified", false,
                "supportedBle2", false, "telemetryRunning", telemetry, "dashboardRunning", dashboard,
                "rssi", rssi == null ? JSONObject.NULL : rssi, "telemetry", telemetrySample, "telemetryAt", telemetryAt,
                "protocolEvidence", "legacy-static-unverified-on-device");
    }

    void scan(NativeJson.Result result) {
        if (!fresh()) { result.finish(null, "refresh_required"); return; }
        if (material.mac.isEmpty()) { result.finish(null, "ble_address_missing"); return; }
        if (scanReply != null) { result.finish(null, "busy"); return; }
        try {
            BluetoothAdapter adapter = adapter();
            if (adapter == null || !adapter.isEnabled()) { result.finish(null, "bluetooth_off"); return; }
            scanner = adapter.getBluetoothLeScanner();
        } catch (RuntimeException error) { result.finish(null, "scan_permission_denied"); return; }
        if (scanner == null) { result.finish(null, "bluetooth_unavailable"); return; }
        scanReply = result;
        scanCallback = new ScanCallback() {
            @Override public void onScanResult(int type, ScanResult scan) {
                handler.post(() -> { try { if (scanReply != null && material != null && material.mac.equalsIgnoreCase(scan.getDevice().getAddress())) {
                    rssi = scan.getRssi(); finishScan(NativeJson.obj("found", true, "rssi", rssi, "devices", new org.json.JSONArray().put(NativeJson.obj("id", "bound", "name", "当前车辆", "rssi", rssi))), null);
                } } catch (RuntimeException error) { finishScan(null, "scan_permission_denied"); } });
            }
            @Override public void onScanFailed(int code) { handler.post(() -> finishScan(null, "scan_failed")); }
        };
        try {
            scanner.startScan(java.util.Collections.singletonList(new ScanFilter.Builder().setDeviceAddress(material.mac).build()),
                    new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build(), scanCallback);
            NativeJson.Result active = scanReply;
            handler.postDelayed(() -> { if (scanReply == active) finishScan(NativeJson.obj("found", false, "devices", new org.json.JSONArray()), null); }, 10000);
        } catch (RuntimeException error) { finishScan(null, "permission_or_scan_failed"); }
    }
    private void finishScan(JSONObject result, String error) {
        NativeJson.Result reply = scanReply; scanReply = null;
        if (scanner != null && scanCallback != null) try { scanner.stopScan(scanCallback); } catch (RuntimeException ignored) { }
        scanner = null; scanCallback = null;
        if (reply != null) reply.finish(result, error);
    }
    void cancelScan() { finishScan(null, "user_cancelled"); }

    void connect(NativeJson.Result result) {
        if (!fresh()) { result.finish(null, "refresh_required"); return; }
        if (!material.materialReady) { result.finish(null, "ble_material_missing"); return; }
        if (connectReply != null || requestReply != null || bondReply != null) { result.finish(null, "busy"); return; }
        if (connected()) { result.finish(status(), null); return; }
        BluetoothAdapter adapter;
        try {
            adapter = adapter();
            if (adapter == null || !adapter.isEnabled()) { result.finish(null, "bluetooth_off"); return; }
        } catch (RuntimeException error) { result.finish(null, "permission_denied"); return; }
        disconnect("reconnecting");
        connectReply = result; state = "connecting"; reason = ""; int token = epoch;
        try {
            BluetoothDevice device = adapter.getRemoteDevice(material.mac);
            gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE, BluetoothDevice.PHY_LE_1M_MASK, handler);
            handler.postDelayed(() -> { if (epoch == token && !ready) fail("connection_timeout"); }, 15000);
        } catch (RuntimeException error) { fail("connection_failed"); }
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt source, int status, int next) { handler.post(() -> {
            if (gatt != source) return;
            if (status != BluetoothGatt.GATT_SUCCESS || next == BluetoothProfile.STATE_DISCONNECTED) { fail("disconnected"); return; }
            if (next == BluetoothProfile.STATE_CONNECTED) {
                state = "discovering";
                try { if (!source.discoverServices()) fail("service_discovery_failed"); } catch (RuntimeException error) { fail("permission_denied"); }
            }
        }); }
        @Override public void onServicesDiscovered(BluetoothGatt source, int status) { handler.post(() -> {
            if (gatt != source) return;
            BluetoothGattService service = source.getService(SERVICE);
            if (status != BluetoothGatt.GATT_SUCCESS || service == null) { fail("service_missing"); return; }
            writer = service.getCharacteristic(WRITE); notifier = service.getCharacteristic(NOTIFY);
            if (writer == null || notifier == null || (writer.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) == 0
                    || (notifier.getProperties() & BluetoothGattCharacteristic.PROPERTY_NOTIFY) == 0 || notifier.getDescriptor(CCCD) == null) { fail("characteristic_missing"); return; }
            state = "negotiating";
            try { if (!source.requestMtu(247)) enableNotifications(source); }
            catch (RuntimeException error) { enableNotifications(source); }
            int token = epoch;
            handler.postDelayed(() -> { if (epoch == token && "negotiating".equals(state)) enableNotifications(source); }, 3000);
        }); }
        @Override public void onMtuChanged(BluetoothGatt source, int value, int status) { handler.post(() -> {
            if (gatt != source || !"negotiating".equals(state)) return;
            if (status == BluetoothGatt.GATT_SUCCESS && value >= 23) mtu = Math.min(value, 247);
            enableNotifications(source);
        }); }
        @Override public void onDescriptorWrite(BluetoothGatt source, BluetoothGattDescriptor descriptor, int status) { handler.post(() -> {
            if (gatt != source || !CCCD.equals(descriptor.getUuid()) || !"subscribing".equals(state)) return;
            if (status != BluetoothGatt.GATT_SUCCESS) { fail("notification_failed"); return; }
            ready = true; state = "connected_unverified";
            NativeJson.Result reply = connectReply; connectReply = null; if (reply != null) reply.finish(status(), null);
        }); }
        @Override public void onCharacteristicWrite(BluetoothGatt source, BluetoothGattCharacteristic characteristic, int status) { handler.post(() -> {
            if (gatt != source || !WRITE.equals(characteristic.getUuid()) || outgoing == null) return;
            if (status != BluetoothGatt.GATT_SUCCESS) { fail("write_failed_result_unknown"); return; }
            if (offset < outgoing.length) writeChunk();
            else {
                Arrays.fill(outgoing, (byte) 0); outgoing = null;
                ArrayList<BleProtocol.Frame> copy = new ArrayList<>(deferred); deferred.clear(); for (BleProtocol.Frame frame : copy) receive(frame);
            }
        }); }
        @SuppressWarnings("deprecation") @Override public void onCharacteristicChanged(BluetoothGatt source, BluetoothGattCharacteristic characteristic) {
            if (Build.VERSION.SDK_INT < 33) notification(source, characteristic.getUuid(), characteristic.getValue());
        }
        @Override public void onCharacteristicChanged(BluetoothGatt source, BluetoothGattCharacteristic characteristic, byte[] value) { notification(source, characteristic.getUuid(), value); }
        @Override public void onReadRemoteRssi(BluetoothGatt source, int value, int status) { handler.post(() -> {
            if (gatt == source && status == BluetoothGatt.GATT_SUCCESS && value >= -127 && value <= 20) rssi = value;
        }); }
    };
    private void enableNotifications(BluetoothGatt source) {
        if (gatt != source || !"negotiating".equals(state)) return;
        state = "subscribing";
        try {
            if (!source.setCharacteristicNotification(notifier, true)) { fail("notification_failed"); return; }
            BluetoothGattDescriptor descriptor = notifier.getDescriptor(CCCD);
            boolean accepted;
            if (Build.VERSION.SDK_INT >= 33) accepted = source.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == android.bluetooth.BluetoothStatusCodes.SUCCESS;
            else { descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE); accepted = source.writeDescriptor(descriptor); }
            if (!accepted) fail("notification_failed");
        } catch (RuntimeException error) { fail("notification_failed"); }
    }
    private void notification(BluetoothGatt source, UUID uuid, byte[] value) {
        if (value == null || value.length > 2048) return;
        byte[] copy = value.clone();
        handler.post(() -> {
            if (gatt != source || !NOTIFY.equals(uuid)) return;
            try { for (BleProtocol.Frame frame : decoder.accept(copy)) {
                if (outgoing != null) { if (deferred.size() >= 16) { fail("notification_queue_limit"); return; } deferred.add(frame); }
                else receive(frame);
            } } catch (IllegalArgumentException ignored) { fail("notification_invalid"); }
            finally { Arrays.fill(copy, (byte) 0); }
        });
    }

    void command(String action, NativeJson.Result result) {
        if (!fresh()) { result.finish(null, "refresh_required"); return; }
        if (!connected()) { result.finish(null, "connect_first"); return; }
        if (requestReply != null || bondReply != null || outgoing != null) { result.finish(null, "busy"); return; }
        if ("authenticate".equals(action)) { authenticate(result); return; }
        if ("bond".equals(action)) { bond(result); return; }
        if ("register".equals(action)) { register(result); return; }
        if (!authenticated) { result.finish(null, "authenticate_first"); return; }
        switch (action) {
            case "query":
                try {
                    byte[] identity = vault.identity();
                    byte[] payload = BleProtocol.join(BleProtocol.number(1, 1), BleProtocol.bytes(2, identity)); Arrays.fill(identity, (byte) 0);
                    request(0x7f, payload, 0xff, (reply, error) -> {
                        if (error != null) { result.finish(null, error); return; }
                        try {
                            Map<Integer, BleProtocol.Field> fields = BleProtocol.parse(replyPayload);
                            long role = BleProtocol.number(fields, 1, -1), value = BleProtocol.number(fields, 2, 0);
                            if (role != 1 || value < 0 || value > 2) throw new IllegalArgumentException();
                            registered = value == 0;
                            result.finish(NativeJson.obj("vehicleRegistered", registered, "queryState", value == 0 ? "confirmed" : value == 1 ? "not_registered" : "sync_failed"), null);
                        } catch (RuntimeException invalid) { result.finish(null, "query_ack_invalid"); }
                    });
                } catch (Exception error) { result.finish(null, "identity_storage_failed"); }
                return;
            case "telemetryOn": subscription(true, true, result); return;
            case "telemetryOff": subscription(true, false, result); return;
            case "dashboardOn": subscription(false, true, result); return;
            case "dashboardOff": subscription(false, false, result); return;
            default: result.finish(null, "unsupported_action");
        }
    }
    // Payload is consumed synchronously in the matching callback and is never returned to JavaScript.
    private byte[] replyPayload = new byte[0];
    private void authenticate(NativeJson.Result result) {
        if (authenticated) { result.finish(status(), null); return; }
        request(0x5a, BleProtocol.bytes(1, BleProtocol.hex(material.encryptedValue, 64)), 0x5b, (reply, error) -> {
            if (error != null) { result.finish(null, error); return; }
            try {
                byte[] response = BleProtocol.challenge(replyPayload, material.key);
                request(0x5c, response, 0x5d, (ack, failure) -> {
                    if (failure != null) { result.finish(null, failure); return; }
                    try {
                        if (BleProtocol.number(BleProtocol.parse(replyPayload), 1, Long.MIN_VALUE) != 0) throw new IllegalArgumentException();
                        authenticated = true; state = "authenticated"; result.finish(status(), null);
                    } catch (RuntimeException invalid) { result.finish(null, "authentication_rejected"); }
                });
            } catch (Exception invalid) { result.finish(null, "challenge_invalid"); }
        });
    }
    private void register(NativeJson.Result result) {
        if (material.generation != 2) { result.finish(null, "pairing_generation_unsupported"); return; }
        if (!material.cloudEnabled) { result.finish(null, "enable_inductive_in_cloud_first"); return; }
        NativeJson.Result afterBond = (ignored, bondError) -> {
            if (bondError != null) { result.finish(null, bondError); return; }
            authenticate((auth, error) -> {
                if (error != null) { result.finish(null, error); return; }
                try {
                    byte[] identity = vault.identity();
                    byte[] payload = BleProtocol.bytes(1, identity); String identityHex = BleProtocol.hex(identity); Arrays.fill(identity, (byte) 0);
                    request(0x77, payload, 0xf7, (reply, failure) -> {
                        if (failure != null) { result.finish(null, failure); return; }
                        if (replyPayload.length != 0) { result.finish(null, "bind_ack_invalid"); return; }
                        bindAcknowledged = true;
                        if ("1".equals(material.broadcastType)) { result.finish(NativeJson.obj("bindAcknowledged", true, "uniqueIdentify", identityHex), null); return; }
                        request(0x78, BleProtocol.number(1, 2), 0xf8, (ack, rejection) -> {
                            if (rejection != null) { result.finish(null, rejection); return; }
                            try {
                                long value = replyPayload.length == 1 ? replyPayload[0] & 255 : BleProtocol.number(BleProtocol.parse(replyPayload), 1, -1);
                                if (value != 1) throw new IllegalArgumentException();
                                bond((bonded, bondFailure) -> result.finish(bondFailure == null ? NativeJson.obj("bindAcknowledged", true, "uniqueIdentify", identityHex) : null, bondFailure));
                            } catch (RuntimeException invalid) { result.finish(null, "broadcast_ack_invalid"); }
                        });
                    });
                } catch (Exception failure) { result.finish(null, "identity_storage_failed"); }
            });
        };
        if ("1".equals(material.broadcastType)) bond(afterBond); else afterBond.finish(null, null);
    }
    private void bond(NativeJson.Result result) {
        if (gatt == null) { result.finish(null, "connect_first"); return; }
        BluetoothDevice device = gatt.getDevice();
        try {
            if (device.getBondState() == BluetoothDevice.BOND_BONDED) { result.finish(NativeJson.obj("bonded", true), null); return; }
            bondReply = result; int token = epoch;
            bondReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    BluetoothDevice target = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (target == null || !target.equals(device) || epoch != token) return;
                    try {
                        int state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE);
                        int actual = device.getBondState();
                        if (state != actual) return;
                        if (actual == BluetoothDevice.BOND_BONDED) finishBond(null);
                        else if (actual == BluetoothDevice.BOND_NONE) finishBond("bond_failed");
                    } catch (RuntimeException error) { finishBond("bond_permission_denied"); }
                }
            };
            IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(bondReceiver, filter, Context.RECEIVER_EXPORTED);
            else context.registerReceiver(bondReceiver, filter);
            if (device.getBondState() != BluetoothDevice.BOND_BONDING && !device.createBond()) { finishBond("bond_failed"); return; }
            handler.postDelayed(() -> { if (epoch == token && bondReply == result) finishBond("bond_timeout"); }, 30000);
        } catch (RuntimeException error) { finishBond("bond_permission_denied"); }
    }
    private void finishBond(String error) {
        NativeJson.Result reply = bondReply; bondReply = null;
        if (bondReceiver != null) { try { context.unregisterReceiver(bondReceiver); } catch (RuntimeException ignored) { } bondReceiver = null; }
        if (reply != null) reply.finish(error == null ? NativeJson.obj("bonded", true) : null, error);
    }
    private void subscription(boolean ordinary, boolean enabled, NativeJson.Result result) {
        byte[] payload = ordinary && !enabled ? new byte[0] : BleProtocol.number(1, enabled ? 1 : 0);
        request(ordinary ? 0x7c : 0x72, payload, ordinary ? 0xfc : 0xf2, (reply, error) -> {
            if (error != null) { result.finish(null, error); return; }
            try {
                long value = replyPayload.length == 0 ? 0 : BleProtocol.number(BleProtocol.parse(replyPayload), 1, -1);
                if (ordinary && enabled && replyPayload.length != 0 || value != 0 && !(ordinary && !enabled && value == 16)) throw new IllegalArgumentException();
                if (ordinary) telemetry = enabled; else dashboard = enabled;
                result.finish(NativeJson.obj("acknowledged", true, "running", enabled, "streamSeen", false), null);
            } catch (RuntimeException invalid) { result.finish(null, "subscription_ack_invalid"); }
        });
    }
    private void request(int control, byte[] payload, int wanted, NativeJson.Result result) {
        if (!fresh() || !connected()) { result.finish(null, "refresh_or_connect_required"); return; }
        if (requestReply != null || outgoing != null) { result.finish(null, "busy"); return; }
        requestReply = result; expected = wanted;
        outgoing = BleProtocol.frame(control, payload); Arrays.fill(payload, (byte) 0); offset = 0;
        int token = epoch; writeChunk();
        handler.postDelayed(() -> { if (epoch == token && requestReply == result) {
            fail("ack_timeout_result_unknown");
        } }, control == 0x5a || control == 0x5c ? 10000 : 8000);
    }
    private void writeChunk() {
        if (gatt == null || outgoing == null || writer == null) return;
        byte[] chunk = Arrays.copyOfRange(outgoing, offset, Math.min(outgoing.length, offset + mtu - 3)); offset += chunk.length;
        int at = offset, token = epoch; byte[] packet = outgoing;
        try {
            boolean accepted;
            if (Build.VERSION.SDK_INT >= 33) accepted = gatt.writeCharacteristic(writer, chunk, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == android.bluetooth.BluetoothStatusCodes.SUCCESS;
            else { writer.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT); writer.setValue(chunk); accepted = gatt.writeCharacteristic(writer); }
            if (!accepted) { fail("write_failed_result_unknown"); return; }
            handler.postDelayed(() -> { if (epoch == token && outgoing == packet && offset == at) fail("write_timeout_result_unknown"); }, 6000);
        } catch (RuntimeException error) { fail("write_permission_denied"); }
    }
    private void receive(BleProtocol.Frame frame) {
        if ((frame.control == 0xfd && telemetry || frame.control == 0xf3 && dashboard) && authenticated) { sample(frame); return; }
        if (requestReply == null || frame.control != expected) return;
        NativeJson.Result reply = requestReply; requestReply = null;
        replyPayload = frame.payload;
        try { reply.finish(NativeJson.obj("acknowledged", true), null); }
        finally { Arrays.fill(frame.payload, (byte) 0); replyPayload = new byte[0]; }
    }
    private void sample(BleProtocol.Frame frame) {
        try {
            Map<Integer, BleProtocol.Field> fields = BleProtocol.parse(frame.payload);
            JSONObject next = NativeJson.obj("schemaVerified", false, "stream", frame.control == 0xfd ? "telemetry" : "dashboard");
            if (frame.control == 0xfd) {
                long soc = BleProtocol.number(fields, 2, -1), lock = BleProtocol.number(fields, 1, -1);
                if (soc >= 0 && soc <= 200) next.put("soc", soc / 2.0);
                if (lock >= 0 && lock <= 2) next.put("headLockState", lock);
                BleProtocol.Field voltage = fields.get(5), temp = fields.get(6);
                if (voltage != null && voltage.wire == 5) { float value = (Float) voltage.value; if (Float.isFinite(value) && value >= 0 && value <= 200) next.put("voltage", value); }
                if (temp != null && temp.wire == 5) { float value = (Float) temp.value; if (Float.isFinite(value) && value >= -50 && value <= 150) next.put("temperature", value); }
            } else {
                long speed = BleProtocol.number(fields, 1, -1); if (speed >= 0 && speed <= 300) next.put("speedKph", speed);
            }
            telemetrySample = next; telemetryAt = System.currentTimeMillis();
            NativeNotifications.sample(context, next, telemetryAt);
        } catch (Exception ignored) { /* Invalid telemetry never updates a reading. */ }
    }
    void readRssi() { if (connected() && requestReply == null && outgoing == null && bondReply == null) try { gatt.readRemoteRssi(); } catch (RuntimeException ignored) { } }
    private void fail(String error) { disconnect(error); state = "error"; reason = error; }
    void disconnect(String why) {
        epoch++; ready = authenticated = telemetry = dashboard = bindAcknowledged = registered = false;
        BluetoothGatt old = gatt; gatt = null; writer = notifier = null;
        if (old != null) { try { old.disconnect(); } catch (RuntimeException ignored) { } try { old.close(); } catch (RuntimeException ignored) { } }
        if (outgoing != null) Arrays.fill(outgoing, (byte) 0); outgoing = null;
        decoder = new BleProtocol.Decoder(); deferred.clear(); telemetrySample = new JSONObject(); telemetryAt = 0; rssi = null;
        NativeJson.Result connecting = connectReply, requested = requestReply; connectReply = requestReply = null;
        state = "idle"; reason = why;
        if (connecting != null) connecting.finish(null, why);
        if (requested != null) requested.finish(null, why);
        finishBond(why); finishScan(null, why);
    }
}
