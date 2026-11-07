package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.Test;

public class WallpaperArchiveTest {
    private byte[] png() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); output.write(new byte[] {(byte)137,80,78,71,13,10,26,10});
        ByteArrayOutputStream header = new ByteArrayOutputStream(); DataOutputStream h = new DataOutputStream(header);
        h.writeInt(2); h.writeInt(1); h.write(new byte[] {8,2,0,0,0}); chunk(output, "IHDR", header.toByteArray());
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(compressed)) { deflater.write(new byte[] {0,(byte)255,0,0,0,(byte)255,0}); }
        chunk(output, "IDAT", compressed.toByteArray()); chunk(output, "IEND", new byte[0]); return output.toByteArray();
    }
    private void chunk(ByteArrayOutputStream output, String name, byte[] bytes) throws Exception {
        DataOutputStream data = new DataOutputStream(output); byte[] type = name.getBytes(StandardCharsets.US_ASCII);
        data.writeInt(bytes.length); data.write(type); data.write(bytes); CRC32 crc = new CRC32(); crc.update(type); crc.update(bytes); data.writeInt((int) crc.getValue());
    }
    private byte[] zip(String first, String second) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            for (String name : new String[] { first, second }) { ZipEntry entry = new ZipEntry(name); entry.setTime(1609459200000L); zip.putNextEntry(entry); zip.write(png()); zip.closeEntry(); }
        }
        return output.toByteArray();
    }
    private File file(byte[] bytes) throws Exception { File file = File.createTempFile("synthetic-wallpaper-", ".zip"); Files.write(file.toPath(), bytes); return file; }
    @Test public void twoGeneratedImagesPassTheirActualTemplateAndMismatchFails() throws Exception {
        File file = file(zip("1.png", "2.png"));
        try { assertTrue(WallpaperArchive.validate(file, 2, 1).matches("[a-f0-9]{32}")); assertThrows(Exception.class, () -> WallpaperArchive.validate(file, 800, 480)); }
        finally { file.delete(); }
    }
    @Test public void pngCrcAndHiddenTrailingDataAreChecked() throws Exception {
        byte[] valid = png(); WallpaperArchive.validatePng(valid, 2, 1);
        byte[] corrupt = valid.clone(); corrupt[corrupt.length - 1]++;
        assertThrows(Exception.class, () -> WallpaperArchive.validatePng(corrupt, 2, 1));
        assertThrows(Exception.class, () -> WallpaperArchive.validatePng(Arrays.copyOf(valid, valid.length + 1), 2, 1));
    }
    @Test public void archivesCannotEscapeRootCarryHiddenBytesOrSymlinks() throws Exception {
        assertThrows(Exception.class, () -> WallpaperArchive.checkContainer(zip("../1.png", "2.png")));
        byte[] valid = zip("1.png", "2.png");
        assertThrows(Exception.class, () -> WallpaperArchive.checkContainer(Arrays.copyOf(valid, valid.length + 1)));
        ByteBuffer central = ByteBuffer.wrap(valid).order(ByteOrder.LITTLE_ENDIAN);
        int directory = central.getInt(valid.length - 22 + 16); central.putInt(directory + 38, 0120000 << 16);
        assertThrows(Exception.class, () -> WallpaperArchive.checkContainer(valid));
    }
    @Test public void duplicateMemberNamesCannotHideBehindDifferentLocalHeaders() throws Exception {
        byte[] valid = zip("1.png", "2.png");
        for (int i = 0; i < valid.length - 5; i++) if (valid[i] == '2' && valid[i + 1] == '.' && valid[i + 2] == 'p' && valid[i + 3] == 'n' && valid[i + 4] == 'g') valid[i] = '1';
        assertThrows(Exception.class, () -> WallpaperArchive.checkContainer(valid));
    }
}
