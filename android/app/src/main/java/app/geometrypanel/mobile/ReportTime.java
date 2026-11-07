package app.geometrypanel.mobile;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Only the recovered refreshTime field is supplied by callers; no arbitrary timestamp aliases. */
final class ReportTime {
    private static final Pattern DATE = Pattern.compile("^(\\d{4})[-./年](\\d{1,2})[-./月](\\d{1,2})日?[ T](\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?(Z|[+-]\\d{2}:?\\d{2})?$", Pattern.CASE_INSENSITIVE);
    private ReportTime() { }
    static long parse(Object value) {
        if (!(value instanceof String) && !(value instanceof Number)) return 0;
        String text = String.valueOf(value).trim();
        try {
            if (text.matches("(?:\\d{10}|\\d{12,13})")) { long at = Long.parseLong(text) * (text.length() == 10 ? 1000L : 1L); return at >= 946684800000L ? at : 0; }
            Matcher match = DATE.matcher(text); if (!match.matches()) return 0;
            int year = Integer.parseInt(match.group(1)); if (year < 2000) return 0;
            String fraction = match.group(7) == null ? "" : match.group(7); while (fraction.length() < 3) fraction += "0";
            LocalDateTime date = LocalDateTime.of(year,Integer.parseInt(match.group(2)),Integer.parseInt(match.group(3)),Integer.parseInt(match.group(4)),Integer.parseInt(match.group(5)),match.group(6) == null ? 0 : Integer.parseInt(match.group(6)),Integer.parseInt(fraction) * 1000000);
            String zone = match.group(8); ZoneOffset offset = zone == null ? ZoneOffset.ofHours(8) : ZoneOffset.of(zone.equalsIgnoreCase("z") ? "Z" : zone);
            return date.toInstant(offset).toEpochMilli();
        } catch (RuntimeException ignored) { return 0; }
    }
    static String state(long at, long now) { return at <= 0 ? "unknown" : at - now > 300000 ? "future" : now - at > 1800000 ? "stale" : "fresh"; }
}
