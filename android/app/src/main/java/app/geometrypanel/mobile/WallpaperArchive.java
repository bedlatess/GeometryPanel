package app.geometrypanel.mobile;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Deliberately narrow ZIP container: exactly 1.png and 2.png, no hidden members or paths. */
final class WallpaperArchive {
    static final int MAX = 16 * 1024 * 1024;
    private WallpaperArchive() { }
    static String validate(File file, int expectedWidth, int expectedHeight) throws Exception {
        if (file.length() < 22 || file.length() > MAX) throw new IOException("zip_size");
        byte[] raw;
        try (FileInputStream input = new FileInputStream(file)) { raw = MeterProtocol.read(input, (int) file.length(), MAX); }
        checkContainer(raw);
        long total = 0;
        try (ZipFile zip = new ZipFile(file)) {
            if (zip.size() != 2) throw new IOException("zip_members");
            for (String name : new String[] { "1.png", "2.png" }) {
                ZipEntry entry = zip.getEntry(name);
                if (entry == null || entry.isDirectory() || entry.getSize() < 1 || entry.getSize() > MAX || entry.getCompressedSize() < 1
                        || entry.getSize() > entry.getCompressedSize() * 200) throw new IOException("zip_ratio_or_size");
                byte[] image;
                try (InputStream input = zip.getInputStream(entry)) { image = bounded(input, MAX); }
                total += image.length;
                CRC32 crc = new CRC32(); crc.update(image);
                if (total > 2L * MAX || image.length != entry.getSize() || crc.getValue() != entry.getCrc()) throw new IOException("zip_crc");
                validatePng(image, expectedWidth, expectedHeight);
            }
        }
        return BleProtocol.hex(MessageDigest.getInstance("MD5").digest(raw));
    }
    static byte[] bounded(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) >= 0) { if (count == 0) continue; if (out.size() + count > limit) throw new IOException("file_limit"); out.write(buffer, 0, count); }
        return out.toByteArray();
    }
    private static long u32(ByteBuffer b, int at) throws IOException { if (at < 0 || at + 4 > b.limit()) throw new IOException("zip_bounds"); return b.getInt(at) & 0xffffffffL; }
    private static int u16(ByteBuffer b, int at) throws IOException { if (at < 0 || at + 2 > b.limit()) throw new IOException("zip_bounds"); return b.getShort(at) & 65535; }
    static void checkContainer(byte[] raw) throws IOException {
        ByteBuffer b = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN); int end = raw.length - 22;
        // Comments, multi-disk and ZIP64 are unnecessary for two images and are rejected.
        if (u32(b, end) != 0x06054b50L || u16(b, end + 20) != 0 || u16(b, end + 4) != 0 || u16(b, end + 6) != 0
                || u16(b, end + 8) != 2 || u16(b, end + 10) != 2) throw new IOException("zip_directory");
        long cdSize = u32(b, end + 12), cdOffset = u32(b, end + 16);
        if (cdOffset + cdSize != end || cdOffset > end) throw new IOException("zip_directory_bounds");
        int cursor = (int) cdOffset, nextLocal = 0; Set<String> names = new HashSet<>();
        for (int i = 0; i < 2; i++) {
            if (u32(b, cursor) != 0x02014b50L || cursor + 46 > end) throw new IOException("zip_central");
            int needed = u16(b, cursor + 6), flags = u16(b, cursor + 8), method = u16(b, cursor + 10);
            long crc = u32(b, cursor + 16), packed = u32(b, cursor + 20), unpacked = u32(b, cursor + 24), local = u32(b, cursor + 42);
            int nameSize = u16(b, cursor + 28), extra = u16(b, cursor + 30), comment = u16(b, cursor + 32);
            long attributes = u32(b, cursor + 38); int unixMode = (int) (attributes >>> 16) & 0170000;
            if (needed > 20 || (flags & ~0x0808) != 0 || method != 0 && method != 8 || nameSize != 5 || extra != 0 || comment != 0
                    || u16(b, cursor + 34) != 0 || (attributes & 16) != 0 || unixMode != 0 && unixMode != 0100000
                    || packed < 1 || unpacked < 1 || packed > MAX || unpacked > MAX || unpacked > packed * 200 || local != nextLocal) throw new IOException("zip_entry");
            if (cursor + 46 + nameSize > end) throw new IOException("zip_name");
            String name = new String(raw, cursor + 46, nameSize, StandardCharsets.US_ASCII);
            if ((!name.equals("1.png") && !name.equals("2.png")) || !names.add(name)) throw new IOException("zip_names");
            int at = nextLocal;
            if (u32(b, at) != 0x04034b50L || u16(b, at + 4) != needed || u16(b, at + 6) != flags || u16(b, at + 8) != method
                    || u16(b, at + 26) != 5 || u16(b, at + 28) != 0 || at + 35 > cdOffset
                    || !name.equals(new String(raw, at + 30, 5, StandardCharsets.US_ASCII))) throw new IOException("zip_local");
            long dataEnd = at + 35L + packed;
            if (dataEnd > cdOffset) throw new IOException("zip_overlap");
            if ((flags & 8) == 0) {
                if (u32(b, at + 14) != crc || u32(b, at + 18) != packed || u32(b, at + 22) != unpacked) throw new IOException("zip_local_size");
                nextLocal = (int) dataEnd;
            } else {
                int descriptor = (int) dataEnd;
                if (u32(b, descriptor) == 0x08074b50L) descriptor += 4;
                if (u32(b, descriptor) != crc || u32(b, descriptor + 4) != packed || u32(b, descriptor + 8) != unpacked || descriptor + 12 > cdOffset) throw new IOException("zip_descriptor");
                nextLocal = descriptor + 12;
            }
            cursor += 51;
        }
        if (cursor != end || nextLocal != cdOffset) throw new IOException("zip_hidden_data");
    }
    static void validatePng(byte[] raw, int width, int height) throws IOException {
        if (raw.length < 57 || raw.length > MAX || !java.util.Arrays.equals(java.util.Arrays.copyOf(raw, 8), new byte[] {(byte)137,80,78,71,13,10,26,10})) throw new IOException("png_signature");
        ByteBuffer b = ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN); int cursor = 8, chunks = 0; boolean ihdr = false, idat = false, ended = false, palette = false, idatEnded = false; int color = -1;
        while (cursor < raw.length) {
            if (++chunks > 4096 || cursor + 12 > raw.length) throw new IOException("png_chunk");
            int length = b.getInt(cursor);
            if (length < 0 || length > MAX || cursor + 12L + length > raw.length) throw new IOException("png_bounds");
            String type = new String(raw, cursor + 4, 4, StandardCharsets.US_ASCII);
            if (!type.matches("[A-Za-z]{4}") || !Character.isUpperCase(type.charAt(2))) throw new IOException("png_type");
            CRC32 crc = new CRC32(); crc.update(raw, cursor + 4, length + 4);
            if (crc.getValue() != (b.getInt(cursor + length + 8) & 0xffffffffL)) throw new IOException("png_crc");
            if (!ihdr && !type.equals("IHDR")) throw new IOException("png_header_first");
            switch (type) {
                case "IHDR":
                    if (ihdr || length != 13) throw new IOException("png_header");
                    int w = b.getInt(cursor + 8), h = b.getInt(cursor + 12), depth = raw[cursor + 16] & 255; color = raw[cursor + 17] & 255;
                    boolean validDepth = color == 0 && (depth == 1 || depth == 2 || depth == 4 || depth == 8 || depth == 16)
                            || color == 3 && (depth == 1 || depth == 2 || depth == 4 || depth == 8) || (color == 2 || color == 4 || color == 6) && (depth == 8 || depth == 16);
                    if (w < 1 || h < 1 || w > 8192 || h > 8192 || (long) w * h > 16777216 || width > 0 && w != width || height > 0 && h != height
                            || !validDepth || raw[cursor + 18] != 0 || raw[cursor + 19] != 0 || (raw[cursor + 20] & 255) > 1) throw new IOException("png_dimensions_or_format");
                    ihdr = true; break;
                case "PLTE": if (palette || idat || color == 0 || color == 4 || length < 3 || length > 768 || length % 3 != 0) throw new IOException("png_palette"); palette = true; break;
                case "IDAT": if (idatEnded || color == 3 && !palette) throw new IOException("png_data_order"); idat = true; break;
                case "IEND": if (!idat || length != 0 || cursor + 12 != raw.length) throw new IOException("png_end"); ended = true; break;
                default: if (Character.isUpperCase(type.charAt(0))) throw new IOException("png_unknown_critical"); if (idat) idatEnded = true;
            }
            cursor += length + 12;
        }
        if (!ended) throw new IOException("png_missing_end");
    }
}
