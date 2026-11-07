package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.util.Base64;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManagerFactory;
import org.json.JSONObject;
import org.junit.Test;

public class CaptureTlsSocketTest {
    @Test(timeout=15000) public void localTlsHandshakeReplaysTheSniffedHelloAndRelaysPlaintext() throws Exception {
        JSONObject material = CaptureCertificate.generate(); SSLContext serverContext = CaptureCertificate.context(material);
        KeyStore trust = KeyStore.getInstance(KeyStore.getDefaultType()); trust.load(null); trust.setCertificateEntry("local-ca",CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(Base64.getDecoder().decode(material.getString("ca")))));
        TrustManagerFactory manager = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); manager.init(trust); SSLContext clientContext = SSLContext.getInstance("TLS"); clientContext.init(null,manager.getTrustManagers(),null);
        java.util.concurrent.ExecutorService worker = Executors.newSingleThreadExecutor();
        try (ServerSocket listener = new ServerSocket(0,1,java.net.InetAddress.getLoopbackAddress())) {
            java.util.concurrent.Future<Boolean> accepted = worker.submit(() -> {
                try (Socket socket = listener.accept()) { socket.setSoTimeout(5000); CaptureTls.Hello hello = CaptureTls.read(socket.getInputStream());
                    if (!hello.target) return false;
                    try (CaptureTlsSocket tls = new CaptureTlsSocket(socket,hello.prefix,serverContext,false)) { byte[] request = MeterProtocol.read(tls.getInputStream(),4,4); if (!"ping".equals(new String(request,StandardCharsets.US_ASCII))) return false; tls.getOutputStream().write("pong".getBytes(StandardCharsets.US_ASCII)); return true; }
                }
            });
            try (Socket wire = new Socket(java.net.InetAddress.getLoopbackAddress(),listener.getLocalPort()); SSLSocket client = (SSLSocket)clientContext.getSocketFactory().createSocket(wire,"h5.zeehoev.com",listener.getLocalPort(),true)) {
                client.setSoTimeout(5000); SSLParameters options = client.getSSLParameters(); options.setEndpointIdentificationAlgorithm("HTTPS"); options.setServerNames(java.util.List.of(new SNIHostName("h5.zeehoev.com"))); client.setSSLParameters(options); client.startHandshake(); client.getOutputStream().write("ping".getBytes(StandardCharsets.US_ASCII)); assertEquals("pong",new String(MeterProtocol.read(client.getInputStream(),4,4),StandardCharsets.US_ASCII));
            }
            assertTrue(accepted.get(5,TimeUnit.SECONDS));
        } finally { worker.shutdownNow(); }
        assertFalse(CaptureTls.target(new byte[100]));
    }
}
