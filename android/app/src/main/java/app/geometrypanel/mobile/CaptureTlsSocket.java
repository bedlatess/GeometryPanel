package app.geometrypanel.mobile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.ByteBuffer;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLEngineResult;
import javax.net.ssl.SSLParameters;

/** SSLEngine transport replays the sniffed ClientHello without hidden Android socket/FD APIs. */
final class CaptureTlsSocket extends Socket {
    private static final ByteBuffer EMPTY = ByteBuffer.allocate(0);
    private final Socket transport; private final SSLEngine engine; private final InputStream wireIn; private final OutputStream wireOut;
    private final ByteBuffer netIn = ByteBuffer.allocate(131072), plainIn = ByteBuffer.allocate(65536);
    private final Object readLock = new Object(), writeLock = new Object(); private volatile boolean closed;
    CaptureTlsSocket(Socket transport, byte[] prefix, SSLContext context, boolean alpn) throws IOException {
        this.transport = transport; wireIn = transport.getInputStream(); wireOut = transport.getOutputStream();
        engine = context.createSSLEngine(); engine.setUseClientMode(false); engine.setNeedClientAuth(false);
        if (alpn && android.os.Build.VERSION.SDK_INT >= 29) { SSLParameters options = engine.getSSLParameters(); options.setApplicationProtocols(new String[] {"http/1.1"}); engine.setSSLParameters(options); }
        if (prefix.length > netIn.capacity()) throw new IOException(); netIn.put(prefix).flip(); plainIn.clear(); engine.beginHandshake();
        for (int steps = 0; steps < 256; steps++) {
            SSLEngineResult.HandshakeStatus state = engine.getHandshakeStatus();
            if (state == SSLEngineResult.HandshakeStatus.FINISHED || state == SSLEngineResult.HandshakeStatus.NOT_HANDSHAKING) { plainIn.flip(); return; }
            if (state == SSLEngineResult.HandshakeStatus.NEED_TASK) { tasks(); continue; }
            if (state == SSLEngineResult.HandshakeStatus.NEED_WRAP) { wrap(EMPTY.duplicate()); continue; }
            SSLEngineResult result = engine.unwrap(netIn,plainIn);
            if (result.getStatus() == SSLEngineResult.Status.BUFFER_UNDERFLOW) fill();
            else if (result.getStatus() != SSLEngineResult.Status.OK) throw new IOException("tls_handshake_failed");
        }
        throw new IOException("tls_handshake_limit");
    }
    private void tasks() { Runnable task; while ((task = engine.getDelegatedTask()) != null) task.run(); }
    private void fill() throws IOException {
        netIn.compact(); if (!netIn.hasRemaining()) throw new IOException("tls_record_limit");
        int read = wireIn.read(netIn.array(),netIn.position(),netIn.remaining()); if (read == -1) throw new IOException("tls_eof"); netIn.position(netIn.position()+read); netIn.flip();
    }
    private SSLEngineResult wrap(ByteBuffer source) throws IOException {
        synchronized (writeLock) { ByteBuffer network = ByteBuffer.allocate(65536); SSLEngineResult result = engine.wrap(source,network);
            if (result.getStatus() != SSLEngineResult.Status.OK && result.getStatus() != SSLEngineResult.Status.CLOSED) throw new IOException("tls_wrap_failed");
            if (network.position() > 0) { wireOut.write(network.array(),0,network.position()); wireOut.flush(); } tasks(); return result;
        }
    }
    @Override public InputStream getInputStream() { return new InputStream() {
        @Override public int read() throws IOException { byte[] value = new byte[1]; return read(value,0,1) == -1 ? -1 : value[0]&255; }
        @Override public int read(byte[] bytes, int offset, int length) throws IOException {
            if (offset < 0 || length < 0 || offset+length > bytes.length) throw new IndexOutOfBoundsException(); if (length == 0) return 0;
            synchronized (readLock) {
                if (closed) throw new IOException("closed");
                while (!plainIn.hasRemaining()) {
                    plainIn.clear(); SSLEngineResult result = engine.unwrap(netIn,plainIn); tasks();
                    if (result.getHandshakeStatus() == SSLEngineResult.HandshakeStatus.NEED_WRAP) wrap(EMPTY.duplicate());
                    if (result.getStatus() == SSLEngineResult.Status.CLOSED) { plainIn.flip(); if (!plainIn.hasRemaining()) return -1; break; }
                    if (result.getStatus() == SSLEngineResult.Status.BUFFER_OVERFLOW) throw new IOException("tls_plain_limit");
                    plainIn.flip();
                    if (result.getStatus() == SSLEngineResult.Status.BUFFER_UNDERFLOW || result.bytesConsumed() == 0 && result.bytesProduced() == 0) fill();
                }
                int count = Math.min(length,plainIn.remaining()); plainIn.get(bytes,offset,count); return count;
            }
        }
        @Override public void close() throws IOException { CaptureTlsSocket.this.close(); }
    }; }
    @Override public OutputStream getOutputStream() { return new OutputStream() {
        @Override public void write(int value) throws IOException { write(new byte[] {(byte)value},0,1); }
        @Override public void write(byte[] bytes, int offset, int length) throws IOException {
            if (offset < 0 || length < 0 || offset+length > bytes.length) throw new IndexOutOfBoundsException();
            synchronized (writeLock) { if (closed) throw new IOException("closed"); ByteBuffer source = ByteBuffer.wrap(bytes,offset,length);
                while (source.hasRemaining()) { SSLEngineResult result = wrap(source); if (result.getStatus() == SSLEngineResult.Status.CLOSED || result.bytesConsumed() == 0 && result.bytesProduced() == 0) throw new IOException("tls_write_failed"); }
            }
        }
        @Override public void flush() throws IOException { synchronized (writeLock) { wireOut.flush(); } }
        @Override public void close() throws IOException { CaptureTlsSocket.this.close(); }
    }; }
    @Override public synchronized void close() throws IOException { if (!closed) { closed = true; engine.closeOutbound(); transport.close(); } }
    @Override public boolean isClosed() { return closed || transport.isClosed(); }
}
