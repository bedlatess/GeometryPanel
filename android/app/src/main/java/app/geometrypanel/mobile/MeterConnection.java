package app.geometrypanel.mobile;

import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.wifi.WpsInfo;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.Enumeration;

@SuppressLint("MissingPermission")
final class MeterConnection implements AutoCloseable {
    interface Listener { void ready(MeterConnection connection); void failed(String reason); }
    private final Context context;
    private final NativeEngine engine;
    private final long generation;
    private final MeterProfile profile;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final WifiP2pManager manager;
    private final WifiP2pManager.Channel channel;
    private final Listener listener;
    private BroadcastReceiver receiver;
    private volatile boolean closed;
    private boolean delivered, initiated, inspecting;
    private volatile Network network;
    private volatile InetAddress owner, local;
    private volatile String groupInterface;
    private final Runnable poll = this::inspect;

    MeterConnection(Context context, MeterProfile profile, Listener listener) {
        this.context = context.getApplicationContext(); this.profile = profile; this.listener = listener;
        engine = NativeEngine.get(context); generation = engine.generation;
        manager = context.getSystemService(WifiP2pManager.class);
        channel = manager == null ? null : manager.initialize(context, Looper.getMainLooper(), () -> fail("wifi_channel_lost"));
    }
    void connect() {
        if (manager == null || channel == null || engine.material == null) { fail("wifi_direct_unavailable"); return; }
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) { if (WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(intent.getAction())) inspect(); }
        };
        try {
            IntentFilter filter = new IntentFilter(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED); else context.registerReceiver(receiver, filter);
            manager.requestGroupInfo(channel, group -> {
                if (!valid()) return;
                try {
                if (group != null) {
                    if (group.getOwner() != null && profile.mac.equalsIgnoreCase(group.getOwner().deviceAddress) && !group.isGroupOwner()) inspect();
                    else fail("different_wifi_direct_group");
                    return;
                }
                WifiP2pConfig config = new WifiP2pConfig(); config.deviceAddress = profile.mac; config.groupOwnerIntent = 0; config.wps.setup = WpsInfo.PBC;
                initiated = true;
                manager.connect(channel, config, new WifiP2pManager.ActionListener() {
                    @Override public void onSuccess() { inspect(); }
                    @Override public void onFailure(int reason) { fail("wifi_pairing_failed"); }
                });
                } catch (RuntimeException error) { fail("wifi_permission_denied"); }
            });
            handler.postDelayed(() -> { if (!delivered && valid()) fail("wifi_pairing_timeout"); }, 30000);
        } catch (RuntimeException error) { fail("wifi_permission_denied"); }
    }
    private void inspect() {
        if (!valid() || inspecting) return;
        handler.removeCallbacks(poll); inspecting = true;
        try { manager.requestConnectionInfo(channel, info -> {
            if (!valid()) return;
            if (!info.groupFormed || info.isGroupOwner || info.groupOwnerAddress == null) { retryOrLost(); return; }
            try { manager.requestGroupInfo(channel, group -> {
                if (!valid()) return;
                if (group == null || group.getOwner() == null) { retryOrLost(); return; }
                if (group.isGroupOwner() || !profile.mac.equalsIgnoreCase(group.getOwner().deviceAddress)) { fail("wifi_identity_mismatch"); return; }
                if (!(info.groupOwnerAddress instanceof Inet4Address) || !info.groupOwnerAddress.isSiteLocalAddress()) { fail("wifi_address_invalid"); return; }
                try {
                    String iface = group.getInterface();
                    Route route = resolve(iface, info.groupOwnerAddress);
                    if (route == null) { retryOrLost(); return; }
                    if (delivered && (!owner.equals(info.groupOwnerAddress) || !local.equals(route.source) || !groupInterface.equals(iface)
                            || !java.util.Objects.equals(network, route.network))) { fail("wifi_route_changed"); return; }
                    network = route.network; owner = info.groupOwnerAddress; local = route.source; groupInterface = iface;
                    inspecting = false;
                    if (!delivered) { delivered = true; listener.ready(this); }
                    if (valid()) handler.postDelayed(poll, 1000);
                } catch (IOException | RuntimeException error) { fail("wifi_route_unverified"); }
            }); } catch (RuntimeException error) { fail("wifi_connection_lost"); }
        }); } catch (RuntimeException error) { fail("wifi_connection_lost"); }
    }
    private void retryOrLost() {
        inspecting = false;
        if (delivered) fail("wifi_connection_lost"); else if (valid()) handler.postDelayed(poll, 500);
    }
    private static final class Route {
        final Network network; final InetAddress source;
        Route(Network network, InetAddress source) { this.network = network; this.source = source; }
    }
    /** Some Android P2P interfaces have no ConnectivityManager Network. Never use an unbound default socket. */
    private Route resolve(String iface, InetAddress peer) throws IOException {
        if (iface == null || iface.isEmpty()) return null;
        ConnectivityManager connectivity = context.getSystemService(ConnectivityManager.class);
        if (connectivity == null) throw new IOException("network_unavailable");
        Network match = null; InetAddress source = null; boolean pendingGroupNetwork = false;
        Network[] candidates = connectivity.getAllNetworks();
        for (Network candidate : candidates) {
            LinkProperties links = connectivity.getLinkProperties(candidate); NetworkCapabilities caps = connectivity.getNetworkCapabilities(candidate);
            if (links != null && iface.equals(links.getInterfaceName())) pendingGroupNetwork = true;
            if (links == null || caps == null || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                    || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                    || !iface.equals(links.getInterfaceName())) continue;
            InetAddress verified = null;
            for (LinkAddress address : links.getLinkAddresses()) if (MeterRoute.source(address.getAddress(), address.getPrefixLength(), peer)) {
                if (verified != null) throw new IOException("ambiguous_wifi_source"); verified = address.getAddress();
            }
            int longest = -1; boolean allowed = false;
            for (RouteInfo route : links.getRoutes()) if (route.matches(peer)) {
                int prefix = route.getDestination().getPrefixLength();
                InetAddress gateway = route.getGateway();
                boolean unicast = Build.VERSION.SDK_INT < 33 || route.getType() == RouteInfo.RTN_UNICAST;
                boolean direct = unicast && gateway != null && (peer.equals(gateway) || gateway.isAnyLocalAddress() && prefix >= 16);
                if (prefix > longest) { longest = prefix; allowed = direct; }
                else if (prefix == longest) allowed &= direct;
            }
            if (verified != null && allowed) {
                if (match != null) throw new IOException("ambiguous_wifi_route");
                match = candidate; source = verified;
            }
        }
        if (match != null) return new Route(match, source);
        if (pendingGroupNetwork) return null;
        // Recovered h1.a() fallback: reject VPNs and overlapping ordinary networks before binding the actual group interface.
        for (Network candidate : candidates) {
            NetworkCapabilities caps = connectivity.getNetworkCapabilities(candidate);
            if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) throw new IOException("vpn_route_conflict");
            LinkProperties links = connectivity.getLinkProperties(candidate);
            if (links == null) continue;
            for (LinkAddress address : links.getLinkAddresses()) if (MeterRoute.subnet(address.getAddress(), address.getPrefixLength(), peer)) throw new IOException("competing_wifi_network");
            for (RouteInfo route : links.getRoutes()) if (route.matches(peer) && route.getDestination().getPrefixLength() >= 16) throw new IOException("competing_wifi_route");
        }
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces != null && interfaces.hasMoreElements()) {
            NetworkInterface current = interfaces.nextElement();
            if (!current.isUp() || current.isLoopback()) continue;
            for (InterfaceAddress address : current.getInterfaceAddresses()) if (MeterRoute.subnet(address.getAddress(), address.getNetworkPrefixLength(), peer)) {
                if (!iface.equals(current.getName())) throw new IOException("competing_wifi_interface");
                if (MeterRoute.source(address.getAddress(), address.getNetworkPrefixLength(), peer)) {
                    if (source != null) throw new IOException("ambiguous_wifi_source"); source = address.getAddress();
                }
            }
        }
        return source == null ? null : new Route(null, source);
    }
    boolean valid() { return !closed && engine.generation == generation && engine.material != null; }
    InetAddress owner() throws IOException { check(); return owner; }
    InetAddress local() throws IOException { check(); return local; }
    private void check() throws IOException {
        if (!valid() || owner == null || local == null || groupInterface == null) throw new IOException("wifi_session_expired");
        Route current = resolve(groupInterface, owner);
        if (current == null || !local.equals(current.source) || !java.util.Objects.equals(network, current.network)) throw new IOException("wifi_route_changed");
    }
    Socket socket(int port) throws IOException {
        if (port != 10930 && port != 10950) throw new IOException("port_not_allowed");
        check(); Network selected = network; InetAddress source = local, peer = owner;
        Socket socket = selected == null ? new Socket() : selected.getSocketFactory().createSocket();
        try {
            socket.bind(new InetSocketAddress(source, 0)); socket.connect(new InetSocketAddress(peer, port), 7000); socket.setSoTimeout(15000); check();
            if (!source.equals(socket.getLocalAddress()) || !peer.equals(socket.getInetAddress())) throw new IOException("wifi_socket_route_mismatch");
            return socket;
        }
        catch (IOException error) { socket.close(); throw error; }
    }
    private void fail(String reason) { if (closed) return; close(); handler.post(() -> listener.failed(reason)); }
    @Override public void close() {
        if (closed) return; closed = true; handler.removeCallbacksAndMessages(null);
        if (receiver != null) { try { context.unregisterReceiver(receiver); } catch (RuntimeException ignored) { } receiver = null; }
        if (manager != null && channel != null && initiated) {
            try { manager.cancelConnect(channel, null); manager.removeGroup(channel, null); } catch (RuntimeException ignored) { }
        }
        if (channel != null && Build.VERSION.SDK_INT >= 27) try { channel.close(); } catch (RuntimeException ignored) { }
    }
}
