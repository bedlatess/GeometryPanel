package app.geometrypanel.mobile;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** Explicit, short-lived per-official-app VPN. No disk packet capture, generic proxy or certificate bypass. */
public final class OfficialCaptureService extends VpnService {
    static volatile boolean running;
    private static final int LOCAL = 0x0a010a01;
    private final ExecutorService loops = Executors.newFixedThreadPool(2), upstream = Executors.newFixedThreadPool(16), downstream = Executors.newFixedThreadPool(16), dnsJobs = Executors.newFixedThreadPool(4);
    private final Semaphore connections = new Semaphore(16), dnsSlots = new Semaphore(16);
    private final Set<Socket> sockets = ConcurrentHashMap.newKeySet(); private final Set<DatagramSocket> datagrams = ConcurrentHashMap.newKeySet();
    private final Map<Integer,Flow> ports = new ConcurrentHashMap<>(); private final Map<String,Flow> tuples = new ConcurrentHashMap<>();
    private ParcelFileDescriptor tunnel; private FileOutputStream output; private ServerSocket server; private Network network; private InetAddress resolver; private SSLContext tls;
    private volatile boolean stopped; private long epoch; private int nextPort = 40000;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private static final class Flow {
        final int source, destination, sourcePort, destinationPort, translated; final String key;
        final AtomicBoolean accepted = new AtomicBoolean(); volatile long at = System.currentTimeMillis();
        Flow(int source, int destination, int sourcePort, int destinationPort, int translated, String key) { this.source = source; this.destination = destination; this.sourcePort = sourcePort; this.destinationPort = destinationPort; this.translated = translated; this.key = key; }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "stop".equals(intent.getAction())) { OfficialLogin.stop(this); stopSelf(); return START_NOT_STICKY; }
        if (running) return START_NOT_STICKY;
        if (VpnService.prepare(this) != null) { stopSelf(); return START_NOT_STICKY; }
        epoch = intent.getLongExtra("generation", -1); if (epoch != OfficialLogin.generation()) { stopSelf(); return START_NOT_STICKY; }
        PendingIntent stop = PendingIntent.getService(this, 2281, new Intent(this, OfficialCaptureService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        startForeground(508, NativeNotifications.builder(this, "geometry-device", "临时官方登录捕获", "仅官方 App；不保存流量。最长十分钟，可随时停止。")
                .setOngoing(true).addAction(new android.app.Notification.Action.Builder(null, "停止连接", stop).build()).build());
        running = true; handler.postDelayed(this::stopSelf, 600000);
        loops.execute(() -> { try { open(); } catch (Exception error) { if (!stopped) OfficialLogin.phase = "capture_unavailable"; stopSelf(); } });
        return START_NOT_STICKY;
    }
    private void open() throws Exception {
        check(); ConnectivityManager manager = getSystemService(ConnectivityManager.class); network = manager.getActiveNetwork();
        NetworkCapabilities caps = network == null ? null : manager.getNetworkCapabilities(network); LinkProperties links = network == null ? null : manager.getLinkProperties(network);
        if (caps == null || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || links == null) throw new IOException();
        for (InetAddress address : links.getDnsServers()) if (address instanceof Inet4Address) { resolver = address; break; }
        if (resolver == null) throw new IOException();
        tls = CaptureCertificate.server(this); server = new ServerSocket(0); server.setSoTimeout(2000);
        Builder builder = new Builder().setSession("几何面板临时官方登录").setMtu(2560).addAddress("10.1.10.1",32).addRoute("0.0.0.0",0).addDnsServer("10.1.10.2").addAllowedApplication("com.cfmoto").setBlocking(true).setUnderlyingNetworks(new Network[] {network});
        check(); tunnel = builder.establish(); if (tunnel == null) throw new IOException(); output = new FileOutputStream(tunnel.getFileDescriptor());
        OfficialLogin.phase = "waiting_for_official_h5"; loops.execute(this::accept);
        try (FileInputStream input = new FileInputStream(tunnel.getFileDescriptor())) {
            byte[] buffer = new byte[32767]; int read;
            while (!stopped && (read = input.read(buffer)) != -1) { check(); if (read <= 0) continue; byte[] packet = Arrays.copyOf(buffer,read); try { route(packet); } catch (IOException ignored) { } }
        } finally { stopSelf(); }
    }
    private void route(byte[] packet) throws IOException {
        int h = CapturePackets.header(packet, packet.length), protocol = packet[9]&255;
        if (protocol == 17) { if (CapturePackets.u16(packet,h+2) == 53 && dnsSlots.tryAcquire()) dnsJobs.execute(() -> dns(packet,h)); return; }
        if (protocol != 6) return;
        int sourcePort = CapturePackets.u16(packet,h), destinationPort = CapturePackets.u16(packet,h+2), source = CapturePackets.ip(packet,12), destination = CapturePackets.ip(packet,16);
        if (source == LOCAL && sourcePort == server.getLocalPort()) {
            Flow flow = ports.get(destinationPort); if (flow == null || destination != flow.destination) return; flow.at = System.currentTimeMillis();
            write(CapturePackets.tcp(packet,flow.destination,flow.source,flow.destinationPort,flow.sourcePort)); return;
        }
        // DNS-over-TLS, QUIC and other UDP are deliberately unavailable in this temporary per-app tunnel.
        if (source != LOCAL || destinationPort == 853) return;
        String key = source + ":" + sourcePort + ":" + destination + ":" + destinationPort;
        Flow flow = tuples.get(key);
        if (flow == null) {
            if ((packet[h+13]&2) == 0) return;
            prune(); if (ports.size() >= 256) return;
            int translated = port(); flow = new Flow(source,destination,sourcePort,destinationPort,translated,key); ports.put(translated,flow); tuples.put(key,flow);
        }
        flow.at = System.currentTimeMillis(); write(CapturePackets.tcp(packet,flow.destination,LOCAL,flow.translated,server.getLocalPort()));
    }
    private int port() throws IOException { for (int i = 0; i < 24000; i++) { int value = nextPort++; if (nextPort > 65000) nextPort = 40000; if (value != server.getLocalPort() && !ports.containsKey(value)) return value; } throw new IOException(); }
    private void prune() { long now = System.currentTimeMillis(); for (Flow flow : ports.values()) if (now-flow.at > 180000) { ports.remove(flow.translated,flow); tuples.remove(flow.key,flow); } }
    private void dns(byte[] query, int h) {
        try (DatagramSocket socket = new DatagramSocket()) {
            datagrams.add(socket); check(); if (!protect(socket)) throw new IOException(); network.bindSocket(socket); socket.connect(resolver,53); socket.setSoTimeout(5000);
            byte[] bytes = Arrays.copyOfRange(query,h+8,query.length); if (bytes.length < 12 || bytes.length > 4096) return;
            socket.send(new DatagramPacket(bytes,bytes.length)); byte[] answer = new byte[4096]; DatagramPacket result = new DatagramPacket(answer,answer.length); socket.receive(result); check();
            write(CapturePackets.dnsReply(query,Arrays.copyOf(answer,result.getLength())));
        } catch (Exception ignored) { } finally { datagrams.removeIf(DatagramSocket::isClosed); dnsSlots.release(); }
    }
    private void accept() {
        while (!stopped) {
            try {
                Socket client = server.accept(); Flow flow = ports.get(client.getPort());
                if (flow == null || !(client.getInetAddress() instanceof Inet4Address) || CapturePackets.ip(client.getInetAddress().getAddress(),0) != flow.destination || !connections.tryAcquire()) { client.close(); continue; }
                if (!flow.accepted.compareAndSet(false,true)) { connections.release(); client.close(); continue; }
                sockets.add(client); upstream.execute(() -> proxy(client,flow));
            } catch (java.net.SocketTimeoutException ignored) { }
            catch (Exception error) { if (!stopped) stopSelf(); return; }
        }
    }
    private void proxy(Socket accepted, Flow flow) {
        Socket remote = new Socket(), client = accepted; sockets.add(remote);
        try {
            check(); if (!protect(remote)) throw new IOException(); network.bindSocket(remote); remote.connect(new InetSocketAddress(CapturePackets.address(flow.destination),flow.destinationPort),10000); remote.setSoTimeout(30000); accepted.setSoTimeout(30000);
            CaptureHttp observer = null;
            if (flow.destinationPort == 443) {
                CaptureTls.Hello hello = CaptureTls.read(accepted.getInputStream());
                if (hello.target) {
                    SSLSocket trusted = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(remote,"h5.zeehoev.com",443,true);
                    SSLParameters parameters = trusted.getSSLParameters(); parameters.setEndpointIdentificationAlgorithm("HTTPS"); parameters.setServerNames(java.util.Collections.singletonList(new SNIHostName("h5.zeehoev.com"))); if (Build.VERSION.SDK_INT >= 29) parameters.setApplicationProtocols(new String[] {"http/1.1"}); trusted.setSSLParameters(parameters); trusted.startHandshake();
                    CaptureTlsSocket local = new CaptureTlsSocket(accepted,hello.prefix,tls,Build.VERSION.SDK_INT >= 29);
                    client = local; remote = trusted; sockets.add(local); sockets.add(trusted);
                    observer = new CaptureHttp((token,uid) -> OfficialLogin.offer(this,epoch,token,uid));
                } else { remote.getOutputStream().write(hello.prefix); remote.getOutputStream().flush(); }
            }
            Socket toClient = client, toServer = remote; CaptureHttp capture = observer;
            downstream.execute(() -> { try { pipe(toServer.getInputStream(),toClient.getOutputStream(),capture,true,flow); } catch (Exception ignored) { }
                finally { close(toClient); close(toServer); } });
            try { pipe(toClient.getInputStream(),toServer.getOutputStream(),capture,false,flow); }
            finally { close(toClient); close(toServer); }
        } catch (Exception ignored) { /* Certificate/pinning failures never disable upstream validation or persist packet data. */ }
        finally { close(client); close(remote); close(accepted); sockets.removeIf(Socket::isClosed); ports.remove(flow.translated,flow); tuples.remove(flow.key,flow); connections.release(); }
    }
    private void pipe(InputStream input, OutputStream destination, CaptureHttp observer, boolean response, Flow flow) throws IOException {
        byte[] block = new byte[16384]; int read;
        while ((read = input.read(block)) != -1) { check(); flow.at = System.currentTimeMillis(); if (observer != null) observer.feed(response,block,read); destination.write(block,0,read); destination.flush(); }
        if (observer != null) observer.eof(response);
    }
    private void write(byte[] packet) throws IOException { synchronized (this) { check(); if (output == null) throw new IOException(); output.write(packet); } }
    private void check() throws IOException { if (stopped || epoch != OfficialLogin.generation() || Thread.currentThread().isInterrupted()) throw new IOException("cancelled"); }
    private void close(Socket socket) { try { socket.close(); } catch (IOException ignored) { } sockets.remove(socket); }
    @Override public void onRevoke() { OfficialLogin.stop(this); stopSelf(); super.onRevoke(); }
    @Override public void onTimeout(int startId, int fgsType) { stopSelf(); }
    @Override public void onDestroy() {
        stopped = true; running = false; handler.removeCallbacksAndMessages(null);
        OfficialLogin.captureStopped(epoch);
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        for (Socket socket : sockets) close(socket); for (DatagramSocket socket : datagrams) socket.close();
        try { if (tunnel != null) tunnel.close(); } catch (IOException ignored) { }
        loops.shutdownNow(); upstream.shutdownNow(); downstream.shutdownNow(); dnsJobs.shutdownNow(); ports.clear(); tuples.clear();
        if (!OfficialLogin.phase.equals("captured") && !OfficialLogin.phase.equals("imported") && !OfficialLogin.phase.equals("capture_unavailable")) OfficialLogin.phase = "stopped";
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}
