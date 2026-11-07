package app.geometrypanel.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private, excluded from backups, encrypted with the Android Keystore. Never logs plaintext. */
final class NativeVault {
    private final Context context;
    NativeVault(Context context) { this.context = context.getApplicationContext(); }
    private static final Object KEY_LOCK = new Object();
    private SecretKey key() throws Exception { synchronized (KEY_LOCK) {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        String alias = "geometry_native_v1";
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey(); }
    }
    private AtomicFile file(String name) {
        if (!name.matches("[a-z-]{1,32}")) throw new IllegalArgumentException("vault_name");
        return new AtomicFile(new File(context.getNoBackupFilesDir(), name + ".gcm"));
    }
    void save(String name, String text) throws Exception {
        byte[] plain = text.getBytes(StandardCharsets.UTF_8);
        if (plain.length > limit(name)) throw new IllegalArgumentException("vault_limit");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(("geometry.v1:" + name).getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(plain);
            AtomicFile target = file(name);
            FileOutputStream out = null;
            try { out = target.startWrite(); out.write(1); out.write(cipher.getIV()); out.write(encrypted); target.finishWrite(out); }
            catch (Exception error) { if (out != null) target.failWrite(out); throw error; }
        } finally { Arrays.fill(plain, (byte) 0); }
    }
    String read(String name) throws Exception {
        AtomicFile target = file(name);
        if (!target.getBaseFile().exists()) return null;
        if (target.getBaseFile().length() > limit(name) + 64L) throw new IllegalArgumentException("vault_limit");
        byte[] raw = target.readFully();
        if (raw.length < 30 || raw.length > limit(name) + 64 || raw[0] != 1) throw new IllegalArgumentException("vault_format");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Arrays.copyOfRange(raw, 1, 13)));
        cipher.updateAAD(("geometry.v1:" + name).getBytes(StandardCharsets.UTF_8));
        byte[] plain = cipher.doFinal(raw, 13, raw.length - 13);
        try { return new String(plain, StandardCharsets.UTF_8); } finally { Arrays.fill(plain, (byte) 0); }
    }
    void forget(String name) { file(name).delete(); }
    private static int limit(String name) { return name.equals("background-state") ? 32 * 1024 * 1024 : name.startsWith("background-") ? 2 * 1024 * 1024 : name.startsWith("capture-") ? 65536 : 16384; }
    byte[] identity() throws Exception {
        String text = read("identity");
        if (text != null) return BleProtocol.hex(text, 8);
        byte[] bytes = new byte[8]; new SecureRandom().nextBytes(bytes);
        save("identity", BleProtocol.hex(bytes));
        return bytes;
    }
}
